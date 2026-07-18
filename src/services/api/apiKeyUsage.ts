/**
 * API key usage from management `/api-key-usage`.
 * Returns per-provider maps keyed by `base_url|api_key` with recent_requests buckets.
 */

import { apiClient } from './client';

export interface ApiKeyRecentRequestBucket {
  time?: string;
  success?: number;
  failed?: number;
  failure?: number;
}

export interface ApiKeyUsageEntry {
  success: number;
  failed: number;
  recent_requests?: ApiKeyRecentRequestBucket[];
}

/** provider -> (base_url|api_key) -> entry */
export type ApiKeyUsageMap = Record<string, Record<string, ApiKeyUsageEntry>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toNonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
};

const normalizeEntry = (raw: unknown): ApiKeyUsageEntry | null => {
  if (!isRecord(raw)) return null;
  const recentRaw = raw.recent_requests ?? raw.recentRequests;
  const recent_requests = Array.isArray(recentRaw)
    ? recentRaw
        .filter((item) => isRecord(item))
        .map((item) => ({
          time: typeof item.time === 'string' ? item.time : typeof item.Time === 'string' ? item.Time : undefined,
          success: toNonNegativeInt(item.success ?? item.Success),
          failed: toNonNegativeInt(item.failed ?? item.Failed ?? item.failure ?? item.Failure),
        }))
    : undefined;

  return {
    success: toNonNegativeInt(raw.success ?? raw.Success),
    failed: toNonNegativeInt(raw.failed ?? raw.Failed ?? raw.failure ?? raw.Failure),
    recent_requests,
  };
};

export const normalizeApiKeyUsageMap = (raw: unknown): ApiKeyUsageMap => {
  if (!isRecord(raw)) return {};
  const out: ApiKeyUsageMap = {};
  Object.entries(raw).forEach(([provider, providerBucket]) => {
    const providerKey = String(provider || '')
      .trim()
      .toLowerCase();
    if (!providerKey || !isRecord(providerBucket)) return;
    const entries: Record<string, ApiKeyUsageEntry> = {};
    Object.entries(providerBucket).forEach(([compositeKey, entryRaw]) => {
      const entry = normalizeEntry(entryRaw);
      if (entry) entries[compositeKey] = entry;
    });
    out[providerKey] = entries;
  });
  return out;
};

export const apiKeyUsageApi = {
  get: async (): Promise<ApiKeyUsageMap> => {
    const data = await apiClient.get<unknown>('/api-key-usage');
    return normalizeApiKeyUsageMap(data);
  },
};
