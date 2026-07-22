import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { apiCallApi, getApiCallErrorMessage, modelsApi, providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ProviderKeyConfig } from '@/types';
import { buildHeaderObject, hasHeader, headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { areKeyValueEntriesEqual, areModelEntriesEqual, areStringArraysEqual } from '@/utils/compare';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import {
  buildCodexResponsesEndpoint,
  excludedModelsToText,
  parseExcludedModels,
} from '@/components/providers/utils';
import type { ProviderFormState } from '@/components/providers';
import type { ModelInfo } from '@/utils/models';
import layoutStyles from './AiProvidersEditLayout.module.scss';
import styles from './AiProvidersPage.module.scss';

const CODEX_TEST_TIMEOUT_MS = 30_000;

type ModelTestStatus = 'loading' | 'success';
type ConnectivityTestStatus = 'idle' | 'loading' | 'success' | 'error';

function StatusLoadingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.statusIconSpin}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M8 1A7 7 0 0 1 8 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusSuccessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="var(--success-color, #22c55e)" />
      <path
        d="M4.5 8L7 10.5L11.5 6"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIcon({ status }: { status: ModelTestStatus }) {
  if (status === 'loading') return <StatusLoadingIcon />;
  return <StatusSuccessIcon />;
}

type LocationState = { fromAiProviders?: boolean } | null;

const buildEmptyForm = (): ProviderFormState => ({
  apiKey: '',
  priority: undefined,
  prefix: '',
  baseUrl: '',
  websockets: false,
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
});

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const normalizeModelEntries = (entries: Array<{ name: string; alias: string }>) =>
  (entries ?? []).reduce<Array<{ name: string; alias: string }>>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name && alias === name) {
      alias = '';
    }
    if (!name && !alias) return acc;
    acc.push({ name, alias });
    return acc;
  }, []);

type CodexFormBaseline = {
  apiKey: string;
  priority: number | null;
  prefix: string;
  baseUrl: string;
  websockets: boolean;
  proxyUrl: string;
  headers: ReturnType<typeof normalizeHeaderEntries>;
  models: ReturnType<typeof normalizeModelEntries>;
  excludedModels: string[];
};

const buildCodexBaseline = (form: ProviderFormState): CodexFormBaseline => ({
  apiKey: String(form.apiKey ?? '').trim(),
  priority:
    form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
  prefix: String(form.prefix ?? '').trim(),
  baseUrl: String(form.baseUrl ?? '').trim(),
  websockets: Boolean(form.websockets),
  proxyUrl: String(form.proxyUrl ?? '').trim(),
  headers: normalizeHeaderEntries(form.headers),
  models: normalizeModelEntries(form.modelEntries),
  excludedModels: parseExcludedModels(form.excludedText ?? ''),
});

export function AiProvidersCodexEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();

  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [configs, setConfigs] = useState<ProviderKeyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ProviderFormState>(() => buildEmptyForm());
  const [baseline, setBaseline] = useState(() => buildCodexBaseline(buildEmptyForm()));

  const [modelDiscoveryOpen, setModelDiscoveryOpen] = useState(false);
  const [modelDiscoveryEndpoint, setModelDiscoveryEndpoint] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([]);
  const [modelDiscoveryFetching, setModelDiscoveryFetching] = useState(false);
  const [modelDiscoveryError, setModelDiscoveryError] = useState('');
  const [modelDiscoverySearch, setModelDiscoverySearch] = useState('');
  const [modelDiscoverySelected, setModelDiscoverySelected] = useState<Set<string>>(new Set());
  const autoFetchSignatureRef = useRef<string>('');
  const modelDiscoveryRequestIdRef = useRef(0);

  const [testModel, setTestModel] = useState('');
  const [testStatus, setTestStatus] = useState<ConnectivityTestStatus>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, ModelTestStatus>>({});
  const skipConnectivityResetRef = useRef(false);

  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialData;

  const title =
    editIndex !== null
      ? t('ai_providers.codex_edit_modal_title')
      : t('ai_providers.codex_add_modal_title');

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchConfig('codex-api-key')
      .then((value) => {
        if (cancelled) return;
        setConfigs(Array.isArray(value) ? (value as ProviderKeyConfig[]) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(message || t('notification.refresh_failed'));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchConfig, t]);

  useEffect(() => {
    if (loading) return;

    if (initialData) {
      const nextForm: ProviderFormState = {
        ...initialData,
        websockets: Boolean(initialData.websockets),
        headers: headersToEntries(initialData.headers),
        modelEntries: modelsToEntries(initialData.models),
        excludedText: excludedModelsToText(initialData.excludedModels),
      };
      setForm(nextForm);
      setBaseline(buildCodexBaseline(nextForm));
      return;
    }
    const nextForm = buildEmptyForm();
    setForm(nextForm);
    setBaseline(buildCodexBaseline(nextForm));
  }, [initialData, loading]);

  const normalizedHeaders = useMemo(() => normalizeHeaderEntries(form.headers), [form.headers]);
  const normalizedModels = useMemo(
    () => normalizeModelEntries(form.modelEntries),
    [form.modelEntries]
  );
  const normalizedExcludedModels = useMemo(
    () => parseExcludedModels(form.excludedText ?? ''),
    [form.excludedText]
  );
  const normalizedPriority = useMemo(() => {
    return form.priority !== undefined && Number.isFinite(form.priority)
      ? Math.trunc(form.priority)
      : null;
  }, [form.priority]);
  const isHeadersDirty = useMemo(
    () => !areKeyValueEntriesEqual(baseline.headers, normalizedHeaders),
    [baseline.headers, normalizedHeaders]
  );
  const isModelsDirty = useMemo(
    () => !areModelEntriesEqual(baseline.models, normalizedModels),
    [baseline.models, normalizedModels]
  );
  const isExcludedModelsDirty = useMemo(
    () => !areStringArraysEqual(baseline.excludedModels, normalizedExcludedModels),
    [baseline.excludedModels, normalizedExcludedModels]
  );
  const isDirty =
    baseline.apiKey !== form.apiKey.trim() ||
    baseline.priority !== normalizedPriority ||
    baseline.prefix !== String(form.prefix ?? '').trim() ||
    baseline.baseUrl !== String(form.baseUrl ?? '').trim() ||
    baseline.websockets !== Boolean(form.websockets) ||
    baseline.proxyUrl !== String(form.proxyUrl ?? '').trim() ||
    isHeadersDirty ||
    isModelsDirty ||
    isExcludedModelsDirty;
  const canGuard = !loading && !saving && !invalidIndexParam && !invalidIndex;

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: canGuard,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const canSave =
    !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex && !isTesting;

  const availableModels = useMemo(
    () =>
      form.modelEntries
        .map((entry) => entry.name.trim())
        .filter((name, index, arr) => Boolean(name) && arr.indexOf(name) === index),
    [form.modelEntries]
  );
  const hasConfiguredModels = availableModels.length > 0;
  const hasCustomAuthorization = useMemo(() => {
    const headers = buildHeaderObject(form.headers);
    return hasHeader(headers, 'authorization');
  }, [form.headers]);
  const hasTestableKey = Boolean(form.apiKey.trim()) || hasCustomAuthorization;
  const modelSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    return form.modelEntries.reduce<Array<{ value: string; label: string }>>((acc, entry) => {
      const name = entry.name.trim();
      if (!name || seen.has(name)) return acc;
      seen.add(name);
      const alias = entry.alias.trim();
      acc.push({
        value: name,
        label: alias && alias !== name ? `${name} (${alias})` : name,
      });
      return acc;
    }, []);
  }, [form.modelEntries]);

  const connectivityConfigSignature = useMemo(() => {
    const headersSignature = form.headers
      .map((entry) => `${entry.key.trim()}:${entry.value.trim()}`)
      .join('|');
    const modelsSignature = form.modelEntries
      .map((entry) => `${entry.name.trim()}:${entry.alias.trim()}`)
      .join('|');
    return [
      form.apiKey.trim(),
      String(form.baseUrl ?? '').trim(),
      testModel.trim(),
      headersSignature,
      modelsSignature,
    ].join('||');
  }, [form.apiKey, form.baseUrl, form.headers, form.modelEntries, testModel]);
  const previousConnectivityConfigRef = useRef(connectivityConfigSignature);

  useEffect(() => {
    if (!testModel && availableModels.length) {
      setTestModel(availableModels[0]);
      return;
    }
    if (testModel && !availableModels.includes(testModel)) {
      setTestModel(availableModels[0] ?? '');
    }
  }, [availableModels, testModel]);

  useEffect(() => {
    if (previousConnectivityConfigRef.current === connectivityConfigSignature) {
      return;
    }
    previousConnectivityConfigRef.current = connectivityConfigSignature;
    if (skipConnectivityResetRef.current) {
      skipConnectivityResetRef.current = false;
      return;
    }
    setModelTestStatuses({});
    setTestStatus('idle');
    setTestMessage('');
  }, [connectivityConfigSignature]);

  const removeModelEntryByName = useCallback(
    (modelName: string) => {
      const normalizedModelName = modelName.trim();
      if (!normalizedModelName) return;

      const next = form.modelEntries.filter((entry) => entry.name.trim() !== normalizedModelName);
      const nextModelEntries = next.length ? next : [{ name: '', alias: '' }];
      const nextTestModel =
        nextModelEntries.find((entry) => entry.name.trim())?.name.trim() ?? '';

      skipConnectivityResetRef.current = true;
      setForm((prev) => ({
        ...prev,
        modelEntries: nextModelEntries,
      }));
      setModelTestStatuses((prev) => {
        const nextStatuses = { ...prev };
        delete nextStatuses[normalizedModelName];
        return nextStatuses;
      });
      setTestModel(nextTestModel);
    },
    [form.modelEntries]
  );

  const selectNextModel = useCallback(
    (currentModelName: string) => {
      const modelNames = form.modelEntries.map((entry) => entry.name.trim()).filter(Boolean);
      const currentIndex = modelNames.findIndex((name) => name === currentModelName.trim());
      const nextModel = currentIndex >= 0 ? modelNames[currentIndex + 1] : modelNames[0];
      if (nextModel) {
        skipConnectivityResetRef.current = true;
        setTestModel(nextModel);
      }
    },
    [form.modelEntries]
  );

  const runSingleConnectivityTest = useCallback(async () => {
    if (isTesting) return;

    const baseUrl = String(form.baseUrl ?? '').trim();
    if (!baseUrl) {
      const message = t('ai_providers.codex_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const endpoint = buildCodexResponsesEndpoint(baseUrl);
    if (!endpoint) {
      const message = t('ai_providers.codex_test_endpoint_invalid');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelName = testModel.trim() || availableModels[0] || '';
    if (!modelName) {
      const message = t('ai_providers.codex_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const customHeaders = buildHeaderObject(form.headers);
    const apiKey = form.apiKey.trim();
    if (!apiKey && !hasHeader(customHeaders, 'authorization')) {
      const message = t('ai_providers.codex_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTesting(true);
    setTestStatus('loading');
    setTestMessage(t('ai_providers.codex_test_running'));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };
      if (!hasHeader(headers, 'authorization') && apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const result = await apiCallApi.request(
        {
          method: 'POST',
          url: endpoint,
          header: Object.keys(headers).length ? headers : undefined,
          data: JSON.stringify({
            model: modelName,
            input: 'Hi',
            max_output_tokens: 5,
            stream: false,
          }),
        },
        { timeout: CODEX_TEST_TIMEOUT_MS }
      );

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }

      const message = t('ai_providers.codex_test_success');
      setTestStatus('success');
      setTestMessage(message);
      showNotification(message, 'success');
      selectNextModel(modelName);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      const errorCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      const isTimeout = errorCode === 'ECONNABORTED' || message.toLowerCase().includes('timeout');
      const resolvedMessage = isTimeout
        ? t('ai_providers.codex_test_timeout', { seconds: CODEX_TEST_TIMEOUT_MS / 1000 })
        : `${t('ai_providers.codex_test_failed')}: ${message || t('common.unknown_error')}`;
      setTestStatus('error');
      setTestMessage(resolvedMessage);
      showNotification(resolvedMessage, 'error');
      removeModelEntryByName(modelName);
    } finally {
      setIsTesting(false);
    }
  }, [
    availableModels,
    form.apiKey,
    form.baseUrl,
    form.headers,
    isTesting,
    removeModelEntryByName,
    selectNextModel,
    showNotification,
    t,
    testModel,
  ]);

  const testAllModels = useCallback(async () => {
    if (isTesting) return;

    const baseUrl = String(form.baseUrl ?? '').trim();
    if (!baseUrl) {
      const message = t('ai_providers.codex_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const endpoint = buildCodexResponsesEndpoint(baseUrl);
    if (!endpoint) {
      const message = t('ai_providers.codex_test_endpoint_invalid');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const customHeaders = buildHeaderObject(form.headers);
    const apiKey = form.apiKey.trim();
    if (!apiKey && !hasHeader(customHeaders, 'authorization')) {
      const message = t('ai_providers.codex_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelEntries = form.modelEntries.filter((entry) => entry.name.trim());
    if (modelEntries.length === 0) {
      const message = t('ai_providers.codex_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTesting(true);
    setTestStatus('loading');

    const initialStatuses = modelEntries.reduce<Record<string, ModelTestStatus>>((acc, entry) => {
      acc[entry.name.trim()] = 'loading';
      return acc;
    }, {});
    setModelTestStatuses(initialStatuses);

    let successCount = 0;
    let failCount = 0;
    const failedModels = new Set<string>();

    try {
      for (const entry of modelEntries) {
        const modelName = entry.name.trim();
        skipConnectivityResetRef.current = true;
        setTestModel(modelName);
        setTestMessage(t('ai_providers.codex_test_all_models_running', { model: modelName }));

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...customHeaders,
        };
        if (!hasHeader(headers, 'authorization') && apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        let success = false;
        try {
          const result = await apiCallApi.request(
            {
              method: 'POST',
              url: endpoint,
              header: Object.keys(headers).length ? headers : undefined,
              data: JSON.stringify({
                model: modelName,
                input: 'Hi',
                max_output_tokens: 5,
                stream: false,
              }),
            },
            { timeout: CODEX_TEST_TIMEOUT_MS }
          );
          if (result.statusCode < 200 || result.statusCode >= 300) {
            throw new Error(getApiCallErrorMessage(result));
          }
          success = true;
        } catch {
          success = false;
        }

        if (!success) {
          failCount += 1;
          failedModels.add(modelName);
          skipConnectivityResetRef.current = true;
          setForm((prev) => ({
            ...prev,
            modelEntries: prev.modelEntries.filter(
              (modelEntry) => modelEntry.name.trim() !== modelName
            ),
          }));
          setModelTestStatuses((prev) => {
            const next = { ...prev };
            delete next[modelName];
            return next;
          });
        } else {
          successCount += 1;
          setModelTestStatuses((prev) => ({ ...prev, [modelName]: 'success' }));
        }
      }

      const nextModelEntries = form.modelEntries.filter(
        (entry) => !failedModels.has(entry.name.trim())
      );
      const normalizedNextModelEntries = nextModelEntries.length
        ? nextModelEntries
        : [{ name: '', alias: '' }];
      const nextTestModel =
        normalizedNextModelEntries.find((entry) => entry.name.trim())?.name.trim() ?? '';

      skipConnectivityResetRef.current = true;
      setForm((prev) => ({
        ...prev,
        modelEntries: normalizedNextModelEntries,
      }));
      setTestModel(nextTestModel);

      const message =
        failCount === 0
          ? t('ai_providers.codex_test_all_models_success', { count: successCount })
          : t('ai_providers.codex_test_all_models_done', {
              success: successCount,
              failed: failCount,
            });
      setTestStatus(failCount === 0 ? 'success' : 'error');
      setTestMessage(message);
      showNotification(message, failCount === 0 ? 'success' : 'warning');
    } finally {
      setIsTesting(false);
    }
  }, [
    form.apiKey,
    form.baseUrl,
    form.headers,
    form.modelEntries,
    isTesting,
    showNotification,
    t,
  ]);

  const discoveredModelsFiltered = useMemo(() => {
    const filter = modelDiscoverySearch.trim().toLowerCase();
    if (!filter) return discoveredModels;
    return discoveredModels.filter((model) => {
      const name = (model.name || '').toLowerCase();
      const alias = (model.alias || '').toLowerCase();
      const description = (model.description || '').toLowerCase();
      return name.includes(filter) || alias.includes(filter) || description.includes(filter);
    });
  }, [discoveredModels, modelDiscoverySearch]);
  const visibleDiscoveredModelNames = useMemo(
    () => discoveredModelsFiltered.map((model) => model.name),
    [discoveredModelsFiltered]
  );
  const allVisibleDiscoveredSelected = useMemo(
    () =>
      visibleDiscoveredModelNames.length > 0 &&
      visibleDiscoveredModelNames.every((name) => modelDiscoverySelected.has(name)),
    [modelDiscoverySelected, visibleDiscoveredModelNames]
  );

  const mergeDiscoveredModels = useCallback(
    (selectedModels: ModelInfo[]) => {
      if (!selectedModels.length) return;

      let addedCount = 0;
      setForm((prev) => {
        const mergedMap = new Map<string, { name: string; alias: string }>();
        prev.modelEntries.forEach((entry) => {
          const name = entry.name.trim();
          if (!name) return;
          mergedMap.set(name.toLowerCase(), { name, alias: entry.alias?.trim() || '' });
        });

        selectedModels.forEach((model) => {
          const name = String(model.name ?? '').trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (mergedMap.has(key)) return;
          mergedMap.set(key, { name, alias: model.alias ?? '' });
          addedCount += 1;
        });

        const mergedEntries = Array.from(mergedMap.values());
        return {
          ...prev,
          modelEntries: mergedEntries.length ? mergedEntries : [{ name: '', alias: '' }],
        };
      });

      if (addedCount > 0) {
        showNotification(
          t('ai_providers.codex_models_fetch_added', { count: addedCount }),
          'success'
        );
      }
    },
    [setForm, showNotification, t]
  );

  const fetchCodexModelDiscovery = useCallback(async () => {
    const requestId = (modelDiscoveryRequestIdRef.current += 1);
    setModelDiscoveryFetching(true);
    setModelDiscoveryError('');

    try {
      const headerObject = buildHeaderObject(form.headers);
      const hasCustomAuthorization = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'authorization'
      );
      const apiKey = form.apiKey.trim() || undefined;
      const list = await modelsApi.fetchV1ModelsViaApiCall(
        form.baseUrl ?? '',
        hasCustomAuthorization ? undefined : apiKey,
        headerObject
      );
      if (modelDiscoveryRequestIdRef.current !== requestId) return;
      setDiscoveredModels(list);
    } catch (err: unknown) {
      if (modelDiscoveryRequestIdRef.current !== requestId) return;
      setDiscoveredModels([]);
      const message = getErrorMessage(err);
      setModelDiscoveryError(`${t('ai_providers.codex_models_fetch_error')}: ${message}`);
    } finally {
      if (modelDiscoveryRequestIdRef.current === requestId) {
        setModelDiscoveryFetching(false);
      }
    }
  }, [form.apiKey, form.baseUrl, form.headers, t]);

  useEffect(() => {
    if (!modelDiscoveryOpen) {
      autoFetchSignatureRef.current = '';
      modelDiscoveryRequestIdRef.current += 1;
      setModelDiscoveryFetching(false);
      return;
    }

    const nextEndpoint = modelsApi.buildV1ModelsEndpoint(form.baseUrl ?? '');
    setModelDiscoveryEndpoint(nextEndpoint);
    setDiscoveredModels([]);
    setModelDiscoverySearch('');
    setModelDiscoverySelected(new Set());
    setModelDiscoveryError('');

    if (!nextEndpoint) return;

    const headerObject = buildHeaderObject(form.headers);
    const hasCustomAuthorization = Object.keys(headerObject).some(
      (key) => key.toLowerCase() === 'authorization'
    );
    const hasApiKeyField = Boolean(form.apiKey.trim());
    const canAutoFetch = hasApiKeyField || hasCustomAuthorization;

    if (!canAutoFetch) return;

    const headerSignature = Object.entries(headerObject)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const signature = `${nextEndpoint}||${form.apiKey.trim()}||${headerSignature}`;
    if (autoFetchSignatureRef.current === signature) return;
    autoFetchSignatureRef.current = signature;

    void fetchCodexModelDiscovery();
  }, [fetchCodexModelDiscovery, form.apiKey, form.baseUrl, form.headers, modelDiscoveryOpen]);

  useEffect(() => {
    const availableNames = new Set(discoveredModels.map((model) => model.name));
    setModelDiscoverySelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (availableNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [discoveredModels]);

  const toggleModelDiscoverySelection = (name: string) => {
    setModelDiscoverySelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectVisibleDiscoveredModels = useCallback(() => {
    setModelDiscoverySelected((prev) => {
      const next = new Set(prev);
      visibleDiscoveredModelNames.forEach((name) => next.add(name));
      return next;
    });
  }, [visibleDiscoveredModelNames]);

  const handleClearDiscoveredModelSelection = useCallback(() => {
    setModelDiscoverySelected(new Set());
  }, []);

  const handleApplyDiscoveredModels = () => {
    const selectedModels = discoveredModels.filter((model) =>
      modelDiscoverySelected.has(model.name)
    );
    if (selectedModels.length) {
      mergeDiscoveredModels(selectedModels);
    }
    setModelDiscoveryOpen(false);
  };

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const trimmedBaseUrl = (form.baseUrl ?? '').trim();
    const baseUrl = trimmedBaseUrl || undefined;
    if (!baseUrl) {
      showNotification(t('notification.codex_base_url_required'), 'error');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: ProviderKeyConfig = {
        apiKey: form.apiKey.trim(),
        priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
        prefix: form.prefix?.trim() || undefined,
        baseUrl,
        websockets: Boolean(form.websockets),
        proxyUrl: form.proxyUrl?.trim() || undefined,
        headers: buildHeaderObject(form.headers),
        models: entriesToModels(form.modelEntries),
        excludedModels: parseExcludedModels(form.excludedText),
      };

      const nextList =
        editIndex !== null
          ? configs.map((item, idx) => (idx === editIndex ? payload : item))
          : [...configs, payload];

      await providersApi.saveCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
      showNotification(
        editIndex !== null
          ? t('notification.codex_config_updated')
          : t('notification.codex_config_added'),
        'success'
      );
      allowNextNavigation();
      setBaseline(buildCodexBaseline(form));
      handleBack();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    canSave,
    clearCache,
    configs,
    editIndex,
    form,
    handleBack,
    showNotification,
    t,
    updateConfigValue,
  ]);

  const canOpenModelDiscovery =
    !disableControls &&
    !saving &&
    !loading &&
    !isTesting &&
    !invalidIndexParam &&
    !invalidIndex &&
    Boolean((form.baseUrl ?? '').trim());
  const canApplyModelDiscovery =
    !disableControls &&
    !saving &&
    !isTesting &&
    !modelDiscoveryFetching &&
    modelDiscoverySelected.size > 0;
  const formDisabled = disableControls || saving || isTesting;

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      floatingAction={
        <div className={layoutStyles.floatingActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.floatingBackButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.floatingSaveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {error && <div className="error-box">{error}</div>}
        {invalidIndexParam || invalidIndex ? (
          <div className="hint">{t('common.invalid_provider_index')}</div>
        ) : (
          <>
            <Input
              label={t('ai_providers.codex_add_modal_key_label')}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={formDisabled}
            />
            <Input
              label={t('ai_providers.priority_label')}
              hint={t('ai_providers.priority_hint')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  priority: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                }));
              }}
              disabled={formDisabled}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={formDisabled}
            />
            <Input
              label={t('ai_providers.codex_add_modal_url_label')}
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={formDisabled}
            />
            <div className="form-group">
              <label>{t('ai_providers.codex_websockets_label')}</label>
              <ToggleSwitch
                checked={Boolean(form.websockets)}
                onChange={(value) => setForm((prev) => ({ ...prev, websockets: value }))}
                disabled={formDisabled}
                ariaLabel={t('ai_providers.codex_websockets_label')}
              />
              <div className="hint">{t('ai_providers.codex_websockets_hint')}</div>
            </div>
            <Input
              label={t('ai_providers.codex_add_modal_proxy_label')}
              value={form.proxyUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              disabled={formDisabled}
            />
            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={formDisabled}
            />

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {t('ai_providers.codex_models_label')}
                </label>
                <div className={styles.modelConfigToolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        modelEntries: [...prev.modelEntries, { name: '', alias: '' }],
                      }))
                    }
                    disabled={formDisabled}
                  >
                    {t('ai_providers.codex_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModelDiscoveryOpen(true)}
                    disabled={!canOpenModelDiscovery}
                  >
                    {t('ai_providers.codex_models_fetch_button')}
                  </Button>
                </div>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.codex_models_hint')}</div>

              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={formDisabled}
                hideAddButton
                className={styles.modelInputList}
                rowClassName={`${styles.modelInputRow} ${styles.modelInputRowWithStatus}`}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
                renderTrailing={(entry) => {
                  const status = modelTestStatuses[entry.name.trim()];
                  return (
                    <span className={styles.modelTestRowStatus}>
                      {status ? <StatusIcon status={status} /> : null}
                    </span>
                  );
                }}
              />

              <div className={styles.modelTestPanel}>
                <div className={styles.modelTestMeta}>
                  <label className={styles.modelTestLabel}>{t('ai_providers.codex_test_title')}</label>
                  <span className={styles.modelTestHint}>{t('ai_providers.codex_test_hint')}</span>
                </div>
                <div className={styles.modelTestControls}>
                  <Select
                    value={testModel}
                    options={modelSelectOptions}
                    onChange={(value) => {
                      setTestModel(value);
                      setTestStatus('idle');
                      setTestMessage('');
                    }}
                    placeholder={
                      availableModels.length
                        ? t('ai_providers.codex_test_select_placeholder')
                        : t('ai_providers.codex_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('ai_providers.codex_test_title')}
                    disabled={
                      formDisabled || testStatus === 'loading' || availableModels.length === 0
                    }
                  />
                  <Button
                    variant={testStatus === 'error' ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => void runSingleConnectivityTest()}
                    loading={testStatus === 'loading'}
                    disabled={
                      formDisabled ||
                      testStatus === 'loading' ||
                      !hasConfiguredModels ||
                      !hasTestableKey
                    }
                    title={t('ai_providers.codex_test_action')}
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.codex_test_action')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testAllModels()}
                    loading={testStatus === 'loading'}
                    disabled={
                      formDisabled ||
                      testStatus === 'loading' ||
                      !hasConfiguredModels ||
                      !hasTestableKey
                    }
                    title={t('ai_providers.codex_test_all_models_hint')}
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.codex_test_all_models_action')}
                  </Button>
                </div>
              </div>
              {testMessage && (
                <div
                  className={`status-badge ${
                    testStatus === 'error'
                      ? 'error'
                      : testStatus === 'success'
                        ? 'success'
                        : 'muted'
                  }`}
                >
                  {testMessage}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                className="input"
                placeholder={t('ai_providers.excluded_models_placeholder')}
                value={form.excludedText}
                onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
                rows={4}
                disabled={formDisabled}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>

            <Modal
              open={modelDiscoveryOpen}
              title={t('ai_providers.codex_models_fetch_title')}
              onClose={() => setModelDiscoveryOpen(false)}
              width={720}
              footer={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setModelDiscoveryOpen(false)}
                    disabled={modelDiscoveryFetching}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyDiscoveredModels}
                    disabled={!canApplyModelDiscovery}
                  >
                    {t('ai_providers.codex_models_fetch_apply')}
                  </Button>
                </>
              }
            >
              <div className={styles.openaiModelsContent}>
                <div className={styles.sectionHint}>
                  {t('ai_providers.codex_models_fetch_hint')}
                </div>
                <div className={styles.openaiModelsEndpointSection}>
                  <label className={styles.openaiModelsEndpointLabel}>
                    {t('ai_providers.codex_models_fetch_url_label')}
                  </label>
                  <div className={styles.openaiModelsEndpointControls}>
                    <input
                      className={`input ${styles.openaiModelsEndpointInput}`}
                      readOnly
                      value={modelDiscoveryEndpoint}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void fetchCodexModelDiscovery()}
                      loading={modelDiscoveryFetching}
                      disabled={disableControls || saving}
                    >
                      {t('ai_providers.codex_models_fetch_refresh')}
                    </Button>
                  </div>
                </div>
                <Input
                  label={t('ai_providers.codex_models_search_label')}
                  placeholder={t('ai_providers.codex_models_search_placeholder')}
                  value={modelDiscoverySearch}
                  onChange={(e) => setModelDiscoverySearch(e.target.value)}
                  disabled={modelDiscoveryFetching}
                />
                {discoveredModels.length > 0 && (
                  <div className={styles.modelDiscoveryToolbar}>
                    <div className={styles.modelDiscoveryToolbarActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSelectVisibleDiscoveredModels}
                        disabled={
                          disableControls ||
                          saving ||
                          modelDiscoveryFetching ||
                          discoveredModelsFiltered.length === 0 ||
                          allVisibleDiscoveredSelected
                        }
                      >
                        {t('ai_providers.model_discovery_select_visible')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearDiscoveredModelSelection}
                        disabled={
                          disableControls ||
                          saving ||
                          modelDiscoveryFetching ||
                          modelDiscoverySelected.size === 0
                        }
                      >
                        {t('ai_providers.model_discovery_clear_selection')}
                      </Button>
                    </div>
                    <div className={styles.modelDiscoverySelectionSummary}>
                      {t('ai_providers.model_discovery_selected_count', {
                        count: modelDiscoverySelected.size,
                      })}
                    </div>
                  </div>
                )}
                {modelDiscoveryError && <div className="error-box">{modelDiscoveryError}</div>}
                {modelDiscoveryFetching ? (
                  <div className={styles.sectionHint}>
                    {t('ai_providers.codex_models_fetch_loading')}
                  </div>
                ) : discoveredModels.length === 0 ? (
                  <div className={styles.sectionHint}>
                    {t('ai_providers.codex_models_fetch_empty')}
                  </div>
                ) : discoveredModelsFiltered.length === 0 ? (
                  <div className={styles.sectionHint}>
                    {t('ai_providers.codex_models_search_empty')}
                  </div>
                ) : (
                  <div className={styles.modelDiscoveryList}>
                    {discoveredModelsFiltered.map((model) => {
                      const checked = modelDiscoverySelected.has(model.name);
                      return (
                        <SelectionCheckbox
                          key={model.name}
                          checked={checked}
                          onChange={() => toggleModelDiscoverySelection(model.name)}
                          disabled={disableControls || saving || modelDiscoveryFetching}
                          ariaLabel={model.name}
                          className={`${styles.modelDiscoveryRow} ${
                            checked ? styles.modelDiscoveryRowSelected : ''
                          }`}
                          labelClassName={styles.modelDiscoverySelectionLabel}
                          label={
                            <div className={styles.modelDiscoveryMeta}>
                              <div className={styles.modelDiscoveryName}>
                                {model.name}
                                {model.alias && (
                                  <span className={styles.modelDiscoveryAlias}>{model.alias}</span>
                                )}
                              </div>
                              {model.description && (
                                <div className={styles.modelDiscoveryDesc}>{model.description}</div>
                              )}
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </Modal>
          </>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}
