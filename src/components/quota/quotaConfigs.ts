/**
 * Quota configuration definitions.
 */

import styles from '@/pages/QuotaPage.module.scss';
import { apiCallApi, apiClient, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import { useQuotaStore } from '@/stores';
import type {
  AntigravityModelsPayload,
  AntigravityQuotaGroup,
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeExtraUsage,
  ClaudeProfileResponse,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexQuotaState,
  CodexQuotaWindow,
  CodexRateLimitInfo,
  CodexUsagePayload,
  CodexUsageWindow,
  CopilotQuotaRow,
  CopilotQuotaState,
  GeminiCliCodeAssistPayload,
  GeminiCliCredits,
  GeminiCliParsedBucket,
  GeminiCliQuotaBucketState,
  GeminiCliQuotaState,
  GeminiCliUserTier,
  KimiQuotaRow,
  KimiQuotaState,
  KiroQuotaRow,
  KiroQuotaState
} from '@/types';
import {
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  buildAntigravityQuotaGroups,
  buildGeminiCliQuotaBuckets,
  buildKimiQuotaRows,
  CLAUDE_PROFILE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_URL,
  CLAUDE_USAGE_WINDOW_KEYS,
  CODEX_REQUEST_HEADERS,
  CODEX_USAGE_URL,
  createStatusError,
  formatCodexResetLabel,
  formatKimiResetHint,
  formatQuotaResetTime,
  GEMINI_CLI_CODE_ASSIST_URL,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  getStatusFromError,
  isAntigravityFile,
  isClaudeFile,
  isCodexFile,
  isCopilotFile,
  isDisabledAuthFile,
  isGeminiCliFile,
  isKimiFile,
  isKiroFile,
  isRuntimeOnlyAuthFile,
  KIMI_REQUEST_HEADERS,
  KIMI_USAGE_URL,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizePlanType,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseGeminiCliCodeAssistPayload,
  parseGeminiCliQuotaPayload,
  parseKimiUsagePayload,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  resolveGeminiCliProjectId
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import React from 'react';
import type { QuotaRenderHelpers } from './QuotaCard';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaType = 'antigravity' | 'claude' | 'codex' | 'copilot' | 'gemini-cli' | 'kimi' | 'kiro';

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn';
const QUOTA_PROGRESS_HIGH_THRESHOLD = 70;
const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 30;
const geminiCliSupplementaryRequestIds = new Map<string, number>();
const geminiCliSupplementaryCache = new Map<
  string,
  { requestId: number; tierLabel: string | null; tierId: string | null; creditBalance: number | null }
>();

export interface QuotaStore {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  copilotQuota: Record<string, CopilotQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  kiroQuota: Record<string, KiroQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setCopilotQuota: (updater: QuotaUpdater<Record<string, CopilotQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, KiroQuotaState>>) => void;
  clearQuotaCache: () => void;
}

export interface QuotaConfig<TState, TData> {
  type: QuotaType;
  i18nPrefix: string;
  cardIdleMessageKey?: string;
  filterFn: (file: AuthFileItem) => boolean;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  storeSelector: (state: QuotaStore) => Record<string, TState>;
  storeSetter: keyof QuotaStore;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
  buildErrorState: (message: string, status?: number) => TState;
  cardClassName: string;
  controlsClassName: string;
  controlClassName: string;
  gridClassName: string;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevel = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) return topLevel;

    const installed =
      parsed.installed && typeof parsed.installed === 'object' && parsed.installed !== null
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const installedProjectId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedProjectId) return installedProjectId;

    const web =
      parsed.web && typeof parsed.web === 'object' && parsed.web !== null
        ? (parsed.web as Record<string, unknown>)
        : null;
    const webProjectId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webProjectId) return webProjectId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }

  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const fetchAntigravityQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<AntigravityQuotaGroup[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('antigravity_quota.missing_auth_index'));
  }

  const projectId = await resolveAntigravityProjectId(file);
  const requestBody = JSON.stringify({ project: projectId });

  let lastError = '';
  let lastStatus: number | undefined;
  let priorityStatus: number | undefined;
  let hadSuccess = false;

  for (const url of ANTIGRAVITY_QUOTA_URLS) {
    try {
      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      const payload = parseAntigravityPayload(result.body ?? result.bodyText);
      const models = payload?.models;
      if (!models || typeof models !== 'object' || Array.isArray(models)) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      const groups = buildAntigravityQuotaGroups(models as AntigravityModelsPayload);
      if (groups.length === 0) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      return groups;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      if (status) {
        lastStatus = status;
        if (status === 403 || status === 404) {
          priorityStatus ??= status;
        }
      }
    }
  }

  if (hadSuccess) {
    return [];
  }

  throw createStatusError(lastError || t('common.unknown_error'), priorityStatus ?? lastStatus);
};

const buildCodexQuotaWindows = (payload: CodexUsagePayload, t: TFunction): CodexQuotaWindow[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;
  const WINDOW_META = {
    codeFiveHour: { id: 'five-hour', labelKey: 'codex_quota.primary_window' },
    codeWeekly: { id: 'weekly', labelKey: 'codex_quota.secondary_window' },
    codeReviewFiveHour: { id: 'code-review-five-hour', labelKey: 'codex_quota.code_review_primary_window' },
    codeReviewWeekly: { id: 'code-review-weekly', labelKey: 'codex_quota.code_review_secondary_window' },
  } as const;

  const rateLimit = payload.rate_limit ?? payload.rateLimit ?? undefined;
  const codeReviewLimit = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? undefined;
  const additionalRateLimits = payload.additional_rate_limits ?? payload.additionalRateLimits ?? [];
  const windows: CodexQuotaWindow[] = [];

  const addWindow = (
    id: string,
    label: string,
    labelKey: string | undefined,
    labelParams: Record<string, string | number> | undefined,
    window?: CodexUsageWindow | null,
    limitReached?: boolean,
    allowed?: boolean
  ) => {
    if (!window) return;
    const resetLabel = formatCodexResetLabel(window);
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const isLimitReached = Boolean(limitReached) || allowed === false;
    const usedPercent = usedPercentRaw ?? (isLimitReached && resetLabel !== '-' ? 100 : null);
    windows.push({
      id,
      label,
      labelKey,
      labelParams,
      usedPercent,
      resetLabel,
    });
  };

  const getWindowSeconds = (window?: CodexUsageWindow | null): number | null => {
    if (!window) return null;
    return normalizeNumberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
  };

  const rawLimitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const rawAllowed = rateLimit?.allowed;

  const pickClassifiedWindows = (
    limitInfo?: CodexRateLimitInfo | null,
    options?: { allowOrderFallback?: boolean }
  ): { fiveHourWindow: CodexUsageWindow | null; weeklyWindow: CodexUsageWindow | null } => {
    const allowOrderFallback = options?.allowOrderFallback ?? true;
    const primaryWindow = limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null;
    const secondaryWindow = limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null;
    const rawWindows = [primaryWindow, secondaryWindow];

    let fiveHourWindow: CodexUsageWindow | null = null;
    let weeklyWindow: CodexUsageWindow | null = null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getWindowSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHourWindow) {
        fiveHourWindow = window;
      } else if (seconds === WEEK_SECONDS && !weeklyWindow) {
        weeklyWindow = window;
      }
    }

    // For legacy payloads without window duration, fallback to primary/secondary ordering.
    if (allowOrderFallback) {
      if (!fiveHourWindow) {
        fiveHourWindow = primaryWindow && primaryWindow !== weeklyWindow ? primaryWindow : null;
      }
      if (!weeklyWindow) {
        weeklyWindow = secondaryWindow && secondaryWindow !== fiveHourWindow ? secondaryWindow : null;
      }
    }

    return { fiveHourWindow, weeklyWindow };
  };

  const rateWindows = pickClassifiedWindows(rateLimit);
  addWindow(
    WINDOW_META.codeFiveHour.id,
    t(WINDOW_META.codeFiveHour.labelKey),
    WINDOW_META.codeFiveHour.labelKey,
    undefined,
    rateWindows.fiveHourWindow,
    rawLimitReached,
    rawAllowed
  );
  addWindow(
    WINDOW_META.codeWeekly.id,
    t(WINDOW_META.codeWeekly.labelKey),
    WINDOW_META.codeWeekly.labelKey,
    undefined,
    rateWindows.weeklyWindow,
    rawLimitReached,
    rawAllowed
  );

  const codeReviewWindows = pickClassifiedWindows(codeReviewLimit);
  const codeReviewLimitReached = codeReviewLimit?.limit_reached ?? codeReviewLimit?.limitReached;
  const codeReviewAllowed = codeReviewLimit?.allowed;
  addWindow(
    WINDOW_META.codeReviewFiveHour.id,
    t(WINDOW_META.codeReviewFiveHour.labelKey),
    WINDOW_META.codeReviewFiveHour.labelKey,
    undefined,
    codeReviewWindows.fiveHourWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );
  addWindow(
    WINDOW_META.codeReviewWeekly.id,
    t(WINDOW_META.codeReviewWeekly.labelKey),
    WINDOW_META.codeReviewWeekly.labelKey,
    undefined,
    codeReviewWindows.weeklyWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );

  const normalizeWindowId = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (Array.isArray(additionalRateLimits)) {
    additionalRateLimits.forEach((limitItem, index) => {
      const rateInfo = limitItem?.rate_limit ?? limitItem?.rateLimit ?? null;
      if (!rateInfo) return;

      const limitName =
        normalizeStringValue(limitItem?.limit_name ?? limitItem?.limitName) ??
        normalizeStringValue(limitItem?.metered_feature ?? limitItem?.meteredFeature) ??
        `additional-${index + 1}`;

      const idPrefix = normalizeWindowId(limitName) || `additional-${index + 1}`;
      const additionalPrimaryWindow = rateInfo.primary_window ?? rateInfo.primaryWindow ?? null;
      const additionalSecondaryWindow = rateInfo.secondary_window ?? rateInfo.secondaryWindow ?? null;
      const additionalLimitReached = rateInfo.limit_reached ?? rateInfo.limitReached;
      const additionalAllowed = rateInfo.allowed;

      addWindow(
        `${idPrefix}-five-hour-${index}`,
        t('codex_quota.additional_primary_window', { name: limitName }),
        'codex_quota.additional_primary_window',
        { name: limitName },
        additionalPrimaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
      addWindow(
        `${idPrefix}-weekly-${index}`,
        t('codex_quota.additional_secondary_window', { name: limitName }),
        'codex_quota.additional_secondary_window',
        { name: limitName },
        additionalSecondaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
    });
  }

  return windows;
};

const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{ planType: string | null; windows: CodexQuotaWindow[] }> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const planTypeFromFile = resolveCodexPlanType(file);
  const accountId = resolveCodexChatgptAccountId(file);
  if (!accountId) {
    throw new Error(t('codex_quota.missing_account_id'));
  }

  const requestHeader: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
    'Chatgpt-Account-Id': accountId,
  };

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: requestHeader,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const windows = buildCodexQuotaWindows(payload, t);
  return { planType: planTypeFromUsage ?? planTypeFromFile, windows };
};

const GEMINI_CLI_G1_CREDIT_TYPE = 'GOOGLE_ONE_AI';

const GEMINI_CLI_TIER_LABELS: Record<string, string> = {
  'free-tier': 'tier_free',
  'legacy-tier': 'tier_legacy',
  'standard-tier': 'tier_standard',
  'g1-pro-tier': 'tier_pro',
  'g1-ultra-tier': 'tier_ultra',
};

const resolveGeminiCliTierLabel = (
  payload: GeminiCliCodeAssistPayload | null,
  t: TFunction
): string | null => {
  if (!payload) return null;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const paidTier: GeminiCliUserTier | null | undefined =
    payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  if (!rawId) return null;
  const tierId = rawId.toLowerCase();
  const labelKey = GEMINI_CLI_TIER_LABELS[tierId];
  return labelKey ? t(`gemini_cli_quota.${labelKey}`) : rawId;
};

const resolveGeminiCliTierId = (
  payload: GeminiCliCodeAssistPayload | null
): string | null => {
  if (!payload) return null;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const paidTier: GeminiCliUserTier | null | undefined =
    payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  return rawId ? rawId.toLowerCase() : null;
};

const resolveGeminiCliCreditBalance = (
  payload: GeminiCliCodeAssistPayload | null
): number | null => {
  if (!payload) return null;
  const paidTier: GeminiCliUserTier | null | undefined =
    payload.paidTier ?? payload.paid_tier;
  const currentTier: GeminiCliUserTier | null | undefined =
    payload.currentTier ?? payload.current_tier;
  const tier = paidTier ?? currentTier;
  if (!tier) return null;
  const credits: GeminiCliCredits[] =
    tier.availableCredits ?? tier.available_credits ?? [];
  let total = 0;
  let found = false;
  for (const credit of credits) {
    const creditType = normalizeStringValue(credit.creditType ?? credit.credit_type);
    if (creditType !== GEMINI_CLI_G1_CREDIT_TYPE) continue;
    const amount = normalizeNumberValue(credit.creditAmount ?? credit.credit_amount);
    if (amount !== null) {
      total += amount;
      found = true;
    }
  }
  return found ? total : null;
};

const fetchGeminiCliCodeAssist = async (
  authIndex: string,
  projectId: string,
  t: TFunction
): Promise<{ tierLabel: string | null; tierId: string | null; creditBalance: number | null }> => {
  try {
    const result = await apiCallApi.request({
      authIndex,
      method: 'POST',
      url: GEMINI_CLI_CODE_ASSIST_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({
        cloudaicompanionProject: projectId,
        metadata: {
          ideType: 'IDE_UNSPECIFIED',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
          duetProject: projectId,
        },
      }),
    });

    if (result.statusCode < 200 || result.statusCode >= 300) {
      return { tierLabel: null, tierId: null, creditBalance: null };
    }

    const payload = parseGeminiCliCodeAssistPayload(result.body ?? result.bodyText);
    return {
      tierLabel: resolveGeminiCliTierLabel(payload, t),
      tierId: resolveGeminiCliTierId(payload),
      creditBalance: resolveGeminiCliCreditBalance(payload),
    };
  } catch {
    return { tierLabel: null, tierId: null, creditBalance: null };
  }
};

const readGeminiCliSupplementarySnapshot = (
  fileName: string,
  requestId: number
): { tierLabel: string | null; tierId: string | null; creditBalance: number | null } => {
  const cached = geminiCliSupplementaryCache.get(fileName);
  if (!cached || cached.requestId !== requestId) {
    return { tierLabel: null, tierId: null, creditBalance: null };
  }

  return {
    tierLabel: cached.tierLabel,
    tierId: cached.tierId,
    creditBalance: cached.creditBalance,
  };
};

const scheduleGeminiCliSupplementaryRefresh = (
  fileName: string,
  authIndex: string,
  projectId: string,
  t: TFunction
): number => {
  const requestId = (geminiCliSupplementaryRequestIds.get(fileName) ?? 0) + 1;
  geminiCliSupplementaryRequestIds.set(fileName, requestId);
  geminiCliSupplementaryCache.delete(fileName);

  void (async () => {
    const supplementary = await fetchGeminiCliCodeAssist(authIndex, projectId, t);
    if (geminiCliSupplementaryRequestIds.get(fileName) !== requestId) {
      return;
    }

    geminiCliSupplementaryCache.set(fileName, { requestId, ...supplementary });

    useQuotaStore.getState().setGeminiCliQuota((prev) => {
      const current = prev[fileName];
      if (!current || current.status !== 'success') {
        return prev;
      }

      if (
        current.tierLabel === supplementary.tierLabel &&
        current.tierId === supplementary.tierId &&
        current.creditBalance === supplementary.creditBalance
      ) {
        return prev;
      }

      return {
        ...prev,
        [fileName]: {
          ...current,
          tierLabel: supplementary.tierLabel,
          tierId: supplementary.tierId,
          creditBalance: supplementary.creditBalance,
        },
      };
    });
  })();

  return requestId;
};

const fetchGeminiCliQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{
  fileName: string;
  supplementaryRequestId: number;
  buckets: GeminiCliQuotaBucketState[];
  tierLabel: string | null;
  tierId: string | null;
  creditBalance: number | null;
}> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('gemini_cli_quota.missing_auth_index'));
  }

  const projectId = resolveGeminiCliProjectId(file);
  if (!projectId) {
    throw new Error(t('gemini_cli_quota.missing_project_id'));
  }

  const quotaResponse = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: GEMINI_CLI_QUOTA_URL,
    header: { ...GEMINI_CLI_REQUEST_HEADERS },
    data: JSON.stringify({ project: projectId }),
  });
  if (quotaResponse.statusCode < 200 || quotaResponse.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(quotaResponse), quotaResponse.statusCode);
  }

  const payload = parseGeminiCliQuotaPayload(quotaResponse.body ?? quotaResponse.bodyText);
  const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];

  const parsedBuckets = buckets
    .map((bucket) => {
      const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
      if (!modelId) return null;
      const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
      const remainingFractionRaw = normalizeQuotaFraction(
        bucket.remainingFraction ?? bucket.remaining_fraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remainingAmount ?? bucket.remaining_amount
      );
      const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }
      const remainingFraction = remainingFractionRaw ?? fallbackFraction;
      return {
        modelId,
        tokenType,
        remainingFraction,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  const builtBuckets = buildGeminiCliQuotaBuckets(parsedBuckets);
  const supplementaryRequestId = scheduleGeminiCliSupplementaryRefresh(
    file.name,
    authIndex,
    projectId,
    t
  );
  const supplementarySnapshot = readGeminiCliSupplementarySnapshot(
    file.name,
    supplementaryRequestId
  );

  return {
    fileName: file.name,
    supplementaryRequestId,
    buckets: builtBuckets,
    tierLabel: supplementarySnapshot.tierLabel,
    tierId: supplementarySnapshot.tierId,
    creditBalance: supplementarySnapshot.creditBalance,
  };
};

const renderAntigravityItems = (
  quota: AntigravityQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const groups = quota.groups ?? [];

  if (groups.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('antigravity_quota.empty_models'));
  }

  return groups.map((group) => {
    const clamped = Math.max(0, Math.min(1, group.remainingFraction));
    const percent = Math.round(clamped * 100);
    const resetLabel = formatQuotaResetTime(group.resetTime);

    return h(
      'div',
      { key: group.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel, title: group.models.join(', ') }, group.label),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, `${percent}%`),
          h('span', { className: styleMap.quotaReset }, resetLabel)
        )
      ),
      h(QuotaProgressBar, {
        percent,
        highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
        mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
      })
    );
  });
};

const PREMIUM_GEMINI_CLI_TIER_IDS = new Set(['g1-ultra-tier']);
const PREMIUM_CODEX_PLAN_TYPES = new Set(['pro', 'prolite', 'pro-lite', 'pro_lite']);

const renderCodexItems = (
  quota: CodexQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;

  const getPlanLabel = (pt?: string | null): string | null => {
    const normalized = normalizePlanType(pt);
    if (!normalized) return null;
    if (normalized === 'pro') return t('codex_quota.plan_pro');
    if (PREMIUM_CODEX_PLAN_TYPES.has(normalized) && normalized !== 'pro') {
      return t('codex_quota.plan_prolite');
    }
    if (normalized === 'plus') return t('codex_quota.plan_plus');
    if (normalized === 'team') return t('codex_quota.plan_team');
    if (normalized === 'free') return t('codex_quota.plan_free');
    return pt || normalized;
  };

  const planLabel = getPlanLabel(planType);
  const isPremiumPlan = PREMIUM_CODEX_PLAN_TYPES.has(normalizePlanType(planType) ?? '');
  const nodes: ReactNode[] = [];

  if (planLabel) {
    const valueClass = isPremiumPlan ? styleMap.premiumPlanValue : styleMap.codexPlanValue;
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.plan_label')),
        h('span', { className: valueClass }, planLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('codex_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey
        ? t(window.labelKey, window.labelParams as Record<string, string | number>)
        : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, {
          percent: remaining,
          highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
          mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
        })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

const renderGeminiCliItems = (
  quota: GeminiCliQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const buckets = quota.buckets ?? [];
  const tierLabel = quota.tierLabel ?? null;
  const tierId = quota.tierId ?? null;
  const creditBalance = quota.creditBalance ?? null;
  const isPremiumTier = tierId !== null && PREMIUM_GEMINI_CLI_TIER_IDS.has(tierId);
  const nodes: ReactNode[] = [];

  if (tierLabel) {
    const valueClass = isPremiumTier ? styleMap.premiumPlanValue : styleMap.codexPlanValue;
    nodes.push(
      h(
        'div',
        { key: 'tier', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('gemini_cli_quota.tier_label')),
        h('span', { className: valueClass }, tierLabel)
      )
    );
  }

  if (creditBalance !== null) {
    nodes.push(
      h(
        'div',
        { key: 'credits', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('gemini_cli_quota.credit_label')),
        h(
          'span',
          { className: styleMap.codexPlanValue },
          t('gemini_cli_quota.credit_amount', { count: creditBalance })
        )
      )
    );
  }

  if (buckets.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('gemini_cli_quota.empty_buckets'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...buckets.map((bucket) => {
      const fraction = bucket.remainingFraction;
      const clamped = fraction === null ? null : Math.max(0, Math.min(1, fraction));
      const percent = clamped === null ? null : Math.round(clamped * 100);
      const percentLabel = percent === null ? '--' : `${percent}%`;
      const remainingAmountLabel =
        bucket.remainingAmount === null || bucket.remainingAmount === undefined
          ? null
          : t('gemini_cli_quota.remaining_amount', {
            count: bucket.remainingAmount,
          });
      const titleBase =
        bucket.modelIds && bucket.modelIds.length > 0 ? bucket.modelIds.join(', ') : bucket.label;
      const title = bucket.tokenType ? `${titleBase} (${bucket.tokenType})` : titleBase;

      const resetLabel = formatQuotaResetTime(bucket.resetTime);

      return h(
        'div',
        { key: bucket.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel, title }, bucket.label),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            remainingAmountLabel
              ? h('span', { className: styleMap.quotaAmount }, remainingAmountLabel)
              : null,
            h('span', { className: styleMap.quotaReset }, resetLabel)
          )
        ),
        h(QuotaProgressBar, {
          percent,
          highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
          mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
        })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const windows: ClaudeQuotaWindow[] = [];

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
    });
  }

  return windows;
};

const normalizeFlagValue = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return undefined;
};

const parseClaudeProfilePayload = (payload: unknown): ClaudeProfileResponse | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeProfileResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeProfileResponse;
  }
  return null;
};

const resolveClaudePlanType = (profile: ClaudeProfileResponse | null): string | null => {
  if (!profile) return null;

  const hasClaudeMax = normalizeFlagValue(profile.account?.has_claude_max);
  if (hasClaudeMax) return 'plan_max';

  const hasClaudePro = normalizeFlagValue(profile.account?.has_claude_pro);
  if (hasClaudePro) return 'plan_pro';

  const organizationType = normalizeStringValue(profile.organization?.organization_type)?.toLowerCase();
  const subscriptionStatus = normalizeStringValue(profile.organization?.subscription_status)?.toLowerCase();

  if (organizationType === 'claude_team' && subscriptionStatus === 'active') {
    return 'plan_team';
  }

  if (hasClaudeMax === false && hasClaudePro === false) return 'plan_free';

  return null;
};

const fetchClaudeQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{ windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null; planType?: string | null }> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  const [usageResult, profileResult] = await Promise.allSettled([
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_USAGE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_PROFILE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
  ]);

  if (usageResult.status === 'rejected') {
    throw usageResult.reason;
  }

  const result = usageResult.value;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseClaudeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const planType =
    profileResult.status === 'fulfilled' &&
      profileResult.value.statusCode >= 200 &&
      profileResult.value.statusCode < 300
      ? resolveClaudePlanType(
        parseClaudeProfilePayload(profileResult.value.body ?? profileResult.value.bodyText)
      )
      : null;

  return { windows, extraUsage: payload.extra_usage, planType };
};

const renderClaudeItems = (
  quota: ClaudeQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const extraUsage = quota.extraUsage ?? null;
  const planType = quota.planType ?? null;
  const nodes: ReactNode[] = [];

  if (planType) {
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, t(`claude_quota.${planType}`))
      )
    );
  }

  if (extraUsage && extraUsage.is_enabled) {
    const usedLabel = `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;
    nodes.push(
      h(
        'div',
        { key: 'extra', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.extra_usage_label')),
        h('span', { className: styleMap.codexPlanValue }, usedLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('claude_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey ? t(window.labelKey) : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, {
          percent: remaining,
          highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
          mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
        })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

export const CLAUDE_CONFIG: QuotaConfig<
  ClaudeQuotaState,
  { windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null; planType?: string | null }
> = {
  type: 'claude',
  i18nPrefix: 'claude_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isClaudeFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchClaudeQuota,
  storeSelector: (state) => state.claudeQuota,
  storeSetter: 'setClaudeQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    extraUsage: data.extraUsage,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.claudeCard,
  controlsClassName: styles.claudeControls,
  controlClassName: styles.claudeControl,
  gridClassName: styles.claudeGrid,
  renderQuotaItems: renderClaudeItems,
};

export const ANTIGRAVITY_CONFIG: QuotaConfig<AntigravityQuotaState, AntigravityQuotaGroup[]> = {
  type: 'antigravity',
  i18nPrefix: 'antigravity_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isAntigravityFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchAntigravityQuota,
  storeSelector: (state) => state.antigravityQuota,
  storeSetter: 'setAntigravityQuota',
  buildLoadingState: () => ({ status: 'loading', groups: [] }),
  buildSuccessState: (groups) => ({ status: 'success', groups }),
  buildErrorState: (message, status) => ({
    status: 'error',
    groups: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.antigravityCard,
  controlsClassName: styles.antigravityControls,
  controlClassName: styles.antigravityControl,
  gridClassName: styles.antigravityGrid,
  renderQuotaItems: renderAntigravityItems,
};

export const CODEX_CONFIG: QuotaConfig<
  CodexQuotaState,
  { planType: string | null; windows: CodexQuotaWindow[] }
> = {
  type: 'codex',
  i18nPrefix: 'codex_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isCodexFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCodexQuota,
  storeSelector: (state) => state.codexQuota,
  storeSetter: 'setCodexQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.codexCard,
  controlsClassName: styles.codexControls,
  controlClassName: styles.codexControl,
  gridClassName: styles.codexGrid,
  renderQuotaItems: renderCodexItems,
};

export const GEMINI_CLI_CONFIG: QuotaConfig<
  GeminiCliQuotaState,
  {
    fileName: string;
    supplementaryRequestId: number;
    buckets: GeminiCliQuotaBucketState[];
    tierLabel: string | null;
    tierId: string | null;
    creditBalance: number | null;
  }
> = {
  type: 'gemini-cli',
  i18nPrefix: 'gemini_cli_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) =>
    isGeminiCliFile(file) && !isRuntimeOnlyAuthFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchGeminiCliQuota,
  storeSelector: (state) => state.geminiCliQuota,
  storeSetter: 'setGeminiCliQuota',
  buildLoadingState: () => ({ status: 'loading', buckets: [], tierLabel: null, tierId: null, creditBalance: null }),
  buildSuccessState: (data) => {
    const supplementarySnapshot = readGeminiCliSupplementarySnapshot(
      data.fileName,
      data.supplementaryRequestId
    );

    return {
      status: 'success',
      buckets: data.buckets,
      tierLabel: supplementarySnapshot.tierLabel ?? data.tierLabel,
      tierId: supplementarySnapshot.tierId ?? data.tierId,
      creditBalance: supplementarySnapshot.creditBalance ?? data.creditBalance,
    };
  },
  buildErrorState: (message, status) => ({
    status: 'error',
    buckets: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.geminiCliCard,
  controlsClassName: styles.geminiCliControls,
  controlClassName: styles.geminiCliControl,
  gridClassName: styles.geminiCliGrid,
  renderQuotaItems: renderGeminiCliItems,
};

const fetchKimiQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<KimiQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kimi_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: KIMI_USAGE_URL,
    header: { ...KIMI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kimi_quota.empty_data'));
  }

  return buildKimiQuotaRows(payload);
};

const renderKimiItems = (
  quota: KimiQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const rows = quota.rows ?? [];

  if (rows.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('kimi_quota.empty_data'));
  }

  return rows.map((row) => {
    const limit = row.limit;
    const used = row.used;
    const remaining =
      limit > 0
        ? Math.max(0, Math.min(100, Math.round(((limit - used) / limit) * 100)))
        : used > 0
          ? 0
          : null;
    const percentLabel = remaining === null ? '--' : `${remaining}%`;
    const rowLabel = row.labelKey
      ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
      : row.label ?? '';
    const resetLabel = formatKimiResetHint(t, row.resetHint);

    return h(
      'div',
      { key: row.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel }, rowLabel),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, percentLabel),
          limit > 0
            ? h('span', { className: styleMap.quotaAmount }, `${used} / ${limit}`)
            : null,
          resetLabel
            ? h('span', { className: styleMap.quotaReset }, resetLabel)
            : null
        )
      ),
      h(QuotaProgressBar, {
        percent: remaining,
        highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
        mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
      })
    );
  });
};

export const KIMI_CONFIG: QuotaConfig<KimiQuotaState, KimiQuotaRow[]> = {
  type: 'kimi',
  i18nPrefix: 'kimi_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isKimiFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchKimiQuota,
  storeSelector: (state) => state.kimiQuota,
  storeSetter: 'setKimiQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.kimiCard,
  controlsClassName: styles.kimiControls,
  controlClassName: styles.kimiControl,
  gridClassName: styles.kimiGrid,
  renderQuotaItems: renderKimiItems,
};

const fetchCopilotQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<CopilotQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('copilot_quota.missing_auth_index'));
  }

  try {
    const result = await apiClient.get<Record<string, unknown>>(`/copilot-quota?auth_index=${encodeURIComponent(authIndex)}`);

    const payload = result as Record<string, unknown>;
    const rows: CopilotQuotaRow[] = [];

    const quotaSnapshots = payload.quota_snapshots as Record<string, unknown> | undefined;
    if (!quotaSnapshots || typeof quotaSnapshots !== 'object') {
      return rows;
    }

    const parseQuotaDetail = (detail: unknown) => {
      if (!detail || typeof detail !== 'object') {
        return null;
      }
      const d = detail as Record<string, unknown>;
      const entitlement = Number(d.entitlement ?? d.Entitlement ?? 0);
      const remaining = Number(d.remaining ?? d.Remaining ?? d.quota_remaining ?? d.QuotaRemaining ?? 0);
      const used = entitlement - remaining;
      let percentRemaining = Number(d.percent_remaining ?? d.PercentRemaining ?? 0);
      if (percentRemaining <= 1 && entitlement > 0) {
        percentRemaining = (remaining / entitlement) * 100;
      }
      percentRemaining = Math.round(percentRemaining);

      return {
        used,
        limit: entitlement,
        remaining,
        remainingPercent: percentRemaining,
      };
    };

    const chatData = parseQuotaDetail(quotaSnapshots.chat ?? quotaSnapshots.Chat);
    if (chatData) {
      rows.push({
        id: 'chat',
        labelKey: 'copilot_quota.chat_label',
        ...chatData,
      });
    }

    const completionsData = parseQuotaDetail(quotaSnapshots.completions ?? quotaSnapshots.Completions);
    if (completionsData) {
      rows.push({
        id: 'completions',
        labelKey: 'copilot_quota.completions_label',
        ...completionsData,
      });
    }

    // const premiumData = parseQuotaDetail(quotaSnapshots.premium_interactions ?? quotaSnapshots.PremiumInteractions);
    // if (premiumData) {
    //   rows.push({
    //     id: 'premium_interactions',
    //     labelKey: 'copilot_quota.premium_interactions_label',
    //     ...premiumData,
    //   });
    // }

    return rows;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    const status = getStatusFromError(err);
    throw createStatusError(message, status);
  }
};

const renderCopilotItems = (
  quota: CopilotQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const rows = quota.rows ?? [];

  if (rows.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('copilot_quota.empty'));
  }

  return h(
    Fragment,
    null,
    ...rows.map((row: CopilotQuotaRow) => {
      const remaining = row.remainingPercent ?? null;
      const clampedRemaining = remaining === null ? null : Math.max(0, Math.min(100, remaining));
      const percentLabel = clampedRemaining === null ? '--' : `${Math.round(clampedRemaining)}%`;
      const rowLabel = row.labelKey ? t(row.labelKey) : row.label || row.id;

      return h(
        'div',
        { key: row.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, rowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel)
          )
        ),
        h(QuotaProgressBar, {
          percent: clampedRemaining,
          highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
          mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
        })
      );
    })
  );
};

export const COPILOT_CONFIG: QuotaConfig<CopilotQuotaState, CopilotQuotaRow[]> = {
  type: 'copilot',
  i18nPrefix: 'copilot_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isCopilotFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCopilotQuota,
  storeSelector: (state) => state.copilotQuota,
  storeSetter: 'setCopilotQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.codexCard,
  controlsClassName: styles.codexControls,
  controlClassName: styles.codexControl,
  gridClassName: styles.codexGrid,
  renderQuotaItems: renderCopilotItems,
};

const fetchKiroQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<KiroQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kiro_quota.missing_auth_index'));
  }

  try {
    const result = await apiClient.get<Record<string, unknown>>(`/kiro-quota?auth_index=${encodeURIComponent(authIndex)}`);

    const payload = result as Record<string, unknown>;
    const rows: KiroQuotaRow[] = [];

    const usage = payload.usage as Record<string, unknown> | undefined;
    if (usage) {
      const usageBreakdownList = usage.usageBreakdownList as Array<Record<string, unknown>> | undefined;
      if (usageBreakdownList && Array.isArray(usageBreakdownList)) {
        for (const breakdown of usageBreakdownList) {
          const resourceType = String(breakdown.resourceType ?? '');
          const used = Number(breakdown.currentUsageWithPrecision ?? 0);
          const limit = Number(breakdown.usageLimitWithPrecision ?? 0);
          const remaining = limit - used;

          let id = '';
          let labelKey = '';

          if (resourceType === 'CREDIT' || resourceType.includes('CREDIT')) {
            id = 'code_scan';
            labelKey = 'kiro_quota.code_scan_label';
          } else if (resourceType === 'AGENTIC_REQUEST' || resourceType.includes('AGENTIC')) {
            id = 'code_generation';
            labelKey = 'kiro_quota.code_generation_label';
          }

          if (id) {
            rows.push({
              id,
              labelKey,
              used,
              limit,
              remaining: remaining > 0 ? remaining : 0,
              remainingPercent: limit ? Math.round((remaining / limit) * 100) : undefined,
              unit: 'tokens',
            });
          }
        }
      }
    }

    return rows;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    const status = getStatusFromError(err);
    throw createStatusError(message, status);
  }
};

const renderKiroItems = (
  quota: KiroQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const rows = quota.rows ?? [];

  if (rows.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('kiro_quota.empty'));
  }

  return h(
    Fragment,
    null,
    ...rows.map((row: KiroQuotaRow) => {
      const remaining = row.remainingPercent ?? null;
      const clampedRemaining = remaining === null ? null : Math.max(0, Math.min(100, remaining));
      const percentLabel = clampedRemaining === null ? '--' : `${Math.round(clampedRemaining)}%`;
      const rowLabel = row.labelKey ? t(row.labelKey) : row.label || row.id;

      return h(
        'div',
        { key: row.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, rowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel)
          )
        ),
        h(QuotaProgressBar, {
          percent: clampedRemaining,
          highThreshold: QUOTA_PROGRESS_HIGH_THRESHOLD,
          mediumThreshold: QUOTA_PROGRESS_MEDIUM_THRESHOLD,
        })
      );
    })
  );
};

export const KIRO_CONFIG: QuotaConfig<KiroQuotaState, KiroQuotaRow[]> = {
  type: 'kiro',
  i18nPrefix: 'kiro_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isKiroFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchKiroQuota,
  storeSelector: (state) => state.kiroQuota,
  storeSetter: 'setKiroQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.codexCard,
  controlsClassName: styles.codexControls,
  controlClassName: styles.codexControl,
  gridClassName: styles.codexGrid,
  renderQuotaItems: renderKiroItems,
};
