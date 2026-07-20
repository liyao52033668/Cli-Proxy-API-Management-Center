import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconAmp from '@/assets/icons/amp.svg';
import type { AmpcodeConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import { calculateStatusBarData, type KeyStats } from '@/utils/usage';
import { type UsageDetailsByAuthIndex, type UsageDetailsBySource } from '@/utils/usageIndex';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { collectUsageDetailsForIdentity, getStatsForIdentity } from '../utils';

interface AmpcodeSectionProps {
  config: AmpcodeConfig | null | undefined;
  keyStats: KeyStats;
  usageDetailsBySource: UsageDetailsBySource;
  usageDetailsByAuthIndex: UsageDetailsByAuthIndex;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onEdit: () => void;
}

export function AmpcodeSection({
  config,
  keyStats,
  usageDetailsBySource,
  usageDetailsByAuthIndex,
  loading,
  disableControls,
  isSwitching,
  onEdit,
}: AmpcodeSectionProps) {
  const { t } = useTranslation();
  const showLoadingPlaceholder = loading && !config;
  const upstreamApiKeys = useMemo(
    () =>
      Array.from(
        new Set(
          [
            config?.upstreamApiKey,
            ...(config?.upstreamApiKeys?.map((entry) => entry.upstreamApiKey) ?? []),
          ]
            .map((apiKey) => apiKey?.trim())
            .filter((apiKey): apiKey is string => Boolean(apiKey))
        )
      ),
    [config?.upstreamApiKey, config?.upstreamApiKeys]
  );
  const stats = useMemo(
    () =>
      upstreamApiKeys.reduce(
        (total, apiKey) => {
          const current = getStatsForIdentity({ apiKey }, keyStats);
          total.success += current.success;
          total.failure += current.failure;
          return total;
        },
        { success: 0, failure: 0 }
      ),
    [keyStats, upstreamApiKeys]
  );
  const statusData = useMemo(
    () =>
      calculateStatusBarData(
        upstreamApiKeys.flatMap((apiKey) =>
          collectUsageDetailsForIdentity({ apiKey }, usageDetailsBySource, usageDetailsByAuthIndex)
        )
      ),
    [upstreamApiKeys, usageDetailsByAuthIndex, usageDetailsBySource]
  );

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconAmp} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.ampcode_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onEdit} disabled={disableControls || loading || isSwitching}>
            {t('common.edit')}
          </Button>
        }
      >
        {showLoadingPlaceholder ? (
          <div className="hint">{t('common.loading')}</div>
        ) : (
          <>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.ampcode_upstream_url_label')}:
              </span>
              <span className={styles.fieldValue}>
                {config?.upstreamUrl || t('common.not_set')}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.ampcode_upstream_api_key_label')}:
              </span>
              <span className={styles.fieldValue}>
                {config?.upstreamApiKey ? maskApiKey(config.upstreamApiKey) : t('common.not_set')}
              </span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.ampcode_force_model_mappings_label')}:
              </span>
              <span className={styles.fieldValue}>
                {(config?.forceModelMappings ?? false) ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.fieldRow} style={{ marginTop: 8 }}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.ampcode_model_mappings_count')}:
              </span>
              <span className={styles.fieldValue}>{config?.modelMappings?.length || 0}</span>
            </div>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>
                {t('ai_providers.ampcode_upstream_api_keys_count')}:
              </span>
              <span className={styles.fieldValue}>{config?.upstreamApiKeys?.length || 0}</span>
            </div>
            <div className={styles.cardStats}>
              <span className={`${styles.statPill} ${styles.statSuccess}`}>
                {t('stats.success')}: {stats.success}
              </span>
              <span className={`${styles.statPill} ${styles.statFailure}`}>
                {t('stats.failure')}: {stats.failure}
              </span>
            </div>
            <ProviderStatusBar statusData={statusData} />
            {config?.modelMappings?.length ? (
              <div className={styles.modelTagList}>
                {config.modelMappings.slice(0, 5).map((mapping) => (
                  <span key={`${mapping.from}→${mapping.to}`} className={styles.modelTag}>
                    <span className={styles.modelName}>{mapping.from}</span>
                    <span className={styles.modelAlias}>{mapping.to}</span>
                  </span>
                ))}
                {config.modelMappings.length > 5 && (
                  <span className={styles.modelTag}>
                    <span className={styles.modelName}>+{config.modelMappings.length - 5}</span>
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
