import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;

export type OAuthExcludedCardProps = {
  disableControls: boolean;
  excludedError: UnsupportedError;
  excluded: Record<string, string[]>;
  onAdd: () => void;
  onEdit: (provider: string) => void;
  onDelete: (provider: string) => void;
};

const MAX_PREVIEW_MODELS = 8;

export function OAuthExcludedCard(props: OAuthExcludedCardProps) {
  const { t } = useTranslation();
  const { disableControls, excludedError, excluded, onAdd, onEdit, onDelete } = props;

  return (
    <Card
      title={t('oauth_excluded.title')}
      extra={
        <Button size="sm" onClick={onAdd} disabled={disableControls || excludedError === 'unsupported'}>
          {t('oauth_excluded.add')}
        </Button>
      }
    >
      {excludedError === 'unsupported' ? (
        <EmptyState
          title={t('oauth_excluded.upgrade_required_title')}
          description={t('oauth_excluded.upgrade_required_desc')}
        />
      ) : Object.keys(excluded).length === 0 ? (
        <EmptyState title={t('oauth_excluded.list_empty_all')} />
      ) : (
        <div className={styles.excludedList}>
          {Object.entries(excluded).map(([provider, models]) => {
            const modelList = models ?? [];
            const previewList = modelList.slice(0, MAX_PREVIEW_MODELS);
            const remainingCount = modelList.length - previewList.length;

            return (
              <div key={provider} className={styles.excludedItem}>
                <div className={styles.excludedInfo}>
                  <div className={styles.excludedProvider}>{provider}</div>
                  <div className={styles.excludedModels}>
                    {modelList.length
                      ? t('oauth_excluded.model_count', { count: modelList.length })
                      : t('oauth_excluded.no_models')}
                  </div>
                  {previewList.length > 0 && (
                    <div className={styles.excludedModelTags}>
                      {previewList.map((modelId) => (
                        <span key={modelId} className={styles.excludedModelTag} title={modelId}>
                          {modelId}
                        </span>
                      ))}
                      {remainingCount > 0 && (
                        <span
                          className={styles.excludedModelTagMore}
                          title={modelList.slice(MAX_PREVIEW_MODELS).join(', ')}
                        >
                          {t('oauth_excluded.more_models', { count: remainingCount })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.excludedActions}>
                  <Button variant="secondary" size="sm" onClick={() => onEdit(provider)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => onDelete(provider)}>
                    {t('oauth_excluded.delete')}
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
