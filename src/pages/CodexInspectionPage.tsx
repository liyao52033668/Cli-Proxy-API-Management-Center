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
  failedCount: 0,
  disabledCount: 0,
  enabledCount: 0,
  autoDeletedCount: 0,
};

const defaultSchedule = {
  enabled: false,
  mode: 'interval' as const,
  intervalMinutes: 60,
};

const emptySettings: CodexInspectionSettings = {
  targetType: 'codex',
  workers: 4,
  timeoutSeconds: 20,
  retries: 1,
  sampleSize: 0,
  fiveHourUsedPercentThreshold: 85,
  weeklyUsedPercentThreshold: 85,
  statusCodeActions: {},
  schedules: {
    codex: defaultSchedule,
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

function normalizeSettings(settings: CodexInspectionSettings): CodexInspectionSettings {
  const {
    usedPercentThreshold: legacyThreshold,
    schedule: legacySchedule,
    schedules,
    ...rest
  } = settings;
  const targetType = settings.targetType.trim().toLowerCase() || 'codex';
  const normalizedSchedules = Object.fromEntries(
    Object.entries(schedules ?? {}).map(([provider, schedule]) => [
      provider.trim().toLowerCase(),
      { ...defaultSchedule, ...schedule },
    ])
  );
  if (!normalizedSchedules[targetType]) {
    normalizedSchedules[targetType] = { ...defaultSchedule, ...legacySchedule };
  }
  const fiveHourUsedPercentThreshold =
    typeof settings.fiveHourUsedPercentThreshold === 'number'
      ? settings.fiveHourUsedPercentThreshold
      : (legacyThreshold ?? emptySettings.fiveHourUsedPercentThreshold);
  const weeklyUsedPercentThreshold =
    typeof settings.weeklyUsedPercentThreshold === 'number'
      ? settings.weeklyUsedPercentThreshold
      : (legacyThreshold ?? emptySettings.weeklyUsedPercentThreshold);

  return {
    ...emptySettings,
    ...rest,
    targetType,
    fiveHourUsedPercentThreshold,
    weeklyUsedPercentThreshold,
    schedules: normalizedSchedules,
  };
}

export function CodexInspectionPage() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<CodexInspectionSnapshot>(emptySnapshot);
  const [settings, setSettings] = useState<CodexInspectionSettings>(emptySettings);
  const [providers, setProviders] = useState<string[]>(['codex']);
  const [selected, setSelected] = useState<string[]>([]);
  const [resultFilter, setResultFilter] = useState<CodexInspectionResultFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const adapter = useMemo(() => serverAdapter, []);
  const runActive = snapshot.run.status === 'queued' || snapshot.run.status === 'running';
  const processedCount = snapshot.run.processedCount ?? 0;
  const pendingCount = snapshot.run.pendingCount ?? 0;
  const progressTotal = processedCount + pendingCount;
  const progressPercent =
    progressTotal > 0 ? Math.round((processedCount / progressTotal) * 100) : 0;

  const applySnapshot = useCallback((nextSnapshot: CodexInspectionSnapshot) => {
    const normalizedSettings = normalizeSettings(nextSnapshot.settings);
    const provider = normalizedSettings.targetType;
    const nextTriggerAtMsByProvider = { ...(nextSnapshot.run.nextTriggerAtMsByProvider ?? {}) };
    if (nextSnapshot.run.nextTriggerAtMs && !nextTriggerAtMsByProvider[provider]) {
      nextTriggerAtMsByProvider[provider] = nextSnapshot.run.nextTriggerAtMs;
    }
    setSnapshot({
      ...nextSnapshot,
      settings: normalizedSettings,
      run: { ...nextSnapshot.run, nextTriggerAtMsByProvider },
    });
    setSettings(normalizedSettings);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [nextSnapshot, providerOptions] = await Promise.all([
        adapter.loadSnapshot(),
        adapter.listProviders(),
      ]);
      const targetProvider = nextSnapshot.settings.targetType.trim().toLowerCase() || 'codex';
      setProviders(Array.from(new Set([targetProvider, ...providerOptions])));
      applySnapshot(nextSnapshot);
      setSelected([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setLoading(false);
    }
  }, [adapter, applySnapshot, t]);

  const pollSnapshot = useCallback(async () => {
    try {
      const nextSnapshot = await adapter.loadSnapshot();
      applySnapshot(nextSnapshot);
      setError(
        nextSnapshot.run.status === 'failed' && nextSnapshot.run.error ? nextSnapshot.run.error : ''
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
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
    if (!runActive) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void pollSnapshot();
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [pollSnapshot, runActive]);

  useHeaderRefresh(() => refreshSnapshot());

  const runInspection = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const nextSnapshot = await adapter.run(
        settings.targetType,
        selected.length > 0 ? selected : undefined
      );
      applySnapshot(nextSnapshot);
      if (nextSnapshot.run.status === 'failed' && nextSnapshot.run.error) {
        setError(nextSnapshot.run.error);
      }
      setSelected([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('notification.refresh_failed'));
    } finally {
      setBusy(false);
    }
  }, [adapter, applySnapshot, selected, settings.targetType, t]);

  const changeSettings = useCallback(
    (nextSettings: CodexInspectionSettings) => {
      const currentProvider = settings.targetType.trim().toLowerCase();
      const nextProvider = nextSettings.targetType.trim().toLowerCase();
      setSettings(nextSettings);
      if (currentProvider === nextProvider) {
        return;
      }
      setSnapshot((current) => ({
        ...current,
        settings: nextSettings,
        results: [],
        actionLogs: [],
        run: { ...current.run, summary: emptySummary },
      }));
      setSelected([]);
      setResultFilter('all');
    },
    [settings.targetType]
  );

  const saveSettings = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const normalizedSettings = normalizeSettings(settings);
      const nextSettings: CodexInspectionSettings = {
        ...normalizedSettings,
        schedules: Object.fromEntries(
          Object.entries(normalizedSettings.schedules).map(([provider, schedule]) => [
            provider,
            {
              ...schedule,
              intervalMinutes: Math.max(1, schedule.intervalMinutes || 1),
            },
          ])
        ),
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
            defaultValue: 'Delete the selected provider auth files?',
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
    if (resultFilter === 'keep') {
      return snapshot.results.filter((item) => item.action === 'keep' && !item.disabled);
    }
    return snapshot.results.filter((item) => item.action === resultFilter);
  }, [resultFilter, snapshot.results]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('codex_inspection.title')}</h1>
        <p className={styles.description}>{t('codex_inspection.description')}</p>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {runActive ? (
        <div className={styles.progressCard} role="status" aria-live="polite">
          <div className={styles.progressHeader}>
            <strong>
              {snapshot.run.status === 'queued'
                ? t('codex_inspection.run_queued')
                : t('codex_inspection.run_running')}
            </strong>
            <span>{progressPercent}%</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.progressMeta}>
            <span>
              {t('codex_inspection.run_progress', {
                processed: processedCount,
                pending: pendingCount,
              })}
            </span>
            {(snapshot.run.batchSize ?? 0) > 0 ? (
              <span>{t('codex_inspection.run_batch_size', { count: snapshot.run.batchSize })}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <CodexInspectionActionBar
        selectedCount={selected.length}
        busy={busy}
        runDisabled={runActive}
        onRun={runInspection}
        onRefresh={refreshSnapshot}
        onExecute={executeAction}
      />
      <CodexInspectionSettingsPanel
        settings={settings}
        providers={providers}
        showSchedule
        nextTriggerAtMs={
          snapshot.run.nextTriggerAtMsByProvider?.[settings.targetType.trim().toLowerCase()]
        }
        disabled={busy || runActive}
        loading={busy}
        onChange={changeSettings}
        onSave={saveSettings}
      />
      {loading ? <div className={styles.placeholder}>{t('common.loading')}</div> : null}
      {!loading ? <CodexInspectionSummaryCards summary={snapshot.run.summary} /> : null}
      {!loading ? (
        <CodexInspectionResultsTable
          items={filteredResults}
          selected={selected}
          filter={resultFilter}
          disabled={busy || runActive}
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
