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
  CODEX_INSPECTION_RUN_TIMEOUT_MS,
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

export class CodexInspectionRunError extends Error {
  constructor(
    message: string,
    public readonly snapshot: CodexInspectionSnapshot
  ) {
    super(message);
    this.name = 'CodexInspectionRunError';
  }
}

function normalizeProvider(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

async function resolveFileNamesForProvider(provider: string): Promise<string[]> {
  try {
    const normalizedProvider = normalizeProvider(provider);
    const { files } = await authFilesApi.list();
    return files
      .filter(
        (file) =>
          (normalizeProvider(file.type) || normalizeProvider(file.provider)) === normalizedProvider
      )
      .map((file) => file.name)
      .filter((name) => typeof name === 'string' && name.trim().length > 0);
  } catch {
    return [];
  }
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

  run: async (provider: string, fileNames?: string[]): Promise<CodexInspectionSnapshot> => {
    const normalizedProvider = normalizeProvider(provider) || 'codex';
    if (!fileNames || fileNames.length === 0) {
      const providerFileNames = await resolveFileNamesForProvider(normalizedProvider);
      if (providerFileNames.length > AUTH_FILES_UPLOAD_BATCH_SIZE) {
        return codexInspectionApi.run(normalizedProvider, providerFileNames);
      }
      return apiClient.post<CodexInspectionSnapshot>(
        '/codex-inspection/run',
        { provider: normalizedProvider },
        { timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS }
      );
    }

    if (fileNames.length <= AUTH_FILES_UPLOAD_BATCH_SIZE) {
      return apiClient.post<CodexInspectionSnapshot>(
        '/codex-inspection/run',
        { provider: normalizedProvider, fileNames },
        { timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS }
      );
    }

    let lastSuccessfulSnapshot: CodexInspectionSnapshot | null = null;

    for (let index = 0; index < fileNames.length; index += AUTH_FILES_UPLOAD_BATCH_SIZE) {
      const batchFileNames = fileNames.slice(index, index + AUTH_FILES_UPLOAD_BATCH_SIZE);
      try {
        const batchSnapshot = await apiClient.post<CodexInspectionSnapshot>(
          '/codex-inspection/run',
          { provider: normalizedProvider, fileNames: batchFileNames },
          { timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS }
        );

        if (batchSnapshot.run.status === 'failed') {
          throw new CodexInspectionRunError(
            batchSnapshot.run.error ?? 'Run failed',
            lastSuccessfulSnapshot ?? batchSnapshot
          );
        }

        lastSuccessfulSnapshot = batchSnapshot;
      } catch (err) {
        if (err instanceof CodexInspectionRunError) {
          throw err;
        }
        if (lastSuccessfulSnapshot) {
          throw new CodexInspectionRunError(
            err instanceof Error ? err.message : 'Run failed',
            lastSuccessfulSnapshot
          );
        }
        throw err;
      }
    }

    return lastSuccessfulSnapshot!;
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
