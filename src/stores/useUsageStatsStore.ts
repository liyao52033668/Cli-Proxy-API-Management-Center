import i18n from '@/i18n';
import { usageApi, type UsageOverviewResponse } from '@/services/api/usage';
import {
  collectUsageDetails,
  collectUsageDetailsFromEvents,
  computeKeyStatsFromDetails,
  parseKeyStatsFromOverview,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import { create } from 'zustand';

export const USAGE_STATS_STALE_TIME_MS = 60_000;
const USAGE_EVENTS_PAGE_SIZE = 20;

export type UsageTimeRange =
  | 'all'
  | '4h'
  | '8h'
  | '12h'
  | '24h'
  | 'today'
  | '7d'
  | '30d'
  | 'custom';

export interface LoadUsageStatsOptions {
  force?: boolean;
  staleTimeMs?: number;
  range?: UsageTimeRange;
  start?: string;
  end?: string;
  includeDetails?: boolean;
}

interface UsageStatsState {
  usage: UsageOverviewResponse | null;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  error: string | null;
  lastRefreshedAt: number | null;
  lastQueryKey: string | null;
  scopeKey: string;
  loadUsageStats: (options?: LoadUsageStatsOptions) => Promise<void>;
  clearUsageStats: () => void;
}

const createEmptyKeyStats = (): KeyStats => ({ bySource: {}, byAuthIndex: {} });

let activeRequest: Promise<void> | null = null;
let activeRequestKey: string | null = null;
let activeRequestController: AbortController | null = null;

const buildQueryKey = (
  range: UsageTimeRange,
  start?: string,
  end?: string,
  includeDetails = true
): string => `${range}:${start ?? ''}:${end ?? ''}:${includeDetails ? 'details' : 'overview'}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : i18n.t('usage_stats.loading_error');

export const useUsageStatsStore = create<UsageStatsState>((set, get) => ({
  usage: null,
  keyStats: createEmptyKeyStats(),
  usageDetails: [],
  loading: false,
  error: null,
  lastRefreshedAt: null,
  lastQueryKey: null,
  scopeKey: '',

  loadUsageStats: async (options = {}) => {
    const {
      force = false,
      staleTimeMs = USAGE_STATS_STALE_TIME_MS,
      range = 'all',
      start,
      end,
      includeDetails = true,
    } = options;

    const { lastRefreshedAt, loading, usage, lastQueryKey } = get();
    const now = Date.now();
    const queryKey = buildQueryKey(range, start, end, includeDetails);

    if (
      !force &&
      usage &&
      lastRefreshedAt &&
      lastQueryKey === queryKey &&
      now - lastRefreshedAt < staleTimeMs
    ) {
      return;
    }

    if (loading && activeRequest) {
      if (activeRequestKey === queryKey) {
        return activeRequest;
      }
      activeRequestController?.abort();
    }

    const controller = new AbortController();
    activeRequestController = controller;
    activeRequestKey = queryKey;
    set({ loading: true, error: null });

    activeRequest = (async () => {
      try {
        const memoryResponse = await usageApi.getUsage(range, start, end);
        const response: UsageOverviewResponse = {
          usage: memoryResponse.usage,
          summary: memoryResponse.summary,
          series: memoryResponse.series,
          hourly_series: memoryResponse.hourly_series,
          daily_series: memoryResponse.daily_series,
          key_stats: memoryResponse.key_stats,
          service_health: memoryResponse.service_health,
          range_start: memoryResponse.range_start,
          range_end: memoryResponse.range_end,
        };
        if (activeRequestController !== controller) {
          return;
        }

        const rawUsage =
          response?.usage ?? (response as unknown as Record<string, unknown>)['Usage'] ?? response;
        let usageDetails: UsageDetail[] = collectUsageDetails(rawUsage);

        if (includeDetails) {
          try {
            const eventsResponse = await usageApi.getUsageEvents(range, start, end, {
              page: 1,
              pageSize: USAGE_EVENTS_PAGE_SIZE,
            });
            if (activeRequestController !== controller) {
              return;
            }
            usageDetails = collectUsageDetailsFromEvents(eventsResponse);
          } catch {
            // Keep overview details when the optional event request fails.
          }
        }

        const keyStats =
          parseKeyStatsFromOverview(response) ?? computeKeyStatsFromDetails(usageDetails);

        set({
          usage: response,
          keyStats,
          usageDetails,
          loading: false,
          error: null,
          lastRefreshedAt: Date.now(),
          lastQueryKey: queryKey,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }
        const message = getErrorMessage(error);
        if (activeRequestController === controller) {
          set({
            loading: false,
            error: message,
          });
        }
        const nextError = new Error(message);
        (nextError as Error & { cause: unknown }).cause = error;
        throw nextError;
      } finally {
        if (activeRequestController === controller) {
          activeRequest = null;
          activeRequestKey = null;
          activeRequestController = null;
        }
      }
    })();

    return activeRequest;
  },

  clearUsageStats: () => {
    activeRequestController?.abort();
    activeRequest = null;
    activeRequestKey = null;
    activeRequestController = null;
    set({
      usage: null,
      keyStats: createEmptyKeyStats(),
      usageDetails: [],
      loading: false,
      error: null,
      lastRefreshedAt: null,
      lastQueryKey: null,
      scopeKey: '',
    });
  },
}));
