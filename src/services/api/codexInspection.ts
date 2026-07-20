import type {
  CodexInspectionAction,
  CodexInspectionActionLog,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
} from '@/features/codexInspection/model/types';
import { apiClient } from './client';
import {
  AUTH_FILES_UPLOAD_BATCH_SIZE,
  CODEX_INSPECTION_ACTION_TIMEOUT_MS,
} from '@/utils/constants';
import { authFilesApi } from './authFiles';

export interface CodexInspectionActionRequest {
  action: CodexInspectionAction;
  fileNames: string[];
  confirmDelete?: boolean;
}

export interface CodexInspectionActionResponse {
  snapshot: CodexInspectionSnapshot;
  logs: CodexInspectionActionLog[];
}

function normalizeProvider(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export const codexInspectionApi = {
  getSnapshot: () => apiClient.get<CodexInspectionSnapshot>('/codex-inspection'),

  listProviders: async (): Promise<string[]> => {
    const { files } = await authFilesApi.list();
    return Array.from(
      new Set(
        files
          .map((file) => normalizeProvider(file.type) || normalizeProvider(file.provider))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
  },

  run: (provider: string, fileNames?: string[]): Promise<CodexInspectionSnapshot> => {
    const normalizedProvider = normalizeProvider(provider) || 'codex';
    return apiClient.post<CodexInspectionSnapshot>('/codex-inspection/run', {
      provider: normalizedProvider,
      ...(fileNames && fileNames.length > 0 ? { fileNames } : {}),
    });
  },

  updateSettings: (settings: CodexInspectionSettings) =>
    apiClient.put<CodexInspectionSnapshot>('/codex-inspection/settings', settings),

  executeActions: async (payload: CodexInspectionActionRequest) => {
    const { fileNames } = payload;
    if (fileNames.length <= AUTH_FILES_UPLOAD_BATCH_SIZE) {
      return apiClient.post<CodexInspectionActionResponse>('/codex-inspection/actions', payload, {
        timeout: CODEX_INSPECTION_ACTION_TIMEOUT_MS,
      });
    }

    let finalSnapshot: CodexInspectionSnapshot | null = null;
    const aggregatedLogs: CodexInspectionActionLog[] = [];

    for (let index = 0; index < fileNames.length; index += AUTH_FILES_UPLOAD_BATCH_SIZE) {
      const batchFileNames = fileNames.slice(index, index + AUTH_FILES_UPLOAD_BATCH_SIZE);
      const batchPayload: CodexInspectionActionRequest = {
        ...payload,
        fileNames: batchFileNames,
      };
      const batchResult = await apiClient.post<CodexInspectionActionResponse>(
        '/codex-inspection/actions',
        batchPayload,
        {
          timeout: CODEX_INSPECTION_ACTION_TIMEOUT_MS,
        }
      );
      finalSnapshot = batchResult.snapshot;
      aggregatedLogs.push(...batchResult.logs);
    }

    return {
      snapshot: finalSnapshot as CodexInspectionSnapshot,
      logs: aggregatedLogs,
    };
  },
};
