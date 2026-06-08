import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { CodexInspectionSummary } from '@/features/codexInspection/model/types';

const itemStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--border-primary, #d0d0d0)',
  background: 'var(--bg-secondary, #fff)',
};

export function CodexInspectionSummaryCards({ summary }: { summary: CodexInspectionSummary }) {
  const { t } = useTranslation();

  const items = [
    { label: t('codex_inspection.total_files', { defaultValue: 'Total files' }), value: summary.totalFiles },
    { label: t('codex_inspection.sampled_count', { defaultValue: 'Sampled' }), value: summary.sampledCount },
    { label: t('codex_inspection.disabled_count', { defaultValue: 'Disabled' }), value: summary.disabledCount },
    { label: t('codex_inspection.enabled_count', { defaultValue: 'Enabled' }), value: summary.enabledCount },
    {
      label: t('codex_inspection.suggest_disable_count', { defaultValue: 'Suggest disable' }),
      value: summary.disableCount,
    },
    {
      label: t('codex_inspection.auto_deleted_count', { defaultValue: 'Auto deleted' }),
      value: summary.autoDeletedCount,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      {items.map((item) => (
        <Card key={item.label} className="">
          <div style={itemStyle}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #8b8b8b)' }}>{item.label}</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{item.value}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
