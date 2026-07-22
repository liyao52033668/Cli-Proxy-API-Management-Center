import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { buildHeaderObject } from '@/utils/headers';
import { buildClaudeMessagesEndpoint, parseTextList } from '@/components/providers/utils';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import styles from './AiProvidersPage.module.scss';
import layoutStyles from './AiProvidersEditLayout.module.scss';

const CLAUDE_TEST_TIMEOUT_MS = 30_000;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

type ModelTestStatus = 'loading' | 'success';

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const hasHeader = (headers: Record<string, string>, name: string) => {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
};

const resolveBearerTokenFromAuthorization = (headers: Record<string, string>): string => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
  if (!entry) return '';
  const value = String(entry[1] ?? '').trim();
  if (!value) return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

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

export function AiProvidersClaudeEditPage() {
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
    availableModels,
    handleBack,
    handleSave,
  } = useOutletContext<ClaudeEditOutletContext>();

  const title = hasIndexParam
    ? t('ai_providers.claude_edit_modal_title')
    : t('ai_providers.claude_add_modal_title');

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });
  const [isTesting, setIsTesting] = useState(false);
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, ModelTestStatus>>({});
  const skipConnectivityResetRef = useRef(false);
  const lastCloakConfigRef = useRef<typeof form.cloak>(null);

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
    if (!form.cloak) return;
    lastCloakConfigRef.current = form.cloak;
  }, [form.cloak]);

  const canSave =
    !disableControls && !loading && !saving && !invalidIndexParam && !invalidIndex && !isTesting;

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

  const cloakModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('ai_providers.claude_cloak_mode_auto') },
      { value: 'always', label: t('ai_providers.claude_cloak_mode_always') },
      { value: 'never', label: t('ai_providers.claude_cloak_mode_never') },
    ],
    [t]
  );

  const resolvedCloakMode = useMemo(() => {
    const mode = (form.cloak?.mode ?? '').trim().toLowerCase();
    if (!mode) return 'auto';
    if (mode === 'provider') return 'auto';
    if (mode === 'auto' || mode === 'always' || mode === 'never') return mode;
    return 'auto';
  }, [form.cloak?.mode]);

  const connectivityConfigSignature = useMemo(() => {
    const headersSignature = form.headers
      .map((entry) => `${entry.key.trim()}:${entry.value.trim()}`)
      .join('|');
    const modelsSignature = form.modelEntries
      .map((entry) => `${entry.name.trim()}:${entry.alias.trim()}`)
      .join('|');
    return [
      form.apiKey.trim(),
      form.baseUrl?.trim() ?? '',
      testModel.trim(),
      headersSignature,
      modelsSignature,
    ].join('||');
  }, [form.apiKey, form.baseUrl, form.headers, form.modelEntries, testModel]);

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
    setModelTestStatuses({});
    setTestStatus('idle');
    setTestMessage('');
  }, [connectivityConfigSignature, setTestMessage, setTestStatus]);

  const openClaudeModelDiscovery = () => {
    navigate('models');
  };

  const buildClaudeTestHeaders = useCallback(():
    | { ok: true; endpoint: string; headers: Record<string, string> }
    | { ok: false; error: string } => {
    const customHeaders = buildHeaderObject(form.headers);
    const apiKey = form.apiKey.trim();
    const hasApiKeyHeader = hasHeader(customHeaders, 'x-api-key');
    const apiKeyFromAuthorization = resolveBearerTokenFromAuthorization(customHeaders);
    const resolvedApiKey = apiKey || apiKeyFromAuthorization;

    if (!resolvedApiKey && !hasApiKeyHeader) {
      return { ok: false, error: t('ai_providers.claude_test_key_required') };
    }

    const endpoint = buildClaudeMessagesEndpoint(form.baseUrl ?? '');
    if (!endpoint) {
      return { ok: false, error: t('ai_providers.claude_test_endpoint_invalid') };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    if (!hasHeader(headers, 'anthropic-version')) {
      headers['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
    }
    if (!Object.prototype.hasOwnProperty.call(headers, 'Anthropic-Version')) {
      headers['Anthropic-Version'] = headers['anthropic-version'] ?? DEFAULT_ANTHROPIC_VERSION;
    }

    if (!hasApiKeyHeader && resolvedApiKey) {
      headers['x-api-key'] = resolvedApiKey;
    }
    if (!Object.prototype.hasOwnProperty.call(headers, 'X-Api-Key') && resolvedApiKey) {
      headers['X-Api-Key'] = resolvedApiKey;
    }

    return { ok: true, endpoint, headers };
  }, [form.apiKey, form.baseUrl, form.headers, t]);

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
    [form.modelEntries, setForm, setTestModel]
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
    [form.modelEntries, setTestModel]
  );

  const runClaudeConnectivityTest = useCallback(async () => {
    if (isTesting) return;

    const modelName = testModel.trim() || availableModels[0] || '';
    if (!modelName) {
      const message = t('ai_providers.claude_test_model_required');
      setTestStatus('error');
      setTestMessage(message);
      showNotification(message, 'error');
      return;
    }

    const prepared = buildClaudeTestHeaders();
    if (!prepared.ok) {
      setTestStatus('error');
      setTestMessage(prepared.error);
      showNotification(prepared.error, 'error');
      return;
    }

    setIsTesting(true);
    setTestStatus('loading');
    setTestMessage(t('ai_providers.claude_test_running'));

    try {
      const result = await apiCallApi.request(
        {
          method: 'POST',
          url: prepared.endpoint,
          header: prepared.headers,
          data: JSON.stringify({
            model: modelName,
            max_tokens: 8,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        },
        { timeout: CLAUDE_TEST_TIMEOUT_MS }
      );

      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }

      const message = t('ai_providers.claude_test_success');
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
        ? t('ai_providers.claude_test_timeout', { seconds: CLAUDE_TEST_TIMEOUT_MS / 1000 })
        : `${t('ai_providers.claude_test_failed')}: ${message || t('common.unknown_error')}`;
      setTestStatus('error');
      setTestMessage(resolvedMessage);
      showNotification(resolvedMessage, 'error');
      removeModelEntryByName(modelName);
    } finally {
      setIsTesting(false);
    }
  }, [
    availableModels,
    buildClaudeTestHeaders,
    isTesting,
    removeModelEntryByName,
    selectNextModel,
    setTestMessage,
    setTestStatus,
    showNotification,
    t,
    testModel,
  ]);

  const testAllModels = useCallback(async () => {
    if (isTesting) return;

    const prepared = buildClaudeTestHeaders();
    if (!prepared.ok) {
      setTestStatus('error');
      setTestMessage(prepared.error);
      showNotification(prepared.error, 'error');
      return;
    }

    const modelEntries = form.modelEntries.filter((entry) => entry.name.trim());
    if (modelEntries.length === 0) {
      const message = t('ai_providers.claude_test_model_required');
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
        setTestMessage(t('ai_providers.claude_test_all_models_running', { model: modelName }));

        let success = false;
        try {
          const result = await apiCallApi.request(
            {
              method: 'POST',
              url: prepared.endpoint,
              header: prepared.headers,
              data: JSON.stringify({
                model: modelName,
                max_tokens: 8,
                messages: [{ role: 'user', content: 'Hi' }],
              }),
            },
            { timeout: CLAUDE_TEST_TIMEOUT_MS }
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
          ? t('ai_providers.claude_test_all_models_success', { count: successCount })
          : t('ai_providers.claude_test_all_models_done', {
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
    buildClaudeTestHeaders,
    form.modelEntries,
    isTesting,
    setForm,
    setTestMessage,
    setTestModel,
    setTestStatus,
    showNotification,
    t,
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
              label={t('ai_providers.claude_add_modal_key_label')}
              value={form.apiKey}
              onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
              disabled={saving || disableControls || isTesting}
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
              disabled={saving || disableControls || isTesting}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={saving || disableControls || isTesting}
            />
            <Input
              label={t('ai_providers.claude_add_modal_url_label')}
              value={form.baseUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              disabled={saving || disableControls || isTesting}
            />
            <Input
              label={t('ai_providers.claude_add_modal_proxy_label')}
              value={form.proxyUrl ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              disabled={saving || disableControls || isTesting}
            />
            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={saving || disableControls || isTesting}
            />

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>{t('ai_providers.claude_models_label')}</label>
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
                    disabled={saving || disableControls || isTesting}
                  >
                    {t('ai_providers.claude_models_add_btn')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={openClaudeModelDiscovery}
                    disabled={saving || disableControls || isTesting}
                  >
                    {t('ai_providers.claude_models_fetch_button')}
                  </Button>
                </div>
              </div>

              <div className={styles.sectionHint}>{t('ai_providers.claude_models_hint')}</div>

              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={saving || disableControls || isTesting}
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
                  <label className={styles.modelTestLabel}>{t('ai_providers.claude_test_title')}</label>
                  <span className={styles.modelTestHint}>{t('ai_providers.claude_test_hint')}</span>
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
                        ? t('ai_providers.claude_test_select_placeholder')
                        : t('ai_providers.claude_test_select_empty')
                    }
                    className={styles.openaiTestSelect}
                    ariaLabel={t('ai_providers.claude_test_title')}
                    disabled={
                      saving ||
                      disableControls ||
                      isTesting ||
                      testStatus === 'loading' ||
                      availableModels.length === 0
                    }
                  />
                  <Button
                    variant={testStatus === 'error' ? 'danger' : 'secondary'}
                    size="sm"
                    onClick={() => void runClaudeConnectivityTest()}
                    loading={testStatus === 'loading'}
                    disabled={
                      saving ||
                      disableControls ||
                      isTesting ||
                      testStatus === 'loading' ||
                      availableModels.length === 0
                    }
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.claude_test_action')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testAllModels()}
                    loading={testStatus === 'loading'}
                    disabled={
                      saving ||
                      disableControls ||
                      isTesting ||
                      testStatus === 'loading' ||
                      availableModels.length === 0
                    }
                    title={t('ai_providers.claude_test_all_models_hint')}
                    className={styles.modelTestAllButton}
                  >
                    {t('ai_providers.claude_test_all_models_action')}
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
                disabled={saving || disableControls || isTesting}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <label className={styles.modelConfigTitle}>{t('ai_providers.claude_cloak_title')}</label>
                <div className={styles.modelConfigToolbar}>
                  <ToggleSwitch
                    checked={Boolean(form.cloak)}
                    onChange={(enabled) =>
                      setForm((prev) => {
                        if (!enabled) {
                          if (prev.cloak) {
                            lastCloakConfigRef.current = prev.cloak;
                          }
                          return { ...prev, cloak: undefined };
                        }

                        const restored = prev.cloak
                          ?? lastCloakConfigRef.current
                          ?? { mode: 'auto', strictMode: false, sensitiveWords: [] };
                        const mode = String(restored.mode ?? 'auto').trim() || 'auto';
                        return {
                          ...prev,
                          cloak: {
                            mode,
                            strictMode: restored.strictMode ?? false,
                            sensitiveWords: restored.sensitiveWords ?? [],
                          },
                        };
                      })
                    }
                    disabled={saving || disableControls || isTesting}
                    ariaLabel={t('ai_providers.claude_cloak_toggle_aria')}
                    label={t('ai_providers.claude_cloak_toggle_label')}
                  />
                </div>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.claude_cloak_hint')}</div>

              {form.cloak ? (
                <>
                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_mode_label')}</label>
                    <Select
                      value={resolvedCloakMode}
                      options={cloakModeOptions}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            mode: value,
                          },
                        }))
                      }
                      ariaLabel={t('ai_providers.claude_cloak_mode_label')}
                      disabled={saving || disableControls || isTesting}
                    />
                    <div className="hint">{t('ai_providers.claude_cloak_mode_hint')}</div>
                  </div>

                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_strict_label')}</label>
                    <ToggleSwitch
                      checked={Boolean(form.cloak.strictMode)}
                      onChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            strictMode: value,
                          },
                        }))
                      }
                      disabled={saving || disableControls || isTesting}
                      ariaLabel={t('ai_providers.claude_cloak_strict_label')}
                    />
                    <div className="hint">{t('ai_providers.claude_cloak_strict_hint')}</div>
                  </div>

                  <div className="form-group">
                    <label>{t('ai_providers.claude_cloak_sensitive_words_label')}</label>
                    <textarea
                      className="input"
                      placeholder={t('ai_providers.claude_cloak_sensitive_words_placeholder')}
                      value={(form.cloak.sensitiveWords ?? []).join('\n')}
                      onChange={(e) => {
                        const nextWords = parseTextList(e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          cloak: {
                            ...(prev.cloak ?? {}),
                            sensitiveWords: nextWords.length ? nextWords : undefined,
                          },
                        }));
                      }}
                      rows={3}
                      disabled={saving || disableControls || isTesting}
                    />
                    <div className="hint">{t('ai_providers.claude_cloak_sensitive_words_hint')}</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}
