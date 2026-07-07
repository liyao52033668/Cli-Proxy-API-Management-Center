import { ApiError } from '@/services/api/client';
import { usageApi, type UsageOverviewResponse, type UsageSnapshot, type UsageTimeRange } from '@/services/api/usage';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import { downloadBlob } from '@/utils/download';
import type { ModelPrice } from '@/utils/usage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type UsagePayload = Partial<UsageSnapshot>;

export type UsageOverviewPayload = Omit<UsageOverviewResponse, 'usage'> & {
  usage: UsagePayload;
};

export interface UseUsageDataReturn {
  usage: UsageOverviewPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => void;
  loadUsage: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
}

export interface UseUsageDataOptions {
  onAuthRequired?: () => void;
  range?: UsageTimeRange;
  customStart?: string;
  customEnd?: string;
  enabled?: boolean;
}

export const normalizeUsageOverviewRange = (value: string): UsageTimeRange => (
  value === '4h' || value === '8h' || value === '12h' || value === '24h' || value === 'today' || value === '7d' || value === '30d' || value === 'all' || value === 'custom'
    ? value
    : 'all'
);

const toCustomDateParam = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
};

const normalizeSeriesKeys = (series: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!series) return undefined;
  const rawModels = series['Models'] ?? series['models'];
  const models = rawModels && typeof rawModels === 'object' && !Array.isArray(rawModels)
    ? Object.fromEntries(
      Object.entries(rawModels as Record<string, unknown>).map(([model, modelSeries]) => [
        model,
        normalizeSeriesKeys(modelSeries as Record<string, unknown>) ?? {}
      ])
    )
    : undefined;

  return {
    requests: series['Requests'] ?? series['requests'],
    tokens: series['Tokens'] ?? series['tokens'],
    rpm: series['RPM'] ?? series['rpm'],
    tpm: series['TPM'] ?? series['tpm'],
    cost: series['Cost'] ?? series['cost'],
    input_tokens: series['InputTokens'] ?? series['input_tokens'],
    output_tokens: series['OutputTokens'] ?? series['output_tokens'],
    cached_tokens: series['CachedTokens'] ?? series['cached_tokens'],
    reasoning_tokens: series['ReasoningTokens'] ?? series['reasoning_tokens'],
    models,
  };
};

const normalizeHealthBlocks = (blocks: unknown[] | undefined): unknown[] | undefined => {
  if (!blocks || !Array.isArray(blocks)) return undefined;
  return blocks.map((block: unknown) => {
    if (!block || typeof block !== 'object') return block;
    const b = block as Record<string, unknown>;
    return {
      start_time: b['StartTime'] ?? b['start_time'],
      end_time: b['EndTime'] ?? b['end_time'],
      success: b['Success'] ?? b['success'],
      failure: b['Failure'] ?? b['failure'],
      rate: b['Rate'] ?? b['rate'],
    };
  });
};

export function useUsageData(options: UseUsageDataOptions = {}): UseUsageDataReturn {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const { onAuthRequired, range = 'all', customStart, customEnd, enabled = true } = options;

  const usageSnapshot = useUsageStatsStore((state) => state.usage);
  const loading = useUsageStatsStore((state) => state.loading);
  const storeError = useUsageStatsStore((state) => state.error);
  const lastRefreshedAtTs = useUsageStatsStore((state) => state.lastRefreshedAt);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const [modelPrices, setModelPricesState] = useState<Record<string, ModelPrice>>({});
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedRange = normalizeUsageOverviewRange(range);
  const requestStart = resolvedRange === 'custom' ? toCustomDateParam(customStart) : undefined;
  const requestEnd = resolvedRange === 'custom' ? toCustomDateParam(customEnd) : undefined;
  const customRangeReady = resolvedRange !== 'custom' || (requestStart !== undefined && requestEnd !== undefined);

  const loadUsage = useCallback(async () => {
    if (!customRangeReady) return;
    try {
      await loadUsageStats({
        force: true,
        staleTimeMs: USAGE_STATS_STALE_TIME_MS,
        range: resolvedRange,
        start: requestStart,
        end: requestEnd,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onAuthRequired?.();
      }
      throw error;
    }
  }, [customRangeReady, loadUsageStats, onAuthRequired, requestEnd, requestStart, resolvedRange]);

  useEffect(() => {
    if (!enabled || !customRangeReady) {
      return;
    }
    void Promise.all([
      loadUsageStats({
        staleTimeMs: USAGE_STATS_STALE_TIME_MS,
        range: resolvedRange,
        start: requestStart,
        end: requestEnd,
      }),
      usageApi.getPricing().then((response) => {
        const prices = Object.fromEntries(
          response.pricing.map((entry) => [
            entry.model,
            {
              prompt: entry.prompt_price_per_1m,
              completion: entry.completion_price_per_1m,
              cache: entry.cache_price_per_1m,
            },
          ])
        );
        setModelPricesState(prices);
      }),
    ]).catch((error) => {
      if (error instanceof ApiError && error.status === 401) {
        onAuthRequired?.();
      }
    });
  }, [customRangeReady, enabled, loadUsageStats, onAuthRequired, requestEnd, requestStart, resolvedRange]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage();
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' })
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        showNotification(t('usage_stats.import_invalid'), 'error');
        return;
      }

      const result = await usageApi.importUsage(payload);
      showNotification(
        t('usage_stats.import_success', {
          added: result?.added ?? 0,
          skipped: result?.skipped ?? 0,
          total: result?.total_requests ?? 0,
          failed: result?.failed_requests ?? 0
        }),
        'success'
      );
      try {
        await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(
        `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleSetModelPrices = useCallback((prices: Record<string, ModelPrice>) => {
    setModelPricesState(prices);
  }, []);

  const usage = usageSnapshot
    ? ((() => {
      const snapshot = usageSnapshot as unknown as Record<string, unknown>;
      const rawSeries = usageSnapshot.series ?? snapshot['Series'];
      const rawHourlySeries = usageSnapshot.hourly_series ?? snapshot['HourlySeries'];
      const rawDailySeries = usageSnapshot.daily_series ?? snapshot['DailySeries'];
      const rawHealth = usageSnapshot.service_health ?? snapshot['ServiceHealth'] ?? snapshot['Health'];

      return {
        ...usageSnapshot,
        usage: usageSnapshot.usage ?? snapshot['Usage'] ?? null,
        summary: usageSnapshot.summary ?? snapshot['Summary'],
        series: normalizeSeriesKeys(rawSeries as Record<string, unknown>),
        hourly_series: normalizeSeriesKeys(rawHourlySeries as Record<string, unknown>),
        daily_series: normalizeSeriesKeys(rawDailySeries as Record<string, unknown>),
        service_health: rawHealth ? {
          ...(rawHealth as Record<string, unknown>),
          total_success: (rawHealth as Record<string, unknown>)['TotalSuccess'] ?? (rawHealth as Record<string, unknown>)['total_success'],
          total_failure: (rawHealth as Record<string, unknown>)['TotalFailure'] ?? (rawHealth as Record<string, unknown>)['total_failure'],
          success_rate: (rawHealth as Record<string, unknown>)['SuccessRate'] ?? (rawHealth as Record<string, unknown>)['success_rate'],
          block_details: normalizeHealthBlocks((rawHealth as Record<string, unknown>)['BlockDetails'] as unknown[] ?? (rawHealth as Record<string, unknown>)['block_details'] as unknown[]),
        } : undefined,
      };
    })() as UsageOverviewPayload)
    : null;
  const error = storeError || '';
  const lastRefreshedAt = lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null;

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices: handleSetModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  };
}