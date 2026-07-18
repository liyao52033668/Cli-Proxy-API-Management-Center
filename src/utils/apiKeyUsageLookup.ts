/**
 * Lookup helpers for management `/api-key-usage` maps.
 * Keys are `base_url|api_key`, grouped by lower-cased provider name.
 */

import type { ApiKeyUsageEntry, ApiKeyUsageMap } from '../services/api/apiKeyUsage.ts';
import {
  calculateStatusBarDataFromRecentRequests,
  extractRecentRequestBuckets,
  type RecentRequestBucket,
  type StatusBarData,
} from './statusBarFromRecentRequests.ts';

export const normalizeUsageBaseUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
};

export const buildApiKeyUsageCompositeKey = (baseUrl: unknown, apiKey: unknown): string => {
  const base = normalizeUsageBaseUrl(baseUrl);
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  return `${base}|${key}`;
};

const compositeKeyVariants = (baseUrl: unknown, apiKey: unknown): string[] => {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return [];
  const rawBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const normalizedBase = normalizeUsageBaseUrl(rawBase);
  const variants = new Set<string>();
  variants.add(`${normalizedBase}|${key}`);
  if (rawBase && rawBase !== normalizedBase) {
    variants.add(`${rawBase}|${key}`);
  }
  // Some synthesizers store empty base when unset.
  variants.add(`|${key}`);
  return Array.from(variants);
};

export function lookupApiKeyUsageEntry(
  usageMap: ApiKeyUsageMap | null | undefined,
  provider: string,
  baseUrl: unknown,
  apiKey: unknown
): ApiKeyUsageEntry | null {
  if (!usageMap) return null;
  const providerKey = String(provider || '')
    .trim()
    .toLowerCase();
  if (!providerKey) return null;

  const providerBucket = usageMap[providerKey];
  if (!providerBucket) return null;

  for (const composite of compositeKeyVariants(baseUrl, apiKey)) {
    const entry = providerBucket[composite];
    if (entry) return entry;
  }

  // Fallback: match by api_key suffix only when unique under the provider.
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return null;
  const suffix = `|${key}`;
  const matches = Object.entries(providerBucket).filter(([composite]) => composite.endsWith(suffix));
  if (matches.length === 1) return matches[0][1];
  return null;
}

export function mergeApiKeyUsageEntries(entries: ApiKeyUsageEntry[]): ApiKeyUsageEntry | null {
  if (!entries.length) return null;
  let success = 0;
  let failed = 0;
  let mergedBuckets: RecentRequestBucket[] | null = null;

  for (const entry of entries) {
    success += entry.success || 0;
    failed += entry.failed || 0;
    const buckets = extractRecentRequestBuckets(entry);
    if (!buckets.length) continue;
    if (!mergedBuckets) {
      mergedBuckets = buckets.map((b) => ({ ...b }));
      continue;
    }
    const n = Math.min(mergedBuckets.length, buckets.length);
    for (let i = 0; i < n; i++) {
      mergedBuckets[i] = {
        time: mergedBuckets[i].time || buckets[i].time,
        success: (mergedBuckets[i].success || 0) + (buckets[i].success || 0),
        failed: (mergedBuckets[i].failed || 0) + (buckets[i].failed || 0),
      };
    }
  }

  return {
    success,
    failed,
    recent_requests: mergedBuckets ?? undefined,
  };
}

export function statusBarFromApiKeyUsageEntry(entry: ApiKeyUsageEntry | null | undefined): StatusBarData | null {
  if (!entry) return null;
  const buckets = extractRecentRequestBuckets(entry);
  if (!buckets.length) return null;
  return calculateStatusBarDataFromRecentRequests(buckets);
}

/**
 * Prefer `/api-key-usage` recent_requests buckets for the status bar.
 * Returns null when no matching entry with buckets is available (caller may fall back).
 */
export function resolveStatusBarPreferApiKeyUsage(options: {
  usageMap?: ApiKeyUsageMap | null;
  provider: string;
  baseUrl?: unknown;
  apiKey?: unknown;
  entries?: Array<{ baseUrl?: unknown; apiKey?: unknown }>;
}): StatusBarData | null {
  const { usageMap, provider, baseUrl, apiKey, entries } = options;

  if (entries?.length) {
    const lookedUp = entries
      .map((item) => lookupApiKeyUsageEntry(usageMap, provider, item.baseUrl ?? baseUrl, item.apiKey))
      .filter((item): item is ApiKeyUsageEntry => Boolean(item));
    return statusBarFromApiKeyUsageEntry(mergeApiKeyUsageEntries(lookedUp));
  }

  const entry = lookupApiKeyUsageEntry(usageMap, provider, baseUrl, apiKey);
  return statusBarFromApiKeyUsageEntry(entry);
}
