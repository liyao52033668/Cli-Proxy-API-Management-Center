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

async function resolveCodexFileNamesForFullRun(): Promise<string[]> {
  try {
    const { files } = await authFilesApi.list();
    return files
      .filter((file) => String(file.type ?? file.provider ?? '').trim().toLowerCase() === 'codex')
      .map((file) => file.name)
      .filter((name) => typeof name === 'string' && name.trim().length > 0);
  } catch {
    return [];
  }
}

export const codexInspectionApi = {
  getSnapshot: () => apiClient.get<CodexInspectionSnapshot>('/codex-inspection'),

  run: async (fileNames?: string[]): Promise<CodexInspectionSnapshot> => {
    if (!fileNames || fileNames.length === 0) {
      const allCodexFileNames = await resolveCodexFileNamesForFullRun();
      if (allCodexFileNames.length > AUTH_FILES_UPLOAD_BATCH_SIZE) {
        return codexInspectionApi.run(allCodexFileNames);
      }
      return apiClient.post<CodexInspectionSnapshot>('/codex-inspection/run', null, {
        timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS,
      });
    }

    if (fileNames.length <= AUTH_FILES_UPLOAD_BATCH_SIZE) {
      return apiClient.post<CodexInspectionSnapshot>('/codex-inspection/run', { fileNames }, {
        timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS,
      });
    }

    let lastSuccessfulSnapshot: CodexInspectionSnapshot | null = null;

    for (let index = 0; index < fileNames.length; index += AUTH_FILES_UPLOAD_BATCH_SIZE) {
      const batchFileNames = fileNames.slice(index, index + AUTH_FILES_UPLOAD_BATCH_SIZE);
      try {
        const batchSnapshot = await apiClient.post<CodexInspectionSnapshot>(
          '/codex-inspection/run',
          { fileNames: batchFileNames },
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
