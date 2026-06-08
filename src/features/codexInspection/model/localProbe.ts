import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import type { AuthFileItem } from '@/types/authFile';
import type { CodexUsagePayload, CodexUsageWindow } from '@/types/quota';
import { parseCodexUsagePayload } from '@/utils/quota/parsers';
import { resolveCodexChatgptAccountId } from '@/utils/quota/resolvers';
import { isCodexFile } from '@/utils/quota/validators';
import type {
  CodexInspectionResultItem,
  CodexInspectionSettings,
  CodexInspectionSnapshot,
  CodexInspectionSummary,
} from './types';

function buildSummary(results: CodexInspectionResultItem[], totalFiles: number): CodexInspectionSummary {
  return {
    totalFiles,
    sampledCount: results.length,
    keepCount: results.filter((item) => item.action === 'keep').length,
    deleteCount: results.filter((item) => item.action === 'delete').length,
    disableCount: results.filter((item) => item.action === 'disable').length,
    enableCount: results.filter((item) => item.action === 'enable').length,
    reauthCount: results.filter((item) => item.action === 'reauth').length,
    disabledCount: results.filter((item) => item.disabled).length,
    enabledCount: results.filter((item) => !item.disabled).length,
    autoDeletedCount: 0,
  };
}

const FIVE_HOUR_SECONDS = 18000;
const WEEK_SECONDS = 604800;

function resolveWindowUsedPercent(window?: CodexUsageWindow | null): number | undefined {
  const raw = window?.used_percent ?? window?.usedPercent;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return undefined;
}

function resolveWindowSeconds(window?: CodexUsageWindow | null): number | undefined {
  const raw = window?.limit_window_seconds ?? window?.limitWindowSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function resolveUsageWindows(payload: CodexUsagePayload | null): {
  fiveHourUsedPercent?: number;
  weeklyUsedPercent?: number;
  thresholdUsedPercent?: number;
} {
  const rateLimit = payload?.rate_limit ?? payload?.rateLimit ?? null;
  const primaryWindow = rateLimit?.primary_window ?? rateLimit?.primaryWindow ?? null;
  const secondaryWindow = rateLimit?.secondary_window ?? rateLimit?.secondaryWindow ?? null;
  const rawWindows = [primaryWindow, secondaryWindow];

  let fiveHourUsedPercent: number | undefined;
  let weeklyUsedPercent: number | undefined;

  for (const window of rawWindows) {
    if (!window) continue;
    const usedPercent = resolveWindowUsedPercent(window);
    if (usedPercent == null) continue;
    const seconds = resolveWindowSeconds(window);
    if (seconds === FIVE_HOUR_SECONDS && fiveHourUsedPercent == null) {
      fiveHourUsedPercent = usedPercent;
      continue;
    }
    if (seconds === WEEK_SECONDS && weeklyUsedPercent == null) {
      weeklyUsedPercent = usedPercent;
    }
  }

  if (fiveHourUsedPercent == null) {
    fiveHourUsedPercent = resolveWindowUsedPercent(primaryWindow);
  }
  if (weeklyUsedPercent == null) {
    weeklyUsedPercent = resolveWindowUsedPercent(secondaryWindow);
  }

  return {
    fiveHourUsedPercent,
    weeklyUsedPercent,
    thresholdUsedPercent: fiveHourUsedPercent ?? weeklyUsedPercent,
  };
}

async function inspectFile(
  file: AuthFileItem,
  settings: CodexInspectionSettings
): Promise<CodexInspectionResultItem> {
  const authIndex = String(file.authIndex ?? '');
  const accountId = resolveCodexChatgptAccountId(file) ?? '';
  const headers: Record<string, string> = {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal'
  };
  if (accountId) {
    headers['Chatgpt-Account-Id'] = accountId;
  }

  const result = authIndex
    ? await apiCallApi.request({
        authIndex,
        method: 'GET',
        url: 'https://chatgpt.com/backend-api/wham/usage',
        header: headers
      })
    : { statusCode: 0, header: {}, bodyText: '', body: null };

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  const { fiveHourUsedPercent, weeklyUsedPercent, thresholdUsedPercent } = resolveUsageWindows(payload);
  const disabled = file.disabled === true;

  let action: CodexInspectionResultItem['action'] = 'keep';
  if (result.statusCode === 401) {
    action = 'delete';
  } else if (
    typeof thresholdUsedPercent === 'number' &&
    disabled &&
    thresholdUsedPercent < settings.usedPercentThreshold
  ) {
    action = 'enable';
  } else if (
    typeof thresholdUsedPercent === 'number' &&
    !disabled &&
    thresholdUsedPercent >= settings.usedPercentThreshold
  ) {
    action = 'disable';
  }

  return {
    fileName: file.name,
    displayName: String(file.account ?? file.name),
    provider: 'codex',
    authIndex,
    accountId,
    disabled,
    statusCode: result.statusCode,
    usedPercent: thresholdUsedPercent,
    fiveHourUsedPercent,
    weeklyUsedPercent,
    error: result.statusCode >= 400 ? getApiCallErrorMessage(result) : '',
    action,
    actionReason:
      action === 'disable'
        ? `usedPercent >= ${settings.usedPercentThreshold}`
        : action === 'enable'
          ? `usedPercent < ${settings.usedPercentThreshold}`
          : action === 'delete'
            ? '401 response'
            : 'no issue detected',
    executable: true,
  };
}

export async function runLocalCodexInspection(
  settings: CodexInspectionSettings
): Promise<CodexInspectionSnapshot> {
  const startedAtMs = Date.now();
  const allFiles = (await authFilesApi.list()).files.filter((file) => isCodexFile(file));
  const sampledFiles = settings.sampleSize > 0 ? allFiles.slice(0, settings.sampleSize) : allFiles;
  const results = await Promise.all(sampledFiles.map((file) => inspectFile(file, settings)));
  const finishedAtMs = Date.now();

  return {
    settings,
    run: {
      status: 'completed',
      triggerType: 'manual',
      startedAtMs,
      finishedAtMs,
      summary: buildSummary(results, allFiles.length),
    },
    results,
    actionLogs: [],
  };
}
