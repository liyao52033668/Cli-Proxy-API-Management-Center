import { useCallback, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { apiKeyUsageApi, type ApiKeyUsageMap } from '@/services/api';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';

const EMPTY_API_KEY_USAGE: ApiKeyUsageMap = {};

export type UseProviderStatsOptions = {
  enabled?: boolean;
};

export const useProviderStats = (options: UseProviderStatsOptions = {}) => {
  const enabled = options.enabled ?? true;
  // Always expose the cached snapshot; `enabled` only gates refresh side effects.
  // Projecting empty stats while the page is a stacked transition layer made
  // every provider card show 0 after returning from an edit page.
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
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
    apiKeyUsage,
    loadKeyStats,
    refreshKeyStats,
    isLoading,
  };
};
