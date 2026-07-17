import { authFilesApi } from '@/services/api';
import { runLocalCodexInspection } from '@/features/codexInspection/model/localProbe';
import {
  loadLocalSettings,
  loadLocalSnapshot,
  saveLocalSettings,
  saveLocalSnapshot,
} from '@/features/codexInspection/model/storage';
import type {
  CodexInspectionAction,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
  CodexInspectionSummary,
} from '@/features/codexInspection/model/types';

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

const fallbackSettings: CodexInspectionSettings = {
  targetType: 'codex',
  workers: 4,
  timeoutSeconds: 20,
  retries: 1,
  sampleSize: 0,
  fiveHourUsedPercentThreshold: 85,
  weeklyUsedPercentThreshold: 85,
  schedules: {
    codex: { enabled: false, mode: 'interval', intervalMinutes: 60 },
  },
};

function createEmptySnapshot(settings: CodexInspectionSettings): CodexInspectionSnapshot {
  return {
    settings,
    run: {
      status: 'idle',
      summary: emptySummary,
    },
    results: [],
    actionLogs: [],
  };
}

export function createLocalCodexInspectionAdapter() {
  return {
    loadSnapshot: async (): Promise<CodexInspectionSnapshot> => {
      const snapshot = loadLocalSnapshot(fallbackSettings);
      if (snapshot) {
        return snapshot;
      }
      return createEmptySnapshot(loadLocalSettings(fallbackSettings));
    },
    run: async () => {
      const snapshot = await runLocalCodexInspection(loadLocalSettings(fallbackSettings));
      saveLocalSnapshot(snapshot);
      return snapshot;
    },
    saveSettings: async (settings: CodexInspectionSettings) => {
      saveLocalSettings(settings);
      const snapshot = loadLocalSnapshot(fallbackSettings);
      const nextSnapshot = snapshot ? { ...snapshot, settings } : createEmptySnapshot(settings);
      saveLocalSnapshot(nextSnapshot);
      return nextSnapshot;
    },
    execute: async (action: CodexInspectionAction, fileNames: string[], confirmDelete = false) => {
      if (action === 'disable') {
        await Promise.all(fileNames.map((name) => authFilesApi.setStatus(name, true)));
      } else if (action === 'enable') {
        await Promise.all(fileNames.map((name) => authFilesApi.setStatus(name, false)));
      } else if (action === 'delete' && confirmDelete) {
        await authFilesApi.deleteFiles(fileNames);
      }

      const snapshot = await runLocalCodexInspection(loadLocalSettings(fallbackSettings));
      saveLocalSnapshot(snapshot);
      return { snapshot, logs: [] };
    },
  };
}
