import { ApiError } from '@/services/api/client';
import {
  usageApi,
  type UsageOverviewResponse,
  type UsageOverviewSeries,
  type UsageOverviewSummary,
  type UsageSnapshot,
  type UsageTimeRange,
} from '@/services/api/usage';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import { downloadBlob } from '@/utils/download';
import type { ModelPrice } from '@/utils/usage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  setModelPrice: (model: string, price: ModelPrice) => void;
  deleteModelPrice: (model: string) => void;
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

export const normalizeUsageOverviewRange = (value: string): UsageTimeRange =>
  value === '4h' ||
  value === '8h' ||
  value === '12h' ||
  value === '24h' ||
  value === 'today' ||
  value === '7d' ||
  value === '30d' ||
  value === 'all' ||
  value === 'custom'
    ? value
    : 'all';

const toCustomDateParam = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
};

const normalizeSeriesKeys = (
  series: Record<string, unknown> | undefined
): UsageOverviewSeries | undefined => {
  if (!series) return undefined;
  const rawModels = series['Models'] ?? series['models'];
  const models =
    rawModels && typeof rawModels === 'object' && !Array.isArray(rawModels)
      ? Object.fromEntries(
          Object.entries(rawModels as Record<string, unknown>).map(([model, modelSeries]) => [
            model,
            normalizeSeriesKeys(modelSeries as Record<string, unknown>) ?? emptyUsageSeries(),
          ])
        )
      : undefined;

  return {
    requests: (series['Requests'] ?? series['requests'] ?? {}) as Record<string, number>,
    tokens: (series['Tokens'] ?? series['tokens'] ?? {}) as Record<string, number>,
    rpm: (series['RPM'] ?? series['rpm'] ?? {}) as Record<string, number>,
    tpm: (series['TPM'] ?? series['tpm'] ?? {}) as Record<string, number>,
    cost: (series['Cost'] ?? series['cost'] ?? {}) as Record<string, number>,
    input_tokens: (series['InputTokens'] ?? series['input_tokens'] ?? {}) as Record<string, number>,
    output_tokens: (series['OutputTokens'] ?? series['output_tokens'] ?? {}) as Record<
      string,
      number
    >,
    cached_tokens: (series['CachedTokens'] ?? series['cached_tokens'] ?? {}) as Record<
      string,
      number
    >,
    reasoning_tokens: (series['ReasoningTokens'] ?? series['reasoning_tokens'] ?? {}) as Record<
      string,
      number
    >,
    models,
  };
};

const emptyUsageSeries = (): UsageOverviewSeries => ({
  requests: {},
  tokens: {},
  rpm: {},
  tpm: {},
  cost: {},
  input_tokens: {},
  output_tokens: {},
  cached_tokens: {},
  reasoning_tokens: {},
  models: {},
});

const normalizeSummary = (
  summary: Record<string, unknown> | undefined
): UsageOverviewSummary | undefined => {
  if (!summary) return undefined;
  return {
    request_count: Number(summary['RequestCount'] ?? summary['request_count'] ?? 0),
    token_count: Number(summary['TokenCount'] ?? summary['token_count'] ?? 0),
    window_minutes: Number(summary['WindowMinutes'] ?? summary['window_minutes'] ?? 0),
    rpm: Number(summary['RPM'] ?? summary['rpm'] ?? 0),
    tpm: Number(summary['TPM'] ?? summary['tpm'] ?? 0),
    total_cost: Number(summary['TotalCost'] ?? summary['total_cost'] ?? 0),
    cost_available: Boolean(summary['CostAvailable'] ?? summary['cost_available'] ?? false),
    cached_tokens: Number(summary['CachedTokens'] ?? summary['cached_tokens'] ?? 0),
    reasoning_tokens: Number(summary['ReasoningTokens'] ?? summary['reasoning_tokens'] ?? 0),
  };
};

const applyModelPricesToSeries = (
  series: UsageOverviewSeries | undefined,
  modelPrices: Record<string, ModelPrice>
): UsageOverviewSeries | undefined => {
  if (!series || !series.models || Object.keys(modelPrices).length === 0) return series;
  const cost: Record<string, number> = {};
  const models = Object.fromEntries(
    Object.entries(series.models).map(([model, modelSeries]) => {
      const price = modelPrices[model];
      const modelCost: Record<string, number> = {};
      const labels = new Set([
        ...Object.keys(modelSeries.input_tokens ?? {}),
        ...Object.keys(modelSeries.output_tokens ?? {}),
        ...Object.keys(modelSeries.cached_tokens ?? {}),
      ]);
      labels.forEach((label) => {
        const inputTokens = Math.max(Number(modelSeries.input_tokens?.[label] ?? 0), 0);
        const outputTokens = Math.max(Number(modelSeries.output_tokens?.[label] ?? 0), 0);
        const cachedTokens = Math.max(Number(modelSeries.cached_tokens?.[label] ?? 0), 0);
        const value = price
          ? (Math.max(inputTokens - cachedTokens, 0) / 1_000_000) * price.prompt +
            (outputTokens / 1_000_000) * price.completion +
            (cachedTokens / 1_000_000) * price.cache
          : 0;
        modelCost[label] = value;
        cost[label] = (cost[label] ?? 0) + value;
      });
      return [model, { ...modelSeries, cost: modelCost }];
    })
  );
  return { ...series, cost, models };
};

const hasCompleteSeriesPricing = (
  series: UsageOverviewSeries | undefined,
  modelPrices: Record<string, ModelPrice>
): boolean => {
  const models = series?.models ?? {};
  let hasChargeableUsage = false;
  for (const [model, modelSeries] of Object.entries(models)) {
    const tokenCount = [
      ...Object.values(modelSeries.input_tokens ?? {}),
      ...Object.values(modelSeries.output_tokens ?? {}),
      ...Object.values(modelSeries.cached_tokens ?? {}),
    ].reduce((sum, value) => sum + Math.max(Number(value) || 0, 0), 0);
    if (tokenCount <= 0) continue;
    hasChargeableUsage = true;
    if (!modelPrices[model]) return false;
  }
  return hasChargeableUsage;
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
  const customRangeReady =
    resolvedRange !== 'custom' || (requestStart !== undefined && requestEnd !== undefined);

  const loadUsage = useCallback(async () => {
    if (!customRangeReady) return;
    try {
      await loadUsageStats({
        force: true,
        staleTimeMs: USAGE_STATS_STALE_TIME_MS,
        range: resolvedRange,
        start: requestStart,
        end: requestEnd,
        includeDetails: false,
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
        includeDetails: false,
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
  }, [
    customRangeReady,
    enabled,
    loadUsageStats,
    onAuthRequired,
    requestEnd,
    requestStart,
    resolvedRange,
  ]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportUsage(resolvedRange, requestStart, requestEnd);
      const exportedAt =
        typeof data?.exported_at === 'string' ? new Date(data.exported_at) : new Date();
      const safeTimestamp = Number.isNaN(exportedAt.getTime())
        ? new Date().toISOString()
        : exportedAt.toISOString();
      const filename = `usage-export-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
      downloadBlob({
        filename,
        blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' }),
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
          failed: result?.failed_requests ?? 0,
        }),
        'success'
      );
      try {
        await loadUsageStats({
          force: true,
          staleTimeMs: USAGE_STATS_STALE_TIME_MS,
          range: resolvedRange,
          start: requestStart,
          end: requestEnd,
          includeDetails: false,
        });
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

  const handleSetModelPrice = useCallback(
    async (model: string, price: ModelPrice) => {
      const previousPrices = modelPrices;
      setModelPricesState({ ...previousPrices, [model]: price });

      try {
        await usageApi.updatePricing(model, {
          prompt_price_per_1m: price.prompt,
          completion_price_per_1m: price.completion,
          cache_price_per_1m: price.cache,
        });
      } catch (error) {
        setModelPricesState(previousPrices);
        if (error instanceof ApiError && error.status === 401) {
          onAuthRequired?.();
          return;
        }
        const message = error instanceof Error ? error.message : '';
        showNotification(
          `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    },
    [modelPrices, onAuthRequired, showNotification, t]
  );

  const handleDeleteModelPrice = useCallback(
    async (model: string) => {
      const previousPrices = modelPrices;
      const nextPrices = { ...previousPrices };
      delete nextPrices[model];
      setModelPricesState(nextPrices);

      try {
        await usageApi.deletePricing(model);
      } catch (error) {
        setModelPricesState(previousPrices);
        if (error instanceof ApiError && error.status === 401) {
          onAuthRequired?.();
          return;
        }
        const message = error instanceof Error ? error.message : '';
        showNotification(
          `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      }
    },
    [modelPrices, onAuthRequired, showNotification, t]
  );

  const usage = useMemo(() => {
    if (!usageSnapshot) return null;
    const snapshot = usageSnapshot as unknown as Record<string, unknown>;
    const rawSeries = usageSnapshot.series ?? snapshot['Series'];
    const rawHourlySeries = usageSnapshot.hourly_series ?? snapshot['HourlySeries'];
    const rawDailySeries = usageSnapshot.daily_series ?? snapshot['DailySeries'];
    const rawHealth =
      usageSnapshot.service_health ?? snapshot['ServiceHealth'] ?? snapshot['Health'];
    const series = applyModelPricesToSeries(
      normalizeSeriesKeys(rawSeries as Record<string, unknown>),
      modelPrices
    );
    const hourlySeries = applyModelPricesToSeries(
      normalizeSeriesKeys(rawHourlySeries as Record<string, unknown>),
      modelPrices
    );
    const dailySeries = applyModelPricesToSeries(
      normalizeSeriesKeys(rawDailySeries as Record<string, unknown>),
      modelPrices
    );
    const summary = normalizeSummary(
      (usageSnapshot.summary ?? snapshot['Summary']) as Record<string, unknown> | undefined
    );
    const hasCompletePricing = hasCompleteSeriesPricing(series, modelPrices);
    const totalCost = Object.values(series?.cost ?? {}).reduce((sum, value) => sum + value, 0);

    return {
      ...usageSnapshot,
      usage: usageSnapshot.usage ?? snapshot['Usage'] ?? null,
      summary: summary
        ? {
            ...summary,
            total_cost: hasCompletePricing ? totalCost : 0,
            cost_available: hasCompletePricing,
          }
        : undefined,
      series,
      hourly_series: hourlySeries,
      daily_series: dailySeries,
      service_health: rawHealth
        ? {
            ...(rawHealth as Record<string, unknown>),
            total_success:
              (rawHealth as Record<string, unknown>)['TotalSuccess'] ??
              (rawHealth as Record<string, unknown>)['total_success'],
            total_failure:
              (rawHealth as Record<string, unknown>)['TotalFailure'] ??
              (rawHealth as Record<string, unknown>)['total_failure'],
            success_rate:
              (rawHealth as Record<string, unknown>)['SuccessRate'] ??
              (rawHealth as Record<string, unknown>)['success_rate'],
            block_details: normalizeHealthBlocks(
              ((rawHealth as Record<string, unknown>)['BlockDetails'] as unknown[]) ??
                ((rawHealth as Record<string, unknown>)['block_details'] as unknown[])
            ),
          }
        : undefined,
    } as UsageOverviewPayload;
  }, [modelPrices, usageSnapshot]);
  const error = storeError || '';
  const lastRefreshedAt = lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null;

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrice: handleSetModelPrice,
    deleteModelPrice: handleDeleteModelPrice,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing,
  };
}
