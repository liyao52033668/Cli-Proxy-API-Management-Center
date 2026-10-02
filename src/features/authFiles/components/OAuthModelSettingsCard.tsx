import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { OAuthModelSettingEntry } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;

export type OAuthModelSettingsCardProps = {
  disableControls: boolean;
  onAdd: () => void;
  onEditProvider: (provider?: string) => void;
  onDeleteProvider: (provider: string) => void;
  modelSettingsError: UnsupportedError;
  modelSettings: Record<string, OAuthModelSettingEntry[]>;
};

const MAX_PREVIEW_SETTINGS = 8;

const describeSetting = (entry: OAuthModelSettingEntry): string => {
  const parts = [entry.name];
  if (entry.alias) {
    parts.push('→', entry.alias);
  }
  if (entry.maxContextLength && entry.maxContextLength > 0) {
    parts.push('·', `max-context-length: ${entry.maxContextLength}`);
  }
  return parts.join(' ');
};

export function OAuthModelSettingsCard(props: OAuthModelSettingsCardProps) {
  const { t } = useTranslation();
  const {
    disableControls,
    onAdd,
    onEditProvider,
    onDeleteProvider,
    modelSettingsError,
    modelSettings
  } = props;

  return (
    <Card
      title={t('oauth_model_settings.title')}
      extra={
        <Button
          size="sm"
          onClick={onAdd}
          disabled={disableControls || modelSettingsError === 'unsupported'}
        >
          {t('oauth_model_settings.add')}
        </Button>
      }
    >
      {modelSettingsError === 'unsupported' ? (
        <EmptyState
          title={t('oauth_model_settings.upgrade_required_title')}
          description={t('oauth_model_settings.upgrade_required_desc')}
        />
      ) : Object.keys(modelSettings).length === 0 ? (
        <EmptyState title={t('oauth_model_settings.list_empty_all')} />
      ) : (
        <div className={styles.excludedList}>
          {Object.entries(modelSettings).map(([provider, settings]) => {
            const settingsList = settings ?? [];
            const previewList = settingsList.slice(0, MAX_PREVIEW_SETTINGS);
            const remainingCount = settingsList.length - previewList.length;

            return (
              <div key={provider} className={styles.excludedItem}>
                <div className={styles.excludedInfo}>
                  <div className={styles.excludedProvider}>{provider}</div>
                  <div className={styles.excludedModels}>
                    {settingsList.length
                      ? t('oauth_model_settings.model_count', { count: settingsList.length })
                      : t('oauth_model_settings.no_models')}
                  </div>
                  {previewList.length > 0 && (
                    <div className={styles.excludedModelTags}>
                      {previewList.map((entry, index) => (
                        <span
                          key={`${entry.name}::${entry.alias ?? ''}::${index}`}
                          className={styles.excludedModelTag}
                          title={describeSetting(entry)}
                        >
                          {entry.alias ? `${entry.name} → ${entry.alias}` : entry.name}
                        </span>
                      ))}
                      {remainingCount > 0 && (
                        <span
                          className={styles.excludedModelTagMore}
                          title={settingsList.slice(MAX_PREVIEW_SETTINGS).map(describeSetting).join(', ')}
                        >
                          {t('oauth_model_settings.more_models', { count: remainingCount })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.excludedActions}>
                  <Button variant="secondary" size="sm" onClick={() => onEditProvider(provider)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDeleteProvider(provider)}>
                    {t('oauth_model_settings.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
