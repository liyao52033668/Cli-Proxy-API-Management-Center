import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CodexInspectionAction } from '@/features/codexInspection/model/types';

type Props = {
  selectedCount: number;
  busy?: boolean;
  runDisabled?: boolean;
  onRun: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onExecute: (action: CodexInspectionAction) => Promise<void>;
};

export function CodexInspectionActionBar({
  selectedCount,
  busy = false,
  runDisabled = false,
  onRun,
  onRefresh,
  onExecute,
}: Props) {
  const { t } = useTranslation();

  return (
    <Card
      title={t('codex_inspection.actions_title', { defaultValue: 'Actions' })}
      extra={
        <span style={{ color: 'var(--text-secondary, #8b8b8b)' }}>
          {t('codex_inspection.selected_count', {
            defaultValue: '{{count}} selected',
            count: selectedCount,
          })}
        </span>
      }
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button loading={busy || runDisabled} disabled={runDisabled} onClick={() => void onRun()}>
          {t('codex_inspection.run_now', { defaultValue: 'Run now' })}
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => void onRefresh()}>
          {t('common.refresh')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || runDisabled || selectedCount === 0}
          onClick={() => void onExecute('disable')}
        >
          {t('codex_inspection.disable_selected', { defaultValue: 'Disable selected' })}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || runDisabled || selectedCount === 0}
          onClick={() => void onExecute('enable')}
        >
          {t('codex_inspection.enable_selected', { defaultValue: 'Enable selected' })}
        </Button>
        <Button
          variant="danger"
          disabled={busy || runDisabled || selectedCount === 0}
          onClick={() => void onExecute('delete')}
        >
          {t('codex_inspection.delete_selected', { defaultValue: 'Delete selected' })}
        </Button>
      </div>
    </Card>
  );
}
