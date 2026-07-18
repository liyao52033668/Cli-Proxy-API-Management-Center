import { useCallback, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { apiKeyUsageApi, type ApiKeyUsageMap } from '@/services/api';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import type { KeyStats, UsageDetail } from '@/utils/usage';

const EMPTY_KEY_STATS: KeyStats = { bySource: {}, byAuthIndex: {} };
const EMPTY_USAGE_DETAILS: UsageDetail[] = [];
const EMPTY_API_KEY_USAGE: ApiKeyUsageMap = {};

export type UseProviderStatsOptions = {
  enabled?: boolean;
};

export const useProviderStats = (options: UseProviderStatsOptions = {}) => {
  const enabled = options.enabled ?? true;
  const keyStats = useUsageStatsStore((state) => (enabled ? state.keyStats : EMPTY_KEY_STATS));
  const usageDetails = useUsageStatsStore((state) =>
    enabled ? state.usageDetails : EMPTY_USAGE_DETAILS
  );
  const isLoading = useUsageStatsStore((state) => (enabled ? state.loading : false));
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const [apiKeyUsage, setApiKeyUsage] = useState<ApiKeyUsageMap>(EMPTY_API_KEY_USAGE);

  const loadApiKeyUsage = useCallback(async () => {
    try {
      const data = await apiKeyUsageApi.get();
      setApiKeyUsage(data);
    } catch {
      // Keep previous snapshot on transient errors.
    }
  }, []);

  // Prefer cache on first page enter; always refresh api-key-usage for status bars.
  const loadKeyStats = useCallback(async () => {
    await Promise.all([
      loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS }),
      loadApiKeyUsage(),
    ]);
  }, [loadApiKeyUsage, loadUsageStats]);

  // Forced refresh for interval / header refresh.
  const refreshKeyStats = useCallback(async () => {
    await Promise.all([
      loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS }),
      loadApiKeyUsage(),
    ]);
  }, [loadApiKeyUsage, loadUsageStats]);

  useInterval(() => {
    void refreshKeyStats().catch(() => {});
  }, enabled ? 240_000 : null);

  return {
    keyStats,
    usageDetails,
    apiKeyUsage: enabled ? apiKeyUsage : EMPTY_API_KEY_USAGE,
    loadKeyStats,
    refreshKeyStats,
    isLoading,
  };
};
