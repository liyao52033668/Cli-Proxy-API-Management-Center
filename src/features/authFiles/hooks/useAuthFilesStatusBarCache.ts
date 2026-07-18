import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import { calculateStatusBarData, normalizeAuthIndex, type UsageDetail } from '@/utils/usage';
import {
  calculateStatusBarDataFromRecentRequests,
  extractRecentRequestBuckets,
  type StatusBarData,
} from '@/utils/statusBarFromRecentRequests';

export type AuthFileStatusBarData = StatusBarData;

/**
 * Build a status-bar cache keyed by auth_index.
 * Prefer auth-files `recent_requests` (authoritative per-auth runtime buckets).
 * Fall back to usage event details when recent_requests is absent (older backends).
 */
export function useAuthFilesStatusBarCache(files: AuthFileItem[], usageDetails: UsageDetail[]) {
  return useMemo(() => {
    const cache = new Map<string, AuthFileStatusBarData>();

    const usageDetailsByAuthIndex = new Map<string, UsageDetail[]>();
    usageDetails.forEach((detail) => {
      const authIndexKey = normalizeAuthIndex(detail.auth_index);
      if (!authIndexKey) return;

      const list = usageDetailsByAuthIndex.get(authIndexKey);
      if (list) {
        list.push(detail);
      } else {
        usageDetailsByAuthIndex.set(authIndexKey, [detail]);
      }
    });

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndex(rawAuthIndex);
      if (!authIndexKey || cache.has(authIndexKey)) return;

      const recentBuckets = extractRecentRequestBuckets(file);
      if (recentBuckets.length > 0) {
        cache.set(authIndexKey, calculateStatusBarDataFromRecentRequests(recentBuckets));
        return;
      }

      cache.set(
        authIndexKey,
        calculateStatusBarData(usageDetailsByAuthIndex.get(authIndexKey) ?? [])
      );
    });

    return cache;
  }, [files, usageDetails]);
}
