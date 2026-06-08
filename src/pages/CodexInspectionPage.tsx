import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useNotificationStore } from '@/stores';
import { createServerCodexInspectionAdapter } from '@/features/codexInspection/adapters/server';
import { CodexInspectionActionBar } from '@/features/codexInspection/components/CodexInspectionActionBar';
import { CodexInspectionResultsTable } from '@/features/codexInspection/components/CodexInspectionResultsTable';
import { CodexInspectionSettingsPanel } from '@/features/codexInspection/components/CodexInspectionSettingsPanel';
import { CodexInspectionSummaryCards } from '@/features/codexInspection/components/CodexInspectionSummaryCards';
import type {
  CodexInspectionAction,
  CodexInspectionResultFilter,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
  CodexInspectionSummary,
} from '@/features/codexInspection/model/types';
import styles from './CodexInspectionPage.module.scss';

const serverAdapter = createServerCodexInspectionAdapter();

const emptySummary: CodexInspectionSummary = {
  totalFiles: 0,
  sampledCount: 0,
  keepCount: 0,
  deleteCount: 0,
  disableCount: 0,
  enableCount: 0,
  reauthCount: 0,
  disabledCount: 0,
  enabledCount: 0,
  autoDeletedCount: 0,
};

const emptySettings: CodexInspectionSettings = {
  targetType: 'codex',
  workers: 4,
  timeoutSeconds: 20,
  retries: 1,
  sampleSize: 0,
  usedPercentThreshold: 85,
  schedule: {
    enabled: false,
    mode: 'interval',
    intervalMinutes: 60,
  },
};

const emptySnapshot: CodexInspectionSnapshot = {
  settings: emptySettings,
  run: {
    status: 'idle',
    summary: emptySummary,
  },
  results: [],
  actionLogs: [],
};

export function CodexInspectionPage() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<CodexInspectionSnapshot>(emptySnapshot);
  const [settings, setSettings] = useState<CodexInspectionSettings>(emptySettings);
  const [selected, setSelected] = useState<string[]>([]);
  const [resultFilter, setResultFilter] = useState<CodexInspectionResultFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const adapter = useMemo(() => serverAdapter, []);

  const applySnapshot = useCallback((nextSnapshot: CodexInspectionSnapshot) => {
    setSnapshot(nextSnapshot);
    setSettings(nextSnapshot.settings);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const nextSnapshot = await adapter.loadSnapshot();
      applySnapshot(nextSnapshot);
      setSelected([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setLoading(false);
    }
  }, [adapter, applySnapshot, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshSnapshot();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!snapshot.settings.schedule.enabled && snapshot.run.status !== 'running') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshSnapshot, snapshot.run.status, snapshot.settings.schedule.enabled]);

  useHeaderRefresh(() => refreshSnapshot());

  const runInspection = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const nextSnapshot = await adapter.run();
      applySnapshot(nextSnapshot);
      setSelected([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setBusy(false);
    }
  }, [adapter, applySnapshot, t]);

  const saveSettings = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const nextSettings: CodexInspectionSettings = {
        ...settings,
        schedule: {
          ...settings.schedule,
          intervalMinutes: Math.max(1, settings.schedule.intervalMinutes || 1),
        },
      };
      const nextSnapshot = await adapter.saveSettings(nextSettings);
      applySnapshot(nextSnapshot);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setBusy(false);
    }
  }, [adapter, applySnapshot, settings, t]);

  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const executeAction = useCallback(
    async (action: CodexInspectionAction, fileNames = selected) => {
      if (fileNames.length === 0) {
        return;
      }

      const performAction = async (confirmedDelete = false) => {
        setError('');
        setBusy(true);
        try {
          const result = await adapter.execute(action, fileNames, confirmedDelete);
          applySnapshot(result.snapshot);
          setSelected([]);
          await refreshSnapshot();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
        } finally {
          setBusy(false);
        }
      };

      if (action === 'delete') {
        showConfirmation({
          title: t('codex_inspection.delete_confirm_title', {
            defaultValue: 'Confirm delete',
          }),
          message: t('codex_inspection.delete_confirm_message', {
            defaultValue: 'Delete the selected Codex auth files?',
          }),
          confirmText: t('common.delete', { defaultValue: 'Delete' }),
          cancelText: t('common.cancel'),
          variant: 'danger',
          onConfirm: async () => {
            await performAction(true);
          },
        });
        return;
      }

      await performAction(false);
    },
    [adapter, applySnapshot, refreshSnapshot, selected, showConfirmation, t]
  );

  const filteredResults = useMemo(() => {
    if (resultFilter === 'all') {
      return snapshot.results;
    }
    if (resultFilter === 'disabled') {
      return snapshot.results.filter((item) => item.disabled);
    }
    if (resultFilter === 'disable') {
      return snapshot.results.filter((item) => item.action === 'disable' && !item.disabled);
    }
    if (resultFilter === 'enable') {
      return snapshot.results.filter((item) => item.action === 'enable' && item.disabled);
    }
    return snapshot.results.filter((item) => item.action === resultFilter);
  }, [resultFilter, snapshot.results]);

  const scheduledRunActive = snapshot.run.status === 'running' && snapshot.run.triggerType === 'scheduled';

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('codex_inspection.title')}</h1>
        <p className={styles.description}>{t('codex_inspection.description')}</p>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <CodexInspectionActionBar
        selectedCount={selected.length}
        busy={busy}
        runDisabled={scheduledRunActive}
        onRun={runInspection}
        onRefresh={refreshSnapshot}
        onExecute={executeAction}
      />
      <CodexInspectionSettingsPanel
        settings={settings}
        showSchedule
        nextTriggerAtMs={snapshot.run.nextTriggerAtMs}
        disabled={busy}
        loading={busy}
        onChange={setSettings}
        onSave={saveSettings}
      />
      {loading ? <div className={styles.placeholder}>{t('common.loading')}</div> : null}
      {!loading ? <CodexInspectionSummaryCards summary={snapshot.run.summary} /> : null}
      {!loading ? (
        <CodexInspectionResultsTable
          items={filteredResults}
          selected={selected}
          filter={resultFilter}
          disabled={busy}
          onFilterChange={(nextFilter) => {
            setResultFilter(nextFilter);
            setSelected([]);
          }}
          onSelectedChange={setSelected}
          onExecuteSingle={async (action, fileName) => executeAction(action, [fileName])}
        />
      ) : null}
    </div>
  );
}
