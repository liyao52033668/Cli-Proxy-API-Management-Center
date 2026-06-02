import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Input } from '@/components/ui/Input';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { Select } from '@/components/ui/Select';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useNotificationStore } from '@/stores';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import type { ApiKeyEntry } from '@/types';
import { buildHeaderObject, hasHeader } from '@/utils/headers';
import { buildApiKeyEntry, buildOpenAIChatCompletionsEndpoint } from '@/components/providers/utils';
import type { OpenAIEditOutletContext } from './AiProvidersOpenAIEditLayout';
import type { KeyTestStatus } from '@/stores/useOpenAIEditDraftStore';
import styles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

const OPENAI_TEST_TIMEOUT_MS = 30_000;

type KeyTestResult = {
  success: boolean;
  completed: boolean;
};

type ModelTestStatus = 'loading' | 'success';

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

// Status icon components
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

function StatusErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="var(--danger-color, #c65746)" />
      <path
        d="M5 5L11 11M11 5L5 11"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIdleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--text-tertiary, #9ca3af)" strokeWidth="2" />
    </svg>
  );
}

function StatusIcon({ status }: { status: KeyTestStatus['status'] }) {
  switch (status) {
    case 'loading':
      return <StatusLoadingIcon />;
    case 'success':
      return <StatusSuccessIcon />;
    case 'error':
      return <StatusErrorIcon />;
    default:
      return <StatusIdleIcon />;
  }
}

export function AiProvidersOpenAIEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const {
    hasIndexParam,
    invalidIndexParam,
    invalidIndex,
    disableControls,
    loading,
    saving,
    form,
    setForm,
    testModel,
    setTestModel,
    testStatus,
    setTestStatus,
    testMessage,
    setTestMessage,
    keyTestStatuses,
    setDraftKeyTestStatus,
    resetDraftKeyTestStatuses,
    availableModels,
    handleBack,
    handleSave,
  } = useOutletContext<OpenAIEditOutletContext>();

  const title = hasIndexParam
    ? t('ai_providers.openai_edit_modal_title')
    : t('ai_providers.openai_add_modal_title');

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });
  const [isTestingKeys, setIsTestingKeys] = useState(false);
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, ModelTestStatus>>({});
  const skipConnectivityResetRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const canSave = !disableControls && !loading && !saving && !invalidIndexParam && !invalidIndex && !isTestingKeys;
  const providerSavedAtLabel = useMemo(() => {
    const raw = typeof form.updatedAt === 'string' ? form.updatedAt : '';
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(parsed);
  }, [form.updatedAt]);
  const hasConfiguredModels = form.modelEntries.some((entry) => entry.name.trim());
  const hasTestableKeys = form.apiKeyEntries.some((entry) => entry.apiKey?.trim());
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
    return [form.baseUrl.trim(), testModel.trim(), headersSignature, modelsSignature].join('||');
  }, [form.baseUrl, form.headers, form.modelEntries, testModel]);
  const previousConnectivityConfigRef = useRef(connectivityConfigSignature);

  useEffect(() => {
    if (previousConnectivityConfigRef.current === connectivityConfigSignature) {
      return;
    }
    previousConnectivityConfigRef.current = connectivityConfigSignature;
    if (skipConnectivityResetRef.current) {
      skipConnectivityResetRef.current = false;
      return;
    }
    resetDraftKeyTestStatuses(form.apiKeyEntries.length);
    setModelTestStatuses({});
    setTestStatus('idle');
    setTestMessage('');
  }, [
    connectivityConfigSignature,
    form.apiKeyEntries.length,
    resetDraftKeyTestStatuses,
    setTestStatus,
    setTestMessage,
  ]);

  const removeModelEntryByName = useCallback(
    (modelName: string) => {
      const normalizedModelName = modelName.trim();
      if (!normalizedModelName) return;

      const next = form.modelEntries.filter((entry) => entry.name.trim() !== normalizedModelName);
      const nextModelEntries = next.length ? next : [{ name: '', alias: '' }];
      const nextTestModel =
        nextModelEntries.find((entry) => entry.name.trim())?.name.trim() ?? '';

      skipConnectivityResetRef.current = true;
      setForm((prev) => {
        return {
          ...prev,
          modelEntries: nextModelEntries,
        };
      });
      setModelTestStatuses((prev) => {
        const nextStatuses = { ...prev };
        delete nextStatuses[normalizedModelName];
        return nextStatuses;
      });
      setTestModel(nextTestModel);
    },
    [form.modelEntries, setForm, setTestModel]
  );

  const selectNextModel = useCallback(
    (currentModelName: string) => {
      const modelNames = form.modelEntries
        .map((entry) => entry.name.trim())
        .filter(Boolean);
      const currentIndex = modelNames.findIndex((name) => name === currentModelName.trim());
      const nextModel = currentIndex >= 0 ? modelNames[currentIndex + 1] : modelNames[0];
      if (nextModel) {
        skipConnectivityResetRef.current = true;
        setTestModel(nextModel);
      }
    },
    [form.modelEntries, setTestModel]
  );

  // Test a single key by index
  const runSingleKeyTest = useCallback(
    async (keyIndex: number, modelOverride?: string): Promise<KeyTestResult> => {
      const baseUrl = form.baseUrl.trim();
      if (!baseUrl) {
        showNotification(t('notification.openai_test_url_required'), 'error');
        return { success: false, completed: false };
      }

      const endpoint = buildOpenAIChatCompletionsEndpoint(baseUrl);
      if (!endpoint) {
        showNotification(t('notification.openai_test_url_required'), 'error');
        return { success: false, completed: false };
      }

      const keyEntry = form.apiKeyEntries[keyIndex];
      if (!keyEntry?.apiKey?.trim()) {
        setDraftKeyTestStatus(keyIndex, { status: 'error', message: t('notification.openai_test_key_required') });
        return { success: false, completed: false };
      }

      const modelName = modelOverride?.trim() || testModel.trim() || availableModels[0] || '';
      if (!modelName) {
        showNotification(t('notification.openai_test_model_required'), 'error');
        return { success: false, completed: false };
      }

      const customHeaders = buildHeaderObject(form.headers);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };
      if (!hasHeader(headers, 'authorization')) {
        headers.Authorization = `Bearer ${keyEntry.apiKey.trim()}`;
      }

      // Set loading state for this key
      setDraftKeyTestStatus(keyIndex, { status: 'loading', message: '' });

      try {
        const result = await apiCallApi.request(
          {
            method: 'POST',
            url: endpoint,
            header: Object.keys(headers).length ? headers : undefined,
            data: JSON.stringify({
              model: modelName,
              messages: [{ role: 'user', content: 'Hi' }],
              stream: false,
              max_tokens: 5,
            }),
          },
          { timeout: OPENAI_TEST_TIMEOUT_MS }
        );

        if (result.statusCode < 200 || result.statusCode >= 300) {
          throw new Error(getApiCallErrorMessage(result));
        }

        setDraftKeyTestStatus(keyIndex, { status: 'success', message: '' });
        return { success: true, completed: true };
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        const errorCode =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: string }).code)
            : '';
        const isTimeout = errorCode === 'ECONNABORTED' || message.toLowerCase().includes('timeout');
        const errorMessage = isTimeout
          ? t('ai_providers.openai_test_timeout', { seconds: OPENAI_TEST_TIMEOUT_MS / 1000 })
          : message;
        setDraftKeyTestStatus(keyIndex, { status: 'error', message: errorMessage });
        return { success: false, completed: true };
      }
    },
    [form.baseUrl, form.apiKeyEntries, form.headers, testModel, availableModels, t, setDraftKeyTestStatus, showNotification]
  );

  const testSingleKey = useCallback(
    async (keyIndex: number): Promise<boolean> => {
      if (isTestingKeys) return false;
      setIsTestingKeys(true);
      try {
        const result = await runSingleKeyTest(keyIndex);
        const modelName = testModel.trim() || availableModels[0] || '';
        if (result.completed && !result.success) {
          removeModelEntryByName(modelName);
        } else if (result.success) {
          selectNextModel(modelName);
        }
        return result.success;
      } finally {
        setIsTestingKeys(false);
      }
    },
    [
      availableModels,
      isTestingKeys,
      removeModelEntryByName,
      runSingleKeyTest,
      selectNextModel,
      testModel,
    ]
  );

  // Test all keys
  const testAllKeys = useCallback(async () => {
    if (isTestingKeys) return;

    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      const message = t('notification.openai_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const endpoint = buildOpenAIChatCompletionsEndpoint(baseUrl);
    if (!endpoint) {
      const message = t('notification.openai_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelName = testModel.trim() || availableModels[0] || '';
    if (!modelName) {
      const message = t('notification.openai_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const validKeyIndexes = form.apiKeyEntries
      .map((entry, index) => (entry.apiKey?.trim() ? index : -1))
      .filter((index) => index >= 0);
    if (validKeyIndexes.length === 0) {
      const message = t('notification.openai_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTestingKeys(true);
    setTestStatus('loading');
    setTestMessage(t('ai_providers.openai_test_running'));
    resetDraftKeyTestStatuses(form.apiKeyEntries.length);

    try {
      const results = await Promise.all(validKeyIndexes.map((index) => runSingleKeyTest(index)));

      const successCount = results.filter((result) => result.success).length;
      const failCount = validKeyIndexes.length - successCount;
      const hasCompletedFailure = results.some((result) => result.completed && !result.success);

      if (failCount === 0) {
        const message = t('ai_providers.openai_test_all_success', { count: successCount });
        setTestStatus('success');
        setTestMessage(message);
        showNotification(message, 'success');
      } else if (successCount === 0) {
        const message = t('ai_providers.openai_test_all_failed', { count: failCount });
        setTestStatus('error');
        setTestMessage(message);
        showNotification(message, 'error');
      } else {
        const message = t('ai_providers.openai_test_all_partial', { success: successCount, failed: failCount });
        setTestStatus('error');
        setTestMessage(message);
        showNotification(message, 'warning');
      }

      if (hasCompletedFailure) {
        removeModelEntryByName(modelName);
      } else if (successCount > 0) {
        selectNextModel(modelName);
      }
    } finally {
      setIsTestingKeys(false);
    }
  }, [
    isTestingKeys,
    form.baseUrl,
    form.apiKeyEntries,
    testModel,
    availableModels,
    t,
    setTestStatus,
    setTestMessage,
    resetDraftKeyTestStatuses,
    runSingleKeyTest,
    removeModelEntryByName,
    selectNextModel,
    showNotification,
  ]);

  const testAllModels = useCallback(async () => {
    if (isTestingKeys) return;

    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      const message = t('notification.openai_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const endpoint = buildOpenAIChatCompletionsEndpoint(baseUrl);
    if (!endpoint) {
      const message = t('notification.openai_test_url_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const validKeyIndexes = form.apiKeyEntries
      .map((entry, index) => (entry.apiKey?.trim() ? index : -1))
      .filter((index) => index >= 0);
    if (validKeyIndexes.length === 0) {
      const message = t('notification.openai_test_key_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const modelEntries = form.modelEntries.filter((entry) => entry.name.trim());
    if (modelEntries.length === 0) {
      const message = t('notification.openai_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    setIsTestingKeys(true);
    setTestStatus('loading');
    resetDraftKeyTestStatuses(form.apiKeyEntries.length);

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
        setTestMessage(t('ai_providers.openai_test_all_models_running', { model: modelName }));

        const results = await Promise.all(
          validKeyIndexes.map((index) => runSingleKeyTest(index, modelName))
        );
        const hasCompletedFailure = results.some((result) => result.completed && !result.success);
        if (hasCompletedFailure) {
          failCount += 1;
          failedModels.add(modelName);
          skipConnectivityResetRef.current = true;
          setForm((prev) => ({
            ...prev,
            modelEntries: prev.modelEntries.filter((modelEntry) => modelEntry.name.trim() !== modelName),
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
          ? t('ai_providers.openai_test_all_models_success', { count: successCount })
          : t('ai_providers.openai_test_all_models_done', {
              success: successCount,
              failed: failCount,
            });
      setTestStatus(failCount === 0 ? 'success' : 'error');
      setTestMessage(message);
      showNotification(message, failCount === 0 ? 'success' : 'warning');
    } finally {
      setIsTestingKeys(false);
    }
  }, [
    isTestingKeys,
    form.baseUrl,
    form.apiKeyEntries,
    form.modelEntries,
    t,
    setTestStatus,
    setTestMessage,
    resetDraftKeyTestStatuses,
    runSingleKeyTest,
    setForm,
    setTestModel,
    showNotification,
  ]);

  const openOpenaiModelDiscovery = () => {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      showNotification(t('ai_providers.openai_models_fetch_invalid_url'), 'error');
      return;
    }
    navigate('models');
  };

  const renderKeyEntries = (entries: ApiKeyEntry[]) => {
    const list = entries.length ? entries : [buildApiKeyEntry()];

    const updateEntry = (idx: number, field: keyof ApiKeyEntry, value: string) => {
      const next = list.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry));
      setForm((prev) => ({ ...prev, apiKeyEntries: next }));
      setDraftKeyTestStatus(idx, { status: 'idle', message: '' });
      setTestStatus('idle');
      setTestMessage('');
    };

    const removeEntry = (idx: number) => {
      const next = list.filter((_, i) => i !== idx);
      const nextLength = next.length ? next.length : 1;
      setForm((prev) => ({
        ...prev,
        apiKeyEntries: next.length ? next : [buildApiKeyEntry()],
      }));
      resetDraftKeyTestStatuses(nextLength);
      setTestStatus('idle');
      setTestMessage('');
    };

    const addEntry = () => {
      setForm((prev) => ({ ...prev, apiKeyEntries: [...list, buildApiKeyEntry()] }));
      resetDraftKeyTestStatuses(list.length + 1);
      setTestStatus('idle');
      setTestMessage('');
    };

    return (
      <div className={styles.keyEntriesList}>
        <div className={styles.keyEntriesToolbar}>
          <span className={styles.keyEntriesCount}>
            {t('ai_providers.openai_keys_count')}: {list.length}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={addEntry}
            disabled={saving || disableControls || isTestingKeys}
            className={styles.addKeyButton}
          >
            {t('ai_providers.openai_keys_add_btn')}
          </Button>
        </div>
        <div className={styles.keyTableShell}>
          {/* 表头 */}
          <div className={styles.keyTableHeader}>
            <div className={styles.keyTableColIndex}>#</div>
            <div className={styles.keyTableColStatus}>{t('common.status')}</div>
            <div className={styles.keyTableColKey}>{t('common.api_key')}</div>
            <div className={styles.keyTableColProxy}>{t('common.proxy_url')}</div>
            <div className={styles.keyTableColAction}>{t('common.action')}</div>
          </div>

          {/* 数据行 */}
          {list.map((entry, index) => {
            const keyStatus = keyTestStatuses[index]?.status ?? 'idle';
            const canTestKey = Boolean(entry.apiKey?.trim()) && hasConfiguredModels;

            return (
              <div key={index} className={styles.keyTableRow}>
                {/* 序号 */}
                <div className={styles.keyTableColIndex}>{index + 1}</div>

                {/* 状态指示灯 */}
                <div
                  className={styles.keyTableColStatus}
                  title={keyTestStatuses[index]?.message || ''}
                >
                  <StatusIcon status={keyStatus} />
                </div>

                {/* Key 输入框 */}
                <div className={styles.keyTableColKey}>
                  <input
                    type="text"
                    value={entry.apiKey}
                    onChange={(e) => updateEntry(index, 'apiKey', e.target.value)}
                    disabled={saving || disableControls || isTestingKeys}
                    className={`input ${styles.keyTableInput}`}
                    placeholder={t('ai_providers.openai_key_placeholder')}
                  />
                </div>

                {/* Proxy 输入框 */}
                <div className={styles.keyTableColProxy}>
                  <input
                    type="text"
                    value={entry.proxyUrl ?? ''}
                    onChange={(e) => updateEntry(index, 'proxyUrl', e.target.value)}
                    disabled={saving || disableControls || isTestingKeys}
                    className={`input ${styles.keyTableInput}`}
                    placeholder={t('ai_providers.openai_proxy_placeholder')}
                  />
                </div>

                {/* 操作按钮 */}
                <div className={styles.keyTableColAction}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testSingleKey(index)}
                    disabled={saving || disableControls || isTestingKeys || !canTestKey}
                    loading={keyStatus === 'loading'}
                  >
                    {t('ai_providers.openai_test_single_action')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(index)}
                    disabled={saving || disableControls || isTestingKeys || list.length <= 1}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
            onClick={() => void handleSave()}
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
        {invalidIndexParam || invalidIndex ? (
          <div className={styles.sectionHint}>{t('common.invalid_provider_index')}</div>
        ) : (
          <div className={styles.openaiEditForm}>
            <Input
              label={t('ai_providers.openai_add_modal_name_label')}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={saving || disableControls || isTestingKeys}
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
              disabled={saving || disableControls || isTestingKeys}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={saving || disableControls || isTestingKeys}
            />
            <Input
              label={t('ai_providers.openai_add_modal_url_label')}
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={saving || disableControls || isTestingKeys}
            />
            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>{t('ai_providers.config_toggle_label')}</label>
                <div className={styles.modelConfigToolbar}>
                  <ToggleSwitch
                    checked={!form.disabled}
                    onChange={(enabled) => setForm((prev) => ({ ...prev, disabled: !enabled }))}
                    disabled={saving || disableControls || isTestingKeys}
                  />
                </div>
              </div>
              {providerSavedAtLabel ? (
                <div className={styles.sectionHint}>{t('ai_providers.last_saved_at', { time: providerSavedAtLabel })}</div>
              ) : null}
            </div>

            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={saving || disableControls || isTestingKeys}
            />

            {/* 模型配置区域 - 统一布局 */}
            <div className={styles.modelConfigSection}>
              {/* 标题行 */}
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>
                  {hasIndexParam
                    ? t('ai_providers.openai_edit_modal_models_label')
                    : t('ai_providers.openai_add_modal_models_label')}
                </label>
                <div className={styles.modelConfigToolbar}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      modelEntries: [...prev.modelEntries, { name: '', alias: '' }]
                    }))}
                    disabled={saving || disableControls || isTestingKeys}
                  >
                    {t('ai_providers.openai_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openOpenaiModelDiscovery}
                    disabled={saving || disableControls || isTestingKeys}
                  >
                    {t('ai_providers.openai_models_fetch_button')}
                  </Button>
                </div>
              </div>

              {/* 提示文本 */}
              <div className={styles.sectionHint}>{t('ai_providers.openai_models_hint')}</div>

              {/* 模型列表 */}
              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={saving || disableControls || isTestingKeys}
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

              {/* 测试区域 */}
              <div className={styles.modelTestPanel}>
                <div className={styles.modelTestMeta}>
                  <label className={styles.modelTestLabel}>{t('ai_providers.openai_test_title')}</label>
                  <span className={styles.modelTestHint}>{t('ai_providers.openai_test_hint')}</span>
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
                        ? t('ai_providers.openai_test_select_placeholder')
                        : t('ai_providers.openai_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('ai_providers.openai_test_title')}
                    disabled={saving || disableControls || isTestingKeys || testStatus === 'loading' || availableModels.length === 0}
                  />
                  <Button
                    variant={testStatus === 'error' ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => void testAllKeys()}
                    loading={testStatus === 'loading'}
                    disabled={saving || disableControls || isTestingKeys || testStatus === 'loading' || !hasConfiguredModels || !hasTestableKeys}
                    title={t('ai_providers.openai_test_all_hint')}
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.openai_test_action')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testAllModels()}
                    loading={testStatus === 'loading'}
                    disabled={saving || disableControls || isTestingKeys || testStatus === 'loading' || !hasConfiguredModels || !hasTestableKeys}
                    title={t('ai_providers.openai_test_all_models_hint')}
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.openai_test_all_action')}
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

            <div className={styles.keyEntriesSection}>
              <div className={styles.keyEntriesHeader}>
                <label className={styles.keyEntriesTitle}>{t('ai_providers.openai_add_modal_keys_label')}</label>
                <span className={styles.keyEntriesHint}>{t('ai_providers.openai_keys_hint')}</span>
              </div>
              {renderKeyEntries(form.apiKeyEntries)}
            </div>
          </div>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}
