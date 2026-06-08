import type { AuthFileItem } from '../../types/authFile';

export type AuthFileQuotaProblemState = {
  status?: string;
  error?: string;
  errorStatus?: number;
};

export type AuthFileQuotaProblemMap = Partial<
  Record<
    'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kimi',
    Record<string, AuthFileQuotaProblemState | undefined>
  >
>;

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);

const normalizeProviderKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const getAuthFileStatusMessage = (file: AuthFileItem): string => {
  const raw = file['status_message'] ?? file.statusMessage;
  if (typeof raw === 'string') return raw.trim();
  if (raw == null) return '';
  return String(raw).trim();
};

const hasStatusProblem = (file: AuthFileItem): boolean => {
  const message = getAuthFileStatusMessage(file);
  return Boolean(message) && !HEALTHY_STATUS_MESSAGES.has(message.toLowerCase());
};

const hasQuotaProblem = (file: AuthFileItem, quotaProblems: AuthFileQuotaProblemMap): boolean => {
  const provider = normalizeProviderKey(file.provider ?? file.type);
  const quota = quotaProblems[provider as keyof AuthFileQuotaProblemMap]?.[file.name];
  return quota?.status === 'error';
};

export const hasAuthFileProblem = (
  file: AuthFileItem,
  quotaProblems: AuthFileQuotaProblemMap
): boolean => hasStatusProblem(file) || hasQuotaProblem(file, quotaProblems);
