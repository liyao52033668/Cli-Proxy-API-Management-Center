import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconInfo, IconX } from '@/components/ui/icons';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useAuthStore, useNotificationStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import { clearCacheForAuth } from '@/features/authFiles/hooks/useAuthFilesModels';
import { OAuthProviderSelectBar } from '@/features/authFiles/components/OAuthProviderSelectBar';
import { normalizeProviderKey } from '@/features/authFiles/constants';
import type { AuthFileItem, OAuthModelAliasEntry, OAuthModelSettingEntry } from '@/types';
import { generateId } from '@/utils/helpers';
import styles from './AuthFilesOAuthSettingsEditPage.module.scss';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

type LocationState = { fromAuthFiles?: boolean } | null;

type OAuthSettingFormEntry = {
  id: string;
  name: string;
  alias: string;
  // Raw input value; parsed into a positive integer on save.
  maxContextLength: string;
};

const buildEmptySettingEntry = (): OAuthSettingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  maxContextLength: '',
});

const normalizeSettingEntries = (
  entries?: OAuthModelSettingEntry[]
): OAuthSettingFormEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [buildEmptySettingEntry()];
  }
  return entries.map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    maxContextLength:
      entry.maxContextLength && entry.maxContextLength > 0 ? String(entry.maxContextLength) : '',
  }));
};

export function AuthFilesOAuthSettingsEditPage() {
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
  const [modelSettings, setModelSettings] = useState<Record<string, OAuthModelSettingEntry[]>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [modelSettingsUnsupported, setModelSettingsUnsupported] = useState(false);

  const [settings, setSettings] = useState<OAuthSettingFormEntry[]>([buildEmptySettingEntry()]);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- provider mirrors the ?provider= URL param so browser back/forward stays in sync; the field is also edited locally with untrimmed input, so it cannot be derived purely from the param
    setProvider(providerFromParams);
  }, [providerFromParams]);

  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const title = useMemo(() => t('oauth_model_settings.add_title'), [t]);
  const headerHint = useMemo(() => {
    if (!provider.trim()) {
      return t('oauth_model_settings.provider_hint');
    }
    if (modelsLoading) {
      return t('oauth_model_settings.model_source_loading');
    }
    if (modelsError === 'unsupported') {
      return t('oauth_model_settings.model_source_unsupported');
    }
    return t('oauth_model_settings.model_source_loaded', { count: modelsList.length });
  }, [modelsError, modelsList.length, modelsLoading, provider, t]);

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
      setModelSettingsUnsupported(false);
      try {
        const [filesResult, excludedResult, aliasResult, settingsResult] = await Promise.allSettled([
          authFilesApi.list(),
          authFilesApi.getOauthExcludedModels(),
          authFilesApi.getOauthModelAlias(),
          authFilesApi.getOauthModelSettings(),
        ]);

        if (cancelled) return;

        if (filesResult.status === 'fulfilled') {
          setFiles(filesResult.value?.files ?? []);
        }

        if (excludedResult.status === 'fulfilled') {
          setExcluded(excludedResult.value ?? {});
        }

        if (aliasResult.status === 'fulfilled') {
          setModelAlias(aliasResult.value ?? {});
        }

        if (settingsResult.status === 'fulfilled') {
          setModelSettings(settingsResult.value ?? {});
          return;
        }

        const err = settingsResult.status === 'rejected' ? settingsResult.reason : null;
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;

        if (status === 404) {
          setModelSettingsUnsupported(true);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settings rows are seeded from the async-loaded settings map and re-seeded whenever the provider changes (including via URL navigation), then edited locally
      setSettings([buildEmptySettingEntry()]);
      return;
    }
    const existing = modelSettings[resolvedProviderKey] ?? [];
    setSettings(normalizeSettingEntries(existing));
  }, [modelSettings, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || modelSettingsUnsupported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- this effect is the model-list loader: it clears the previous provider's list and marks loading before the request is issued, and there is no async boundary available to defer that
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
  }, [modelSettingsUnsupported, resolvedProviderKey, showNotification, t]);

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

  const updateSettingEntry = useCallback(
    (index: number, field: 'name' | 'alias' | 'maxContextLength', value: string) => {
      setSettings((prev) =>
        prev.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
      );
    },
    []
  );

  const addSettingEntry = useCallback(() => {
    setSettings((prev) => [...prev, buildEmptySettingEntry()]);
  }, []);

  const removeSettingEntry = useCallback((index: number) => {
    setSettings((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [buildEmptySettingEntry()];
    });
  }, []);

  const handleSave = useCallback(async () => {
    const channel = provider.trim();
    if (!channel) {
      showNotification(t('oauth_model_settings.provider_required'), 'error');
      return;
    }

    // Max context length must be a positive integer or left empty.
    const invalidMaxContext: string[] = [];
    const maxContextByEntryId = new Map<string, number | undefined>();
    settings.forEach((entry) => {
      const raw = entry.maxContextLength.trim();
      if (!raw) {
        maxContextByEntryId.set(entry.id, undefined);
        return;
      }
      const parsed = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed <= 0) {
        if (!invalidMaxContext.includes(raw)) {
          invalidMaxContext.push(raw);
        }
        maxContextByEntryId.set(entry.id, undefined);
        return;
      }
      maxContextByEntryId.set(entry.id, parsed);
    });
    if (invalidMaxContext.length) {
      showNotification(
        t('oauth_model_settings.invalid_max_context', { values: invalidMaxContext.join(', ') }),
        'error'
      );
      return;
    }

    // The backend keeps one entry per name+alias pair within a channel, so a
    // duplicated pair would silently overwrite rows on save. Reject it up front.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const normalized: OAuthModelSettingEntry[] = [];
    settings.forEach((entry) => {
      const name = String(entry.name ?? '').trim();
      // Rows without a model name are dropped, mirroring backend sanitization.
      if (!name) return;
      const alias = String(entry.alias ?? '').trim();
      const key = `${name.toLowerCase()}::${alias.toLowerCase()}`;
      if (seen.has(key)) {
        const label = alias ? `${name} → ${alias}` : name;
        if (!duplicates.some((value) => value.toLowerCase() === label.toLowerCase())) {
          duplicates.push(label);
        }
        return;
      }
      seen.add(key);
      const maxContextLength = maxContextByEntryId.get(entry.id);
      normalized.push({
        name,
        ...(alias ? { alias } : {}),
        ...(maxContextLength ? { maxContextLength } : {}),
      });
    });
    if (duplicates.length) {
      showNotification(
        t('oauth_model_settings.duplicate_entry', { names: duplicates.join(', ') }),
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      if (normalized.length) {
        await authFilesApi.saveOauthModelSettings(channel, normalized);
      } else {
        await authFilesApi.deleteOauthModelSettings(channel);
      }
      clearCacheForAuth();
      showNotification(t('oauth_model_settings.save_success'), 'success');
      handleBack();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_model_settings.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [handleBack, provider, settings, showNotification, t]);

  const canSave = !disableControls && !saving && !modelSettingsUnsupported;

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
          {t('oauth_model_settings.save')}
        </Button>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      {modelSettingsUnsupported ? (
        <Card>
          <EmptyState
            title={t('oauth_model_settings.upgrade_required_title')}
            description={t('oauth_model_settings.upgrade_required_desc')}
          />
        </Card>
      ) : (
        <>
          <Card className={styles.settingsCard}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>
                <IconInfo size={16} />
                <span>{t('oauth_model_settings.title')}</span>
              </div>
              <div className={styles.settingsHeaderHint}>{headerHint}</div>
            </div>

            <OAuthProviderSelectBar
              id="oauth-settings-provider"
              provider={provider}
              onChange={updateProvider}
              disabled={disableControls || saving}
              label={t('oauth_model_settings.provider_label')}
              description={t('oauth_model_settings.provider_hint')}
              placeholder={t('oauth_model_settings.provider_placeholder')}
              files={files}
              excluded={excluded}
              modelAlias={modelAlias}
              modelSettings={modelSettings}
            />
          </Card>

          <Card className={styles.settingsCard}>
            <div className={styles.settingsEntriesHeader}>
              <div className={styles.settingsEntriesTitle}>
                {t('oauth_model_settings.settings_label')}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={addSettingEntry}
                disabled={disableControls || saving || modelSettingsUnsupported}
              >
                {t('oauth_model_settings.add_setting')}
              </Button>
            </div>

            <div className={styles.settingsBody}>
              {settings.map((entry, index) => (
                <div key={entry.id} className={styles.settingRow}>
                  <AutocompleteInput
                    wrapperStyle={{ flex: 1, marginBottom: 0 }}
                    placeholder={t('oauth_model_settings.name_placeholder')}
                    value={entry.name}
                    onChange={(val) => updateSettingEntry(index, 'name', val)}
                    disabled={disableControls || saving}
                    options={modelsList.map((model) => ({
                      value: model.id,
                      label:
                        model.display_name && model.display_name !== model.id
                          ? model.display_name
                          : undefined,
                    }))}
                  />
                  <input
                    className={`input ${styles.settingAliasInput}`}
                    placeholder={t('oauth_model_settings.alias_placeholder')}
                    value={entry.alias}
                    onChange={(e) => updateSettingEntry(index, 'alias', e.target.value)}
                    disabled={disableControls || saving}
                  />
                  <input
                    className={`input ${styles.settingMaxContextInput}`}
                    type="number"
                    min={1}
                    step={1}
                    placeholder={t('oauth_model_settings.max_context_placeholder')}
                    title={t('oauth_model_settings.max_context_hint')}
                    aria-label={t('oauth_model_settings.max_context_hint')}
                    value={entry.maxContextLength}
                    onChange={(e) => updateSettingEntry(index, 'maxContextLength', e.target.value)}
                    disabled={disableControls || saving}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSettingEntry(index)}
                    disabled={disableControls || saving || settings.length <= 1}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <IconX size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </SecondaryScreenShell>
  );
}
