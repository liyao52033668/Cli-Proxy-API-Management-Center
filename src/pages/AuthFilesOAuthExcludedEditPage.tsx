import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconInfo } from '@/components/ui/icons';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useAuthStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import styles from './AuthFilesOAuthExcludedEditPage.module.scss';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

type LocationState = { fromAuthFiles?: boolean } | null;

const OAUTH_PROVIDER_PRESETS = [
  'gemini-cli',
  'vertex',
  'aistudio',
  'antigravity',
  'claude',
  'codex',
  'qwen',
  'kimi',
  'iflow',
];

const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);

const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

export function AuthFilesOAuthExcludedEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [searchParams, setSearchParams] = useSearchParams();
  const providerFromParams = searchParams.get('provider') ?? '';

  const [provider, setProvider] = useState(providerFromParams);
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);
  const [saving, setSaving] = useState(false);

  // 搜索、筛选和自定义模型输入
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'disabled' | 'enabled'>('all');
  const [customModelInput, setCustomModelInput] = useState('');

  useEffect(() => {
    setProvider(providerFromParams);
  }, [providerFromParams]);

  const providerOptions = useMemo(() => {
    const extraProviders = new Set<string>();
    Object.keys(excluded).forEach((value) => extraProviders.add(value));
    Object.keys(modelAlias).forEach((value) => extraProviders.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') {
        extraProviders.add(file.type);
      }
      if (typeof file.provider === 'string') {
        extraProviders.add(file.provider);
      }
    });

    const normalizedExtras = Array.from(extraProviders)
      .map((value) => value.trim())
      .filter((value) => value && !OAUTH_PROVIDER_EXCLUDES.has(value.toLowerCase()));

    const baseSet = new Set(OAUTH_PROVIDER_PRESETS.map((value) => value.toLowerCase()));
    const extraList = normalizedExtras
      .filter((value) => !baseSet.has(value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    return [...OAUTH_PROVIDER_PRESETS, ...extraList];
  }, [excluded, files, modelAlias]);

  const getTypeLabel = useCallback(
    (type: string): string => {
      const key = `auth_files.filter_${type}`;
      const translated = t(key);
      if (translated !== key) return translated;
      if (type.toLowerCase() === 'iflow') return 'iFlow';
      return type.charAt(0).toUpperCase() + type.slice(1);
    },
    [t]
  );

  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const isEditing = useMemo(() => {
    if (!resolvedProviderKey) return false;
    return Object.prototype.hasOwnProperty.call(excluded, resolvedProviderKey);
  }, [excluded, resolvedProviderKey]);

  const title = useMemo(() => {
    if (isEditing) {
      return t('oauth_excluded.edit_title', { provider: provider.trim() || resolvedProviderKey });
    }
    return t('oauth_excluded.add_title');
  }, [isEditing, provider, resolvedProviderKey, t]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
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

    const load = async () => {
      setInitialLoading(true);
      setExcludedUnsupported(false);
      try {
        const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
          authFilesApi.list(),
          authFilesApi.getOauthExcludedModels(),
          authFilesApi.getOauthModelAlias(),
        ]);

        if (cancelled) return;

        if (filesResult.status === 'fulfilled') {
          setFiles(filesResult.value?.files ?? []);
        }

        if (aliasResult.status === 'fulfilled') {
          setModelAlias(aliasResult.value ?? {});
        }

        if (excludedResult.status === 'fulfilled') {
          setExcluded(excludedResult.value ?? {});
          return;
        }

        const err = excludedResult.status === 'rejected' ? excludedResult.reason : null;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 404) {
          setExcludedUnsupported(true);
          return;
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setInitialLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedProviderKey) {
      setSelectedModels(new Set());
      return;
    }
    const existing = excluded[resolvedProviderKey] ?? [];
    setSelectedModels(new Set(existing));
  }, [excluded, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || excludedUnsupported) {
      setModelsList([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError(null);

    authFilesApi
      .getModelDefinitions(resolvedProviderKey)
      .then((models) => {
        if (cancelled) return;
        setModelsList(models);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 404) {
          setModelsList([]);
          setModelsError('unsupported');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excludedUnsupported, resolvedProviderKey, showNotification, t]);

  const updateProvider = useCallback(
    (value: string) => {
      setProvider(value);
      const next = new URLSearchParams(searchParams);
      const trimmed = value.trim();
      if (trimmed) {
        next.set('provider', trimmed);
      } else {
        next.delete('provider');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const toggleModel = useCallback((modelId: string, checked: boolean) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  }, []);

  const handleRemoveDisabled = useCallback((modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });
  }, []);

  const handleClearAllDisabled = useCallback(() => {
    setSelectedModels(new Set());
  }, []);

  const handleAddCustomModel = useCallback(() => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
    setCustomModelInput('');
  }, [customModelInput]);

  // 合并后端返回的模型列表与当前已禁用的模型列表（被过滤掉或离线的已禁用模型合成补全）
  const { combinedModels, onlineModelIds } = useMemo(() => {
    const list: AuthFileModelItem[] = [...modelsList];
    const onlineIds = new Set(modelsList.map((m) => m.id.toLowerCase()));

    // 补全已配置禁用但不在在线模型列表中的模型
    selectedModels.forEach((modelId) => {
      if (!onlineIds.has(modelId.toLowerCase())) {
        list.push({
          id: modelId,
          display_name: modelId,
        });
      }
    });

    // 排序：已勾选禁用的模型排在前面，其余按字母排序
    list.sort((a, b) => {
      const aDisabled = selectedModels.has(a.id);
      const bDisabled = selectedModels.has(b.id);
      if (aDisabled && !bDisabled) return -1;
      if (!aDisabled && bDisabled) return 1;
      return a.id.localeCompare(b.id);
    });

    return { combinedModels: list, onlineModelIds: onlineIds };
  }, [modelsList, selectedModels]);

  // 搜索和筛选过滤
  const filteredModels = useMemo(() => {
    let list = combinedModels;
    if (filterTab === 'disabled') {
      list = list.filter((m) => selectedModels.has(m.id));
    } else if (filterTab === 'enabled') {
      list = list.filter((m) => !selectedModels.has(m.id));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const idMatch = m.id.toLowerCase().includes(q);
        const nameMatch = m.display_name?.toLowerCase().includes(q);
        return idMatch || nameMatch;
      });
    }
    return list;
  }, [combinedModels, filterTab, searchQuery, selectedModels]);

  const disabledCount = selectedModels.size;
  const totalCount = combinedModels.length;
  const enabledCount = Math.max(0, totalCount - disabledCount);

  const handleSave = useCallback(async () => {
    const normalizedProvider = normalizeProviderKey(provider);
    if (!normalizedProvider) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }

    const models = [...selectedModels];
    setSaving(true);
    try {
      if (models.length) {
        await authFilesApi.saveOauthExcludedModels(normalizedProvider, models);
      } else {
        await authFilesApi.deleteOauthExcludedEntry(normalizedProvider);
      }
      showNotification(t('oauth_excluded.save_success'), 'success');
      handleBack();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [handleBack, provider, selectedModels, showNotification, t]);

  const canSave = !disableControls && !saving && !excludedUnsupported;

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      contentClassName={styles.pageContent}
      rightAction={
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!canSave}>
          {t('oauth_excluded.save')}
        </Button>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      {excludedUnsupported ? (
        <Card>
          <EmptyState
            title={t('oauth_excluded.upgrade_required_title')}
            description={t('oauth_excluded.upgrade_required_desc')}
          />
        </Card>
      ) : (
        <>
          <Card className={styles.settingsCard}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>
                <IconInfo size={16} />
                <span>{t('oauth_excluded.title')}</span>
              </div>
              <div className={styles.settingsHeaderHint}>{t('oauth_excluded.description')}</div>
            </div>

            <div className={styles.settingsSection}>
              <div className={styles.settingsRow}>
                <div className={styles.settingsInfo}>
                  <div className={styles.settingsLabel}>{t('oauth_excluded.provider_label')}</div>
                  <div className={styles.settingsDesc}>{t('oauth_excluded.provider_hint')}</div>
                </div>
                <div className={styles.settingsControl}>
                  <AutocompleteInput
                    id="oauth-excluded-provider"
                    placeholder={t('oauth_excluded.provider_placeholder')}
                    value={provider}
                    onChange={updateProvider}
                    options={providerOptions}
                    disabled={disableControls || saving}
                    wrapperStyle={{ marginBottom: 0 }}
                  />
                </div>
              </div>

              {providerOptions.length > 0 && (
                <div className={styles.tagList}>
                  {providerOptions.map((option) => {
                    const isActive = normalizeProviderKey(provider) === option.toLowerCase();
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.tag} ${isActive ? styles.tagActive : ''}`}
                        onClick={() => updateProvider(option)}
                        disabled={disableControls || saving}
                      >
                        {getTypeLabel(option)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className={styles.settingsCard}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>{t('oauth_excluded.models_label')}</div>
              {resolvedProviderKey && (
                <div className={styles.modelsHint}>
                  {modelsLoading ? (
                    <>
                      <LoadingSpinner size={14} />
                      <span>{t('oauth_excluded.models_loading')}</span>
                    </>
                  ) : modelsError === 'unsupported' ? (
                    <span>{t('oauth_excluded.models_unsupported')}</span>
                  ) : totalCount > 0 ? (
                    <span>
                      {t('oauth_excluded.models_loaded', { count: totalCount })}
                      {disabledCount > 0 && (
                        <> ({t('oauth_excluded.model_count', { count: disabledCount })})</>
                      )}
                    </span>
                  ) : (
                    <span>{t('oauth_excluded.no_models_available')}</span>
                  )}
                </div>
              )}
            </div>

            {/* 自定义模型/通配符规则输入 */}
            {resolvedProviderKey && (
              <div className={styles.customInputRow}>
                <div className={styles.customInputControl}>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('oauth_excluded.custom_model_placeholder')}
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomModel();
                      }
                    }}
                    disabled={disableControls || saving}
                  />
                </div>
                <div className={styles.customInputBtn}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddCustomModel}
                    disabled={disableControls || saving || !customModelInput.trim()}
                  >
                    {t('oauth_excluded.custom_model_add')}
                  </Button>
                </div>
              </div>
            )}

            {/* 已禁用模型概览与快捷管理标签区 */}
            {disabledCount > 0 && (
              <div className={styles.disabledSummarySection}>
                <div className={styles.disabledSummaryHeader}>
                  <div className={styles.disabledSummaryTitle}>
                    <span>{t('oauth_excluded.disabled_models_title')}</span>
                    <span>({disabledCount})</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearAllDisabled}
                    disabled={disableControls || saving}
                    style={{ fontSize: '11px', padding: '2px 6px', height: 'auto' }}
                  >
                    {t('oauth_excluded.clear_all')}
                  </Button>
                </div>
                <div className={styles.disabledTagsList}>
                  {Array.from(selectedModels).map((modelId) => (
                    <span key={modelId} className={styles.disabledTagChip} title={modelId}>
                      <span>{modelId}</span>
                      <button
                        type="button"
                        className={styles.disabledTagRemove}
                        onClick={() => handleRemoveDisabled(modelId)}
                        disabled={disableControls || saving}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 列表过滤与搜索工具栏 */}
            {totalCount > 0 && (
              <div className={styles.toolbarRow}>
                <div className={styles.filterTabs}>
                  <button
                    type="button"
                    className={`${styles.filterTab} ${filterTab === 'all' ? styles.filterTabActive : ''}`}
                    onClick={() => setFilterTab('all')}
                  >
                    {t('oauth_excluded.filter_all')} ({totalCount})
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterTab} ${filterTab === 'disabled' ? styles.filterTabActive : ''}`}
                    onClick={() => setFilterTab('disabled')}
                  >
                    {t('oauth_excluded.filter_disabled')} ({disabledCount})
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterTab} ${filterTab === 'enabled' ? styles.filterTabActive : ''}`}
                    onClick={() => setFilterTab('enabled')}
                  >
                    {t('oauth_excluded.filter_enabled')} ({enabledCount})
                  </button>
                </div>

                <div className={styles.searchInputWrap}>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('oauth_excluded.search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ height: '32px', fontSize: '12px' }}
                  />
                </div>
              </div>
            )}

            {modelsLoading ? (
              <div className={styles.loadingModels}>
                <LoadingSpinner size={16} />
                <span>{t('common.loading')}</span>
              </div>
            ) : filteredModels.length > 0 ? (
              <div className={styles.modelList}>
                {filteredModels.map((model) => {
                  const checked = selectedModels.has(model.id);
                  const isOnline = onlineModelIds.has(model.id.toLowerCase());
                  return (
                    <SelectionCheckbox
                      key={model.id}
                      checked={checked}
                      disabled={disableControls || saving}
                      onChange={(value) => toggleModel(model.id, value)}
                      className={`${styles.modelItem} ${checked ? styles.modelItemDisabled : ''}`}
                      labelClassName={styles.modelText}
                      label={
                        <>
                          <div className={styles.modelHeaderLine}>
                            <span className={styles.modelId}>{model.id}</span>
                            {checked && (
                              <span className={styles.modelBadgeDisabled}>
                                {t('oauth_excluded.badge_disabled')}
                              </span>
                            )}
                          </div>
                          {model.display_name && model.display_name !== model.id && (
                            <span className={styles.modelDisplayName}>{model.display_name}</span>
                          )}
                          {!isOnline && checked && (
                            <span className={styles.customModelSubtext}>
                              {t('oauth_excluded.custom_or_offline')}
                            </span>
                          )}
                        </>
                      }
                    />
                  );
                })}
              </div>
            ) : resolvedProviderKey ? (
              <div className={styles.emptyModels}>
                {modelsError === 'unsupported'
                  ? t('oauth_excluded.models_unsupported')
                  : t('oauth_excluded.no_models_available')}
              </div>
            ) : (
              <div className={styles.emptyModels}>{t('oauth_excluded.provider_required')}</div>
            )}
          </Card>
        </>
      )}
    </SecondaryScreenShell>
  );
}
