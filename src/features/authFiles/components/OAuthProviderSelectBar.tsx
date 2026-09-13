import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import {
  DEFAULT_OAUTH_PROVIDER_EXCLUDES,
  DEFAULT_OAUTH_PROVIDER_PRESETS,
  normalizeProviderKey,
} from '../constants';
import styles from './OAuthProviderSelectBar.module.scss';

export interface OAuthProviderSelectBarProps {
  id?: string;
  provider: string;
  onChange: (provider: string) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  placeholder?: string;
  files?: AuthFileItem[];
  excluded?: Record<string, string[]>;
  modelAlias?: Record<string, OAuthModelAliasEntry[]>;
  presets?: string[];
  excludes?: Set<string>;
  options?: string[];
  className?: string;
}

export function OAuthProviderSelectBar({
  id = 'oauth-provider-select',
  provider,
  onChange,
  disabled = false,
  label,
  description,
  placeholder,
  files = [],
  excluded = {},
  modelAlias = {},
  presets = DEFAULT_OAUTH_PROVIDER_PRESETS,
  excludes = DEFAULT_OAUTH_PROVIDER_EXCLUDES,
  options: overrideOptions,
  className,
}: OAuthProviderSelectBarProps) {
  const { t } = useTranslation();

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

  const providerOptions = useMemo(() => {
    if (overrideOptions) return overrideOptions;

    const extraProviders = new Set<string>();
    Object.keys(excluded).forEach((value) => extraProviders.add(value));
    Object.keys(modelAlias).forEach((value) => extraProviders.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') extraProviders.add(file.type);
      if (typeof file.provider === 'string') extraProviders.add(file.provider);
    });

    const normalizedExtras = Array.from(extraProviders)
      .map((value) => value.trim())
      .filter((value) => value && !excludes.has(value.toLowerCase()));

    const baseSet = new Set(presets.map((value) => value.toLowerCase()));
    const extraList = normalizedExtras
      .filter((value) => !baseSet.has(value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    return [...presets, ...extraList];
  }, [overrideOptions, excluded, modelAlias, files, excludes, presets]);

  const activeProviderKey = normalizeProviderKey(provider);

  return (
    <div className={`${styles.settingsSection} ${className ?? ''}`}>
      <div className={styles.settingsRow}>
        <div className={styles.settingsInfo}>
          <div className={styles.settingsLabel}>
            {label ?? t('oauth_excluded.provider_label')}
          </div>
          {description !== undefined ? (
            description ? <div className={styles.settingsDesc}>{description}</div> : null
          ) : (
            <div className={styles.settingsDesc}>{t('oauth_excluded.provider_hint')}</div>
          )}
        </div>
        <div className={styles.settingsControl}>
          <AutocompleteInput
            id={id}
            placeholder={placeholder ?? t('oauth_excluded.provider_placeholder')}
            value={provider}
            onChange={onChange}
            options={providerOptions}
            disabled={disabled}
            wrapperStyle={{ marginBottom: 0 }}
          />
        </div>
      </div>

      {providerOptions.length > 0 && (
        <div className={styles.tagList}>
          {providerOptions.map((option) => {
            const isActive = activeProviderKey === option.toLowerCase();
            return (
              <button
                key={option}
                type="button"
                className={`${styles.tag} ${isActive ? styles.tagActive : ''}`}
                onClick={() => onChange(option)}
                disabled={disabled}
              >
                {getTypeLabel(option)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
