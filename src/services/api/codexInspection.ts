import type {
  CodexInspectionAction,
  CodexInspectionActionLog,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
} from '@/features/codexInspection/model/types';
import { apiClient } from './client';
import { CODEX_INSPECTION_ACTION_TIMEOUT_MS, CODEX_INSPECTION_RUN_TIMEOUT_MS } from '@/utils/constants';

export interface CodexInspectionActionRequest {
  action: CodexInspectionAction;
  fileNames: string[];
  confirmDelete?: boolean;
}

export interface CodexInspectionActionResponse {
  snapshot: CodexInspectionSnapshot;
  logs: CodexInspectionActionLog[];
}

export const codexInspectionApi = {
  getSnapshot: () => apiClient.get<CodexInspectionSnapshot>('/codex-inspection'),
  run: () => apiClient.post<CodexInspectionSnapshot>('/codex-inspection/run', null, { timeout: CODEX_INSPECTION_RUN_TIMEOUT_MS }),
  updateSettings: (settings: CodexInspectionSettings) =>
    apiClient.put<CodexInspectionSnapshot>('/codex-inspection/settings', settings),
  executeActions: (payload: CodexInspectionActionRequest) =>
    apiClient.post<CodexInspectionActionResponse>('/codex-inspection/actions', payload, {
      timeout: CODEX_INSPECTION_ACTION_TIMEOUT_MS,
    }),
};
