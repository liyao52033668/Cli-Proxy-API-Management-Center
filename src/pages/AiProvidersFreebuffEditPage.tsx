import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { providersApi, apiCallApi, getApiCallErrorMessage } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { FreebuffKeyConfig } from '@/types';
import {
  ModelStatusIcon,
  ProviderConnectivityTestPanel,
  buildFreebuffSessionEndpoint,
  excludedModelsToText,
  parseExcludedModels,
  useProviderConnectivityTest,
  type FreebuffFormState,
  type FreebuffModelEntry,
} from '@/components/providers';
import {
  buildHeaderObject,
  hasHeader,
  headersToEntries,
  normalizeHeaderEntries,
} from '@/utils/headers';
import { areKeyValueEntriesEqual, areStringArraysEqual } from '@/utils/compare';
import {
  freebuffAgentIdOptions,
  freebuffModelOptions,
  lookupFreebuffAgentId,
  type FreebuffCatalogModel,
} from '@/utils/freebuffModels';
import pageStyles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

const buildEmptyForm = (): FreebuffFormState => ({
  apiKey: '',
  comment: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  headers: [],
  excludedText: '',
  disableCooling: false,
  modelEntries: [{ name: '', alias: '', agentId: '' }],
});

const FREEBUFF_TEST_TIMEOUT_MS = 30_000;

// Mirrors the executor's User-Agent; upstream gates some routes on it.
const FREEBUFF_TEST_USER_AGENT = 'ai-sdk/openai-compatible/1.0.0/codebuff';

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

/**
 * The Freebuff session endpoint answers with a session state rather than a
 * completion. A 2xx means the key authenticated and upstream returned state;
 * 404/410 mean the key authenticated but no session is open for this model.
 * Both prove connectivity.
 */
const isFreebuffSessionReachable = (statusCode: number): boolean =>
  (statusCode >= 200 && statusCode < 300) || statusCode === 404 || statusCode === 410;

/**
 * The credential is valid but the account is throttled right now
 * (rate_limited / spend_limited / premium_slot_taken / session_limit_reached).
 * Reported separately so it is not mistaken for a bad key.
 */
const isFreebuffSessionLimited = (statusCode: number): boolean =>
  statusCode === 429 || statusCode === 409;

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeModelEntries = (entries: FreebuffModelEntry[]): FreebuffModelEntry[] =>
  (entries ?? []).reduce<FreebuffModelEntry[]>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    const alias = String(entry?.alias ?? '').trim();
    const agentId = String(entry?.agentId ?? '').trim();
    if (!name && !alias && !agentId) return acc;
    acc.push({ name, alias, agentId });
    return acc;
  }, []);

const modelsToEntries = (models?: FreebuffKeyConfig['models']): FreebuffModelEntry[] => {
  if (!Array.isArray(models) || models.length === 0) {
    return [{ name: '', alias: '', agentId: '' }];
  }
  return models.map((model) => ({
    name: String(model?.name ?? ''),
    alias: String(model?.alias ?? ''),
    agentId: String(model?.agentId ?? ''),
  }));
};

type FreebuffFormBaseline = {
  apiKey: string;
  comment: string;
  priority: number | null;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  headers: ReturnType<typeof normalizeHeaderEntries>;
  models: FreebuffModelEntry[];
  excludedModels: string[];
  disableCooling: boolean;
};

const buildFreebuffBaseline = (form: FreebuffFormState): FreebuffFormBaseline => ({
  apiKey: String(form.apiKey ?? '').trim(),
  comment: String(form.comment ?? '').trim(),
  priority:
    form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
  prefix: String(form.prefix ?? '').trim(),
  baseUrl: String(form.baseUrl ?? '').trim(),
  proxyUrl: String(form.proxyUrl ?? '').trim(),
  headers: normalizeHeaderEntries(form.headers),
  models: normalizeModelEntries(form.modelEntries),
  excludedModels: parseExcludedModels(form.excludedText ?? ''),
  disableCooling: Boolean(form.disableCooling),
});

const areModelEntriesEqual = (a: FreebuffModelEntry[], b: FreebuffModelEntry[]) => {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const other = b[index];
    return (
      entry.name === other.name && entry.alias === other.alias && entry.agentId === other.agentId
    );
  });
};

export function AiProvidersFreebuffEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();

  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const [configs, setConfigs] = useState<FreebuffKeyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FreebuffFormState>(() => buildEmptyForm());
  const [baseline, setBaseline] = useState(() => buildFreebuffBaseline(buildEmptyForm()));

  // 模型目录由后端下发（上游无模型列表接口），拉取成功后用于候选与自动填充。
  const [catalog, setCatalog] = useState<FreebuffCatalogModel[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogFetching, setCatalogFetching] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSelected, setCatalogSelected] = useState<Set<string>>(new Set());

  // 连通性测试走共享 hook（与其他 provider 一致）。测试失败会移除该模型映射：
  // 探测已确认这条映射不可用，留着只会让用户反复踩同一个错误。
  const hasCustomAuthHeader = useMemo(
    () => hasHeader(buildHeaderObject(form.headers), 'authorization'),
    [form.headers]
  );
  const hasTestableKey = Boolean(form.apiKey.trim()) || hasCustomAuthHeader;

  const {
    testModel,
    setTestModel,
    testStatus,
    setTestStatus,
    testMessage,
    setTestMessage,
    modelTestStatuses,
    setModelTestStatuses,
    isTesting,
    setIsTesting,
    availableModels,
    hasConfiguredModels,
    modelSelectOptions,
    markSkipConnectivityReset,
    removeModelEntryByName,
    selectNextModel,
  } = useProviderConnectivityTest({
    form,
    setForm,
    extraSignature: [
      form.apiKey.trim(),
      String(form.baseUrl ?? '').trim(),
      form.headers.map((entry) => `${entry.key.trim()}:${entry.value.trim()}`).join('|'),
    ].join('||'),
  });

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
      ? t('ai_providers.freebuff_edit_modal_title')
      : t('ai_providers.freebuff_add_modal_title');

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

    // loading already defaults to true, so no synchronous init here; clearing a stale
    // error happens after the request starts to avoid setState in the effect body.
    providersApi
      .getFreebuffConfigs()
      .then((value) => {
        if (cancelled) return;
        setConfigs(value);
        setError('');
        updateConfigValue('freebuff-api-key', value);

        const nextData = editIndex === null ? undefined : value[editIndex];
        const nextForm: FreebuffFormState = nextData
          ? {
              apiKey: String(nextData.apiKey ?? ''),
              comment: String(nextData.comment ?? ''),
              priority: nextData.priority,
              prefix: String(nextData.prefix ?? ''),
              baseUrl: String(nextData.baseUrl ?? ''),
              proxyUrl: String(nextData.proxyUrl ?? ''),
              headers: headersToEntries(nextData.headers),
              excludedText: excludedModelsToText(nextData.excludedModels),
              disableCooling: Boolean(nextData.disableCooling),
              modelEntries: modelsToEntries(nextData.models),
            }
          : buildEmptyForm();
        setForm(nextForm);
        setBaseline(buildFreebuffBaseline(nextForm));
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
  }, [editIndex, t, updateConfigValue]);

  const canSave = !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;

  const filteredCatalogModels = useMemo(() => {
    const filter = catalogSearch.trim().toLowerCase();
    if (!filter) return catalog;
    return catalog.filter((model) => {
      const id = model.id.toLowerCase();
      const name = (model.name || '').toLowerCase();
      const agentId = model.agentId.toLowerCase();
      return id.includes(filter) || name.includes(filter) || agentId.includes(filter);
    });
  }, [catalog, catalogSearch]);
  const visibleCatalogIds = useMemo(
    () => filteredCatalogModels.map((model) => model.id),
    [filteredCatalogModels]
  );
  const allVisibleCatalogSelected = useMemo(
    () =>
      visibleCatalogIds.length > 0 && visibleCatalogIds.every((id) => catalogSelected.has(id)),
    [catalogSelected, visibleCatalogIds]
  );
  const canOpenCatalog = !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;
  const canApplyCatalog =
    !disableControls && !saving && !catalogFetching && catalogSelected.size > 0;

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
    baseline.comment !== String(form.comment ?? '').trim() ||
    baseline.priority !== normalizedPriority ||
    baseline.prefix !== String(form.prefix ?? '').trim() ||
    baseline.baseUrl !== String(form.baseUrl ?? '').trim() ||
    baseline.proxyUrl !== String(form.proxyUrl ?? '').trim() ||
    baseline.disableCooling !== Boolean(form.disableCooling) ||
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

  const updateModelEntry = (index: number, field: keyof FreebuffModelEntry, value: string) => {
    setForm((prev) => ({
      ...prev,
      modelEntries: prev.modelEntries.map((entry, idx) => {
        if (idx !== index) return entry;
        if (field !== 'name') return { ...entry, [field]: value };

        // 模型名变化时，仅当 agent id 为空或仍是上一个模型名自动带出的内置值时，
        // 才跟随更新，避免覆盖用户手填的自定义 agent。
        const previousSuggested = lookupFreebuffAgentId(catalog, entry.name);
        const currentAgentId = entry.agentId ?? '';
        const canAutoFill = !currentAgentId.trim() || currentAgentId === previousSuggested;
        const nextSuggested = lookupFreebuffAgentId(catalog, value) ?? '';
        return {
          ...entry,
          name: value,
          agentId: canAutoFill ? nextSuggested : currentAgentId,
        };
      }),
    }));
  };

  const fetchCatalog = useCallback(async () => {
    setCatalogFetching(true);
    setCatalogError('');
    try {
      const list = await providersApi.getFreebuffModelCatalog();
      setCatalog(list);
    } catch (err: unknown) {
      setCatalog([]);
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      setCatalogError(`${t('ai_providers.freebuff_models_fetch_error')}: ${message}`);
    } finally {
      setCatalogFetching(false);
    }
  }, [t]);

  // Reset the selection when the modal opens and fetch the catalog once; the catalog is
  // small and served from a backend built-in table, so no caching is needed.
  const handleOpenCatalog = useCallback(() => {
    setCatalogSearch('');
    setCatalogSelected(new Set());
    setCatalogError('');
    setCatalogOpen(true);
    void fetchCatalog();
  }, [fetchCatalog]);

  const toggleCatalogSelection = (id: string) => {
    setCatalogSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectVisibleCatalog = useCallback(() => {
    setCatalogSelected((prev) => {
      const next = new Set(prev);
      visibleCatalogIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleCatalogIds]);

  const handleClearCatalogSelection = useCallback(() => {
    setCatalogSelected(new Set());
  }, []);

  const handleApplyCatalog = useCallback(() => {
    const selectedModels = catalog.filter((model) => catalogSelected.has(model.id));
    if (selectedModels.length) {
      setForm((prev) => {
        const merged = prev.modelEntries.filter((entry) => entry.name.trim());
        let added = 0;
        selectedModels.forEach((model) => {
          if (merged.some((entry) => entry.name.trim() === model.id)) return;
          merged.push({ name: model.id, alias: '', agentId: model.agentId });
          added += 1;
        });
        if (added > 0) {
          showNotification(
            t('ai_providers.freebuff_models_fetch_added', { count: added }),
            'success'
          );
        }
        return {
          ...prev,
          modelEntries: merged.length ? merged : [{ name: '', alias: '', agentId: '' }],
        };
      });
    }
    setCatalogOpen(false);
  }, [catalog, catalogSelected, showNotification, t]);

  // 探测一次上游 session 端点。可达即视为通过。
  const testModelWithRequest = useCallback(
    async (modelName: string): Promise<boolean> => {
      const endpoint = buildFreebuffSessionEndpoint(form.baseUrl);
      if (!endpoint) return false;

      const customHeaders = buildHeaderObject(form.headers);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-freebuff-model': modelName,
        ...customHeaders,
      };
      if (!hasHeader(headers, 'user-agent')) {
        headers['User-Agent'] = FREEBUFF_TEST_USER_AGENT;
      }
      if (!hasHeader(headers, 'authorization') && form.apiKey.trim()) {
        headers.Authorization = `Bearer ${form.apiKey.trim()}`;
      }

      const result = await apiCallApi.request(
        { method: 'GET', url: endpoint, header: headers },
        { timeout: FREEBUFF_TEST_TIMEOUT_MS }
      );

      if (!isFreebuffSessionReachable(result.statusCode)) {
        const message = isFreebuffSessionLimited(result.statusCode)
          ? `${t('ai_providers.freebuff_test_limited')}: ${getApiCallErrorMessage(result)}`
          : getApiCallErrorMessage(result);
        throw new Error(message);
      }
      return true;
    },
    [form.apiKey, form.baseUrl, form.headers, t]
  );

  const runFreebuffConnectivityTest = useCallback(async () => {
    if (isTesting) return;

    const endpoint = buildFreebuffSessionEndpoint(form.baseUrl);
    if (!endpoint) {
      const message = t('ai_providers.freebuff_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelName = testModel.trim() || availableModels[0] || '';
    if (!modelName) {
      const message = t('ai_providers.freebuff_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    if (!hasTestableKey) {
      const message = t('ai_providers.freebuff_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTesting(true);
    setTestStatus('loading');
    setTestMessage(t('ai_providers.freebuff_test_running'));

    try {
      await testModelWithRequest(modelName);
      setModelTestStatuses((prev) => ({ ...prev, [modelName]: 'success' }));
      const message = t('ai_providers.freebuff_test_success');
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
        ? t('ai_providers.freebuff_test_timeout', { seconds: FREEBUFF_TEST_TIMEOUT_MS / 1000 })
        : `${t('ai_providers.freebuff_test_failed')}: ${message || t('common.unknown_error')}`;
      setTestStatus('error');
      setTestMessage(resolvedMessage);
      showNotification(resolvedMessage, 'error');
      removeModelEntryByName(modelName);
    } finally {
      setIsTesting(false);
    }
  }, [
    availableModels,
    form.baseUrl,
    hasTestableKey,
    isTesting,
    removeModelEntryByName,
    selectNextModel,
    setIsTesting,
    setModelTestStatuses,
    setTestMessage,
    setTestStatus,
    showNotification,
    t,
    testModel,
    testModelWithRequest,
  ]);

  const testAllModels = useCallback(async () => {
    if (isTesting) return;

    const endpoint = buildFreebuffSessionEndpoint(form.baseUrl);
    if (!endpoint) {
      const message = t('ai_providers.freebuff_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    if (!hasTestableKey) {
      const message = t('ai_providers.freebuff_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelEntries = form.modelEntries.filter((entry) => entry.name.trim());
    if (modelEntries.length === 0) {
      const message = t('ai_providers.freebuff_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTesting(true);
    setTestStatus('loading');

    const initialStatuses = modelEntries.reduce<Record<string, 'loading' | 'success'>>(
      (acc, entry) => {
        acc[entry.name.trim()] = 'loading';
        return acc;
      },
      {}
    );
    setModelTestStatuses(initialStatuses);

    let successCount = 0;
    let failCount = 0;
    const failedModels = new Set<string>();

    try {
      for (const entry of modelEntries) {
        const modelName = entry.name.trim();
        markSkipConnectivityReset();
        setTestModel(modelName);
        setTestMessage(t('ai_providers.freebuff_test_all_models_running', { model: modelName }));

        let success = false;
        try {
          await testModelWithRequest(modelName);
          success = true;
        } catch {
          success = false;
        }

        if (!success) {
          failCount += 1;
          failedModels.add(modelName);
          markSkipConnectivityReset();
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
        : [{ name: '', alias: '', agentId: '' }];
      const nextTestModel =
        normalizedNextModelEntries.find((entry) => entry.name.trim())?.name.trim() ?? '';

      markSkipConnectivityReset();
      setForm((prev) => ({
        ...prev,
        modelEntries: normalizedNextModelEntries,
      }));
      setTestModel(nextTestModel);

      const message =
        failCount === 0
          ? t('ai_providers.freebuff_test_all_success', { count: successCount })
          : t('ai_providers.freebuff_test_all_models_done', {
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
    form.baseUrl,
    form.modelEntries,
    hasTestableKey,
    isTesting,
    markSkipConnectivityReset,
    setForm,
    setIsTesting,
    setModelTestStatuses,
    setTestMessage,
    setTestModel,
    setTestStatus,
    showNotification,
    t,
    testModelWithRequest,
  ]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setSaving(true);
    setError('');
    try {
      const models = form.modelEntries
        .filter((entry) => entry.name.trim())
        .map((entry) => {
          const model: NonNullable<FreebuffKeyConfig['models']>[number] = {
            name: entry.name.trim(),
          };
          const alias = entry.alias.trim();
          if (alias && alias !== model.name) model.alias = alias;
          const agentId = (entry.agentId ?? '').trim();
          if (agentId) model.agentId = agentId;
          return model;
        });

      const payload: FreebuffKeyConfig = {
        apiKey: form.apiKey.trim(),
        comment: form.comment?.trim() || undefined,
        priority:
          form.priority !== undefined && Number.isFinite(form.priority)
            ? Math.trunc(form.priority)
            : undefined,
        prefix: form.prefix?.trim() || undefined,
        baseUrl: form.baseUrl?.trim() || undefined,
        proxyUrl: form.proxyUrl?.trim() || undefined,
        headers: buildHeaderObject(form.headers),
        excludedModels: parseExcludedModels(form.excludedText),
        disableCooling: form.disableCooling || undefined,
        models: models.length ? models : undefined,
        // Carry untouched extra credentials so multi-key entries survive a save.
        apiKeyEntries: initialData?.apiKeyEntries,
      };

      const nextList =
        editIndex !== null
          ? configs.map((item, idx) => (idx === editIndex ? payload : item))
          : [...configs, payload];

      await providersApi.saveFreebuffConfigs(nextList);
      const syncedConfigs = await providersApi.getFreebuffConfigs().catch(() => nextList);
      setConfigs(syncedConfigs);
      updateConfigValue('freebuff-api-key', syncedConfigs);
      showNotification(
        editIndex !== null
          ? t('notification.freebuff_config_updated')
          : t('notification.freebuff_config_added'),
        'success'
      );
      allowNextNavigation();
      setBaseline(buildFreebuffBaseline(form));
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
    configs,
    editIndex,
    form,
    handleBack,
    initialData,
    showNotification,
    t,
    updateConfigValue,
  ]);

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
              label={t('ai_providers.freebuff_add_modal_key_label')}
              placeholder={t('ai_providers.freebuff_add_modal_key_placeholder')}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.freebuff_comment_label')}
              placeholder={t('ai_providers.freebuff_comment_placeholder')}
              value={form.comment ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.freebuff_add_modal_url_label')}
              placeholder={t('ai_providers.freebuff_add_modal_url_placeholder')}
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.freebuff_add_modal_proxy_label')}
              placeholder={t('ai_providers.freebuff_add_modal_proxy_placeholder')}
              value={form.proxyUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              disabled={disableControls || saving}
            />
            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={disableControls || saving}
            />
            <div className={pageStyles.modelConfigSection}>
              <div className={pageStyles.modelConfigHeader}>
                <label className={pageStyles.modelConfigTitle}>
                  {t('ai_providers.freebuff_models_label')}
                </label>
                <div className={pageStyles.modelConfigToolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        modelEntries: [
                          ...(prev.modelEntries.length
                            ? prev.modelEntries
                            : [{ name: '', alias: '', agentId: '' }]),
                          { name: '', alias: '', agentId: '' },
                        ],
                      }))
                    }
                    disabled={disableControls || saving}
                  >
                    {t('ai_providers.freebuff_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenCatalog}
                    disabled={!canOpenCatalog}
                  >
                    {t('ai_providers.freebuff_models_fetch_button')}
                  </Button>
                </div>
              </div>
              <div className={pageStyles.sectionHint}>
                {t('ai_providers.freebuff_agent_id_hint')}
              </div>

              <div className="header-input-list">
                {(form.modelEntries.length
                  ? form.modelEntries
                  : [{ name: '', alias: '', agentId: '' }]
                ).map((entry, index) => (
                  <Fragment key={index}>
                    <div className={layoutStyles.freebuffModelRow}>
                      <AutocompleteInput
                        value={entry.name}
                        onChange={(next) => updateModelEntry(index, 'name', next)}
                        options={freebuffModelOptions(catalog)}
                        placeholder={t('common.model_name_placeholder')}
                        wrapperClassName={layoutStyles.freebuffInlineField}
                        disabled={disableControls || saving}
                      />
                      <span className="header-separator">→</span>
                      <input
                        className="input"
                        placeholder={t('common.model_alias_placeholder')}
                        value={entry.alias}
                        onChange={(e) => updateModelEntry(index, 'alias', e.target.value)}
                        disabled={disableControls || saving}
                      />
                      <AutocompleteInput
                        value={entry.agentId ?? ''}
                        onChange={(next) => updateModelEntry(index, 'agentId', next)}
                        options={freebuffAgentIdOptions(catalog)}
                        placeholder={t('ai_providers.freebuff_agent_id_placeholder')}
                        wrapperClassName={layoutStyles.freebuffInlineField}
                        disabled={disableControls || saving}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm((prev) => {
                            const next = prev.modelEntries.filter((_, idx) => idx !== index);
                            return {
                              ...prev,
                              modelEntries: next.length
                                ? next
                                : [{ name: '', alias: '', agentId: '' }],
                            };
                          })
                        }
                        disabled={
                          disableControls ||
                          saving ||
                          (form.modelEntries.length ? form.modelEntries.length : 1) <= 1
                        }
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        ×
                      </Button>
                      <span className={pageStyles.modelTestRowStatus}>
                        {modelTestStatuses[entry.name.trim()] ? (
                          <ModelStatusIcon status={modelTestStatuses[entry.name.trim()]} />
                        ) : null}
                      </span>
                    </div>
                  </Fragment>
                ))}
              </div>

              <ProviderConnectivityTestPanel
                title={t('ai_providers.freebuff_test_title')}
                hint={t('ai_providers.freebuff_test_hint')}
                testModel={testModel}
                modelSelectOptions={modelSelectOptions}
                onModelChange={(value) => {
                  setTestModel(value);
                  setTestStatus('idle');
                  setTestMessage('');
                }}
                selectPlaceholder={t('ai_providers.freebuff_test_select_placeholder')}
                selectEmptyText={t('ai_providers.freebuff_test_select_empty')}
                testStatus={testStatus}
                testMessage={testMessage}
                disabled={saving || disableControls}
                canRunSingleTest={hasConfiguredModels && hasTestableKey}
                canRunAllTest={hasConfiguredModels && hasTestableKey}
                singleTestActionText={t('ai_providers.freebuff_test_action')}
                singleTestTitle={t('ai_providers.freebuff_test_action_hint')}
                onRunSingleTest={() => void runFreebuffConnectivityTest()}
                allTestActionText={t('ai_providers.freebuff_test_all_action')}
                allTestTitle={t('ai_providers.freebuff_test_all_hint')}
                onRunAllTest={() => void testAllModels()}
              />
            </div>

            <div className="form-group">
              <label>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                className="input"
                placeholder={t('ai_providers.excluded_models_placeholder')}
                value={form.excludedText}
                onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
                rows={4}
                disabled={disableControls || saving}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>

            <Modal
              open={catalogOpen}
              title={t('ai_providers.freebuff_models_fetch_title')}
              onClose={() => setCatalogOpen(false)}
              width={720}
              footer={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCatalogOpen(false)}
                    disabled={catalogFetching}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyCatalog}
                    disabled={!canApplyCatalog}
                  >
                    {t('ai_providers.freebuff_models_fetch_apply')}
                  </Button>
                </>
              }
            >
              <div className={pageStyles.openaiModelsContent}>
                <div className={pageStyles.sectionHint}>
                  {t('ai_providers.freebuff_models_fetch_hint')}
                </div>
                <Input
                  label={t('ai_providers.freebuff_models_search_label')}
                  placeholder={t('ai_providers.freebuff_models_search_placeholder')}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  disabled={catalogFetching}
                />
                {catalog.length > 0 && (
                  <div className={pageStyles.modelDiscoveryToolbar}>
                    <div className={pageStyles.modelDiscoveryToolbarActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSelectVisibleCatalog}
                        disabled={
                          disableControls ||
                          saving ||
                          catalogFetching ||
                          filteredCatalogModels.length === 0 ||
                          allVisibleCatalogSelected
                        }
                      >
                        {t('ai_providers.model_discovery_select_visible')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearCatalogSelection}
                        disabled={
                          disableControls || saving || catalogFetching || catalogSelected.size === 0
                        }
                      >
                        {t('ai_providers.model_discovery_clear_selection')}
                      </Button>
                    </div>
                    <div className={pageStyles.modelDiscoverySelectionSummary}>
                      {t('ai_providers.model_discovery_selected_count', {
                        count: catalogSelected.size,
                      })}
                    </div>
                  </div>
                )}
                {catalogError && <div className="error-box">{catalogError}</div>}
                {catalogFetching ? (
                  <div className={pageStyles.sectionHint}>
                    {t('ai_providers.freebuff_models_fetch_loading')}
                  </div>
                ) : catalog.length === 0 ? (
                  <div className={pageStyles.sectionHint}>
                    {t('ai_providers.freebuff_models_fetch_empty')}
                  </div>
                ) : filteredCatalogModels.length === 0 ? (
                  <div className={pageStyles.sectionHint}>
                    {t('ai_providers.freebuff_models_search_empty')}
                  </div>
                ) : (
                  <div className={pageStyles.modelDiscoveryList}>
                    {filteredCatalogModels.map((model) => {
                      const checked = catalogSelected.has(model.id);
                      return (
                        <SelectionCheckbox
                          key={model.id}
                          checked={checked}
                          onChange={() => toggleCatalogSelection(model.id)}
                          disabled={disableControls || saving || catalogFetching}
                          ariaLabel={model.id}
                          className={`${pageStyles.modelDiscoveryRow} ${
                            checked ? pageStyles.modelDiscoveryRowSelected : ''
                          }`}
                          labelClassName={pageStyles.modelDiscoverySelectionLabel}
                          label={
                            <div className={pageStyles.modelDiscoveryMeta}>
                              <div className={pageStyles.modelDiscoveryName}>
                                {model.name}
                                <span className={pageStyles.modelDiscoveryAlias}>{model.id}</span>
                              </div>
                              <div className={pageStyles.modelDiscoveryDesc}>
                                {model.agentId}
                                {model.inPicker
                                  ? ''
                                  : ` · ${t('ai_providers.freebuff_models_not_in_picker')}`}
                              </div>
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
