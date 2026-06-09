export type CodexInspectionMode = 'local' | 'server';
export type CodexInspectionAction = 'keep' | 'delete' | 'disable' | 'enable' | 'reauth';
export type CodexInspectionResultFilter = 'all' | 'disabled' | CodexInspectionAction;
export type CodexInspectionRunStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface CodexInspectionSchedule {
  enabled: boolean;
  mode: 'interval';
  intervalMinutes: number;
}

export interface CodexInspectionSettings {
  targetType: 'codex';
  workers: number;
  timeoutSeconds: number;
  retries: number;
  sampleSize: number;
  fiveHourUsedPercentThreshold: number;
  weeklyUsedPercentThreshold: number;
  usedPercentThreshold?: number;
  schedule: CodexInspectionSchedule;
}

export interface CodexInspectionSummary {
  totalFiles: number;
  sampledCount: number;
  keepCount: number;
  deleteCount: number;
  disableCount: number;
  enableCount: number;
  reauthCount: number;
  disabledCount: number;
  enabledCount: number;
  autoDeletedCount: number;
}

export interface CodexInspectionRunState {
  status: CodexInspectionRunStatus;
  triggerType?: 'manual' | 'scheduled';
  startedAtMs?: number;
  finishedAtMs?: number;
  nextTriggerAtMs?: number;
  summary: CodexInspectionSummary;
  error?: string;
}

export interface CodexInspectionResultItem {
  fileName: string;
  displayName: string;
  provider: string;
  authIndex?: string;
  accountId?: string;
  disabled: boolean;
  statusCode?: number;
  usedPercent?: number;
  fiveHourUsedPercent?: number;
  weeklyUsedPercent?: number;
  error?: string;
  action: CodexInspectionAction;
  actionReason: string;
  executable: boolean;
}

export interface CodexInspectionActionLog {
  action: CodexInspectionAction;
  fileName: string;
  displayName: string;
  success: boolean;
  error?: string;
  executedAtMs: number;
}

export interface CodexInspectionSnapshot {
  settings: CodexInspectionSettings;
  run: CodexInspectionRunState;
  results: CodexInspectionResultItem[];
  actionLogs: CodexInspectionActionLog[];
}
