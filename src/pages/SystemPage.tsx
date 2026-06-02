import iconClaude from '@/assets/icons/claude.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconBookOpen, IconCode, IconExternalLink, IconGithub } from '@/components/ui/icons';
import { configApi, versionApi } from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import {
  useAuthStore,
  useConfigStore,
  useModelsStore,
  useNotificationStore,
  useThemeStore,
} from '@/stores';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { copyToClipboard } from '@/utils/clipboard';
import { classifyModels } from '@/utils/models';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

type ModelCategory = keyof typeof MODEL_CATEGORY_ICONS;
type HandlerType = ModelCategory | 'other' | '';

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const { showNotification, showConfirmation } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const auth = useAuthStore();
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [disabledAutoModels, setDisabledAutoModels] = useState<string[]>([]);
  const [modelSelectionCounts, setModelSelectionCounts] = useState<Record<string, number>>({});
  const [modelFilterTab, setModelFilterTab] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [handlerTypeFilter, setHandlerTypeFilter] = useState<HandlerType>('');

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);

  const isModelDisabled = useCallback(
    (modelName: string): boolean => {
      return disabledAutoModels.some((key) => key.startsWith(`${modelName}:`) || key === modelName);
    },
    [disabledAutoModels]
  );

  const getModelSelectionCount = useCallback(
    (modelName: string): number => {
      return modelSelectionCounts[modelName] ?? 0;
    },
    [modelSelectionCounts]
  );

  const filteredGroupedModels = useMemo(() => {
    let groups = groupedModels;
    if (handlerTypeFilter) {
      groups = groups.filter((g) => g.id === handlerTypeFilter || g.id === 'other');
    }
    if (modelFilterTab === 'enabled') {
      groups = groups
        .map((g) => ({
          ...g,
          items: g.items.filter((m) => !isModelDisabled(m.name)),
        }))
        .filter((g) => g.items.length > 0);
    } else if (modelFilterTab === 'disabled') {
      groups = groups
        .map((g) => ({
          ...g,
          items: g.items.filter((m) => isModelDisabled(m.name)),
        }))
        .filter((g) => g.items.length > 0);
    }
    return groups
      .map((g) => ({
        ...g,
        items: [...g.items].sort((a, b) => {
          const countA = getModelSelectionCount(a.name);
          const countB = getModelSelectionCount(b.name);
          return countB - countA;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groupedModels, handlerTypeFilter, modelFilterTab, isModelDisabled, getModelSelectionCount]);

  const availableCount = useMemo(
    () => models.filter((m) => !isModelDisabled(m.name)).length,
    [models, isModelDisabled]
  );
  const disabledCount = useMemo(
    () => models.filter((m) => isModelDisabled(m.name)).length,
    [models, isModelDisabled]
  );

  const requestLogEnabled = config?.requestLog ?? false;
  const requestLogDirty = requestLogDraft !== requestLogEnabled;
  const canEditRequestLog = auth.connectionStatus === 'connected' && Boolean(config);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = auth.serverVersion || t('system_info.version_unknown');

  const parseBuildDate = (dateStr?: string | null): Date | null => {
    if (!dateStr || dateStr.toLowerCase() === 'unknown') return null;

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    const formatPatterns = [
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
      /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
      /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/,
    ];

    for (const pattern of formatPatterns) {
      const match = dateStr.match(pattern);
      if (match) {
        const [, year, month, day, hour, minute, second] = match.map(Number);
        return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      }
    }

    return null;
  };

  const buildDate = parseBuildDate(auth.serverBuildDate);
  const buildTime = buildDate
    ? buildDate.toLocaleString(i18n.language)
    : t('system_info.version_unknown');

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };


  const handleModelIdCopy = useCallback(
    async (modelId: string) => {
      const copied = await copyToClipboard(modelId);
      showNotification(
        copied
          ? `${t('notification.link_copied', { defaultValue: 'Copied to clipboard' })}: ${modelId}`
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModelsAndStats = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (auth.connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!auth.apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(auth.apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
      if (auth.connectionStatus === 'connected') {
        try {
          const [disabled, counts] = await Promise.all([
            configApi.getDisabledAutoModels(),
            configApi.getModelSelectionCounts(),
          ]);
          setDisabledAutoModels(disabled);
          setModelSelectionCounts(counts);
        } catch {
          // ignore stats errors
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title', { defaultValue: 'Clear Login Storage' }),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        auth.logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [STORAGE_KEY_AUTH, 'isLoggedIn', 'apiBase', 'apiUrl', 'managementKey'];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogDraft(requestLogEnabled);
    setRequestLogModalOpen(true);
  }, [requestLogEnabled]);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    if (versionTapTimer.current) {
      clearTimeout(versionTapTimer.current);
    }

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
      openRequestLogModal();
      return;
    }

    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
      versionTapTimer.current = null;
    }, 1500);
  }, [openRequestLogModal]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', requestLogDraft);

    try {
      await configApi.updateRequestLog(requestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      const comparison = compareVersions(latest, auth.serverVersion);

      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }

      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
        return;
      }

      if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const suffix = message ? `: ${message}` : '';
      showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
    } finally {
      setCheckingVersion(false);
    }
  }, [auth.serverVersion, showNotification, t]);

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (requestLogModalOpen && !requestLogTouched) {
      setRequestLogDraft(requestLogEnabled);
    }
  }, [requestLogModalOpen, requestLogTouched, requestLogEnabled]);

  useEffect(() => {
    return () => {
      if (versionTapTimer.current) {
        clearTimeout(versionTapTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchModelsAndStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('system_info.title')}</h1>
      <div className={styles.content}>
        <Card className={styles.aboutCard}>
          <div className={styles.aboutHeader}>
            <img src={INLINE_LOGO_JPEG} alt="CPAMC" className={styles.aboutLogo} />
            <div className={styles.aboutTitle}>{t('system_info.about_title')}</div>
          </div>

          <div className={styles.aboutInfoGrid}>
            <button
              type="button"
              className={`${styles.infoTile} ${styles.tapTile}`}
              onClick={handleInfoVersionTap}
            >
              <div className={styles.tileHeader}>
                <div className={styles.tileLabel}>{t('footer.version')}</div>
              </div>
              <div className={styles.tileValue}>{appVersion}</div>
            </button>

            <div className={styles.infoTile}>
              <div className={styles.tileHeader}>
                <div className={styles.tileLabel}>{t('footer.api_version')}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.tileAction}
                  onClick={() => void handleVersionCheck()}
                  loading={checkingVersion}
                  title={t('system_info.version_check_button')}
                  aria-label={t('system_info.version_check_button')}
                >
                  {t('system_info.version_check_button')}
                </Button>
              </div>
              <div className={styles.tileValue}>{apiVersion}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('footer.build_date')}</div>
              <div className={styles.tileValue} style={{ paddingTop: '1rem' }}>{buildTime}</div>
            </div>

            <div className={styles.infoTile}>
              <div className={styles.tileLabel}>{t('connection.status')}</div>
              <div className={styles.tileValue}>{t(`common.${auth.connectionStatus}_status`)}</div>
              <div className={styles.tileSub}>{auth.apiBase || '-'}</div>
            </div>
          </div>
        </Card>

        <Card title={t('system_info.quick_links_title')}>
          <p className={styles.sectionDescription}>{t('system_info.quick_links_desc')}</p>
          <div className={styles.quickLinks}>
            <a
              href="https://github.com/liyao52033668/CLIProxyAPIPlus"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconGithub size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_main_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_main_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://github.com/liyao52033668/Cli-Proxy-API-Management-Center"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.github}`}>
                <IconCode size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_webui_repo')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_webui_repo_desc')}</div>
              </div>
            </a>

            <a
              href="https://help.router-for.me/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkCard}
            >
              <div className={`${styles.linkIcon} ${styles.docs}`}>
                <IconBookOpen size={22} />
              </div>
              <div className={styles.linkContent}>
                <div className={styles.linkTitle}>
                  {t('system_info.link_docs')}
                  <IconExternalLink size={14} />
                </div>
                <div className={styles.linkDesc}>{t('system_info.link_docs_desc')}</div>
              </div>
            </a>
          </div>
        </Card>

        <Card
          title={t('system_info.models_title')}
          extra={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchModelsAndStats({ forceRefresh: true })}
              loading={modelsLoading}
            >
              {t('common.refresh')}
            </Button>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
          {modelStatus && (
            <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>
          )}
          {modelsError && <div className="error-box">{modelsError}</div>}
          {modelsLoading ? (
            <div className="hint">{t('common.loading')}</div>
          ) : models.length === 0 ? (
            <div className="hint">{t('system_info.models_empty')}</div>
          ) : (
            <>
              <div className={styles.modelsFilters}>
                <div className={styles.modelsSearchWrapper}>
                  <Input
                    type="text"
                    placeholder={t('system_info.models_search_placeholder', { defaultValue: 'Search models...' })}
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    className={styles.modelsSearchInput}
                  />
                </div>
                <div className={styles.modelsFilterRow}>
                  <div className={styles.modelTabs}>
                    <button
                      type="button"
                      className={`${styles.modelTab} ${modelFilterTab === 'all' ? styles.modelTabActive : ''}`}
                      onClick={() => setModelFilterTab('all')}
                    >
                      {t('system_info.filter_all')} ({models.length})
                    </button>
                    <button
                      type="button"
                      className={`${styles.modelTab} ${modelFilterTab === 'enabled' ? styles.modelTabActive : ''}`}
                      onClick={() => setModelFilterTab('enabled')}
                    >
                      {t('system_info.filter_enabled')} ({availableCount})
                    </button>
                    <button
                      type="button"
                      className={`${styles.modelTab} ${modelFilterTab === 'disabled' ? styles.modelTabActive : ''}`}
                      onClick={() => setModelFilterTab('disabled')}
                    >
                      {t('system_info.filter_disabled')} ({disabledCount})
                    </button>
                  </div>
                  <select
                    className={styles.handlerTypeSelect}
                    value={handlerTypeFilter}
                    onChange={(e) => setHandlerTypeFilter(e.target.value as HandlerType)}
                  >
                    <option value="">{t('system_info.filter_all_handler')}</option>
                    <option value="gpt">GPT</option>
                    <option value="claude">Claude</option>
                    <option value="gemini">Gemini</option>
                    <option value="kimi">Kimi</option>
                    <option value="qwen">Qwen</option>
                    <option value="glm">GLM</option>
                    <option value="grok">Grok</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="minimax">MiniMax</option>
                    <option value="other">{t('system_info.filter_other')}</option>
                  </select>
                </div>
              </div>
              <div className="item-list">
                {filteredGroupedModels
                  .map((group) => {
                    const filteredItems = group.items.filter((model) => {
                      if (!modelSearchQuery) return true;
                      const query = modelSearchQuery.toLowerCase();
                      return (
                        model.name.toLowerCase().includes(query) ||
                        model.alias?.toLowerCase().includes(query) ||
                        model.description?.toLowerCase().includes(query)
                      );
                    });
                    if (filteredItems.length === 0) return null;
                    const iconSrc = getIconForCategory(group.id);
                    return (
                      <div key={group.id} className="item-row">
                        <div className="item-meta">
                          <div className={styles.groupTitle}>
                            {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                            <span className="item-title">{group.label}</span>
                          </div>
                          <div className="item-subtitle">
                            {t('system_info.models_count', { count: filteredItems.length })}
                          </div>
                        </div>
                        <div className={styles.modelTags}>
                          {filteredItems.map((model) => {
                            const disabled = isModelDisabled(model.name);
                            const count = getModelSelectionCount(model.name);
                            return (
                              <span
                                key={`${model.name}-${model.alias ?? 'default'}`}
                                className={`${styles.modelTag} ${disabled ? styles.modelTagDisabled : ''}`}
                                title={model.description || ''}
                                role="button"
                                tabIndex={0}
                                aria-label={`${t('common.copy')}: ${model.name}`}
                                onClick={() => void handleModelIdCopy(model.name)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    void handleModelIdCopy(model.name);
                                  }
                                }}
                              >
                                <span className={styles.modelName}>{model.name}</span>
                                {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                                {count > 0 && (
                                  <span className={styles.modelCount}>{count}</span>
                                )}
                                {disabled && (
                                  <span className={styles.modelDisabledBadge}>{t('system_info.models_excluded_badge')}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                  .filter(Boolean)}
              </div>
            </>
          )}
        </Card>

        <Card title={t('system_info.clear_login_title')}>
          <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
          <div className={styles.clearLoginActions}>
            <Button variant="danger" onClick={handleClearLoginStorage}>
              {t('system_info.clear_login_button')}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div className="status-badge warning">{t('basic_settings.request_log_warning')}</div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={requestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
