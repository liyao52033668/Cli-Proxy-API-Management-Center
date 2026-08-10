import type { AuthFileItem } from '../../types/authFile';
import { CLIENT_REQUEST_FAULT_PREFIX } from './constants';

export type AuthFileQuotaProblemState = {
  status?: string;
  error?: string;
  errorStatus?: number;
};

export type AuthFileQuotaProblemMap = Partial<
  Record<
    'antigravity' | 'claude' | 'codex' | 'cursor' | 'gemini-cli' | 'kimi' | 'kiro' | 'qoder',
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
  // A client-side request fault leaves the credential healthy, so it must not be
  // surfaced as a credential problem.
  if (message.toLowerCase().startsWith(CLIENT_REQUEST_FAULT_PREFIX.toLowerCase())) {
    return false;
  }
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
