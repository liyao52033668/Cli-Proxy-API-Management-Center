import type {
  CodexInspectionAction,
  CodexInspectionActionLog,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
} from '@/features/codexInspection/model/types';
import { apiClient } from './client';

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
  run: () => apiClient.post<CodexInspectionSnapshot>('/codex-inspection/run'),
  updateSettings: (settings: CodexInspectionSettings) =>
    apiClient.put<CodexInspectionSnapshot>('/codex-inspection/settings', settings),
  executeActions: (payload: CodexInspectionActionRequest) =>
    apiClient.post<CodexInspectionActionResponse>('/codex-inspection/actions', payload),
};
