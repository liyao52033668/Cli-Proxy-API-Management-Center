/**
 * 使用统计相关 API
 * 适配 cpa-usage-keeper 的新 API 端点
 */

import { apiClient } from './client';

const USAGE_TIMEOUT_MS = 60 * 1000;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface UsageTokenStats {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface UsageDetail {
  timestamp: string;
  latency_ms: number;
  source: string;
  source_raw?: string;
  source_display?: string;
  source_type?: string;
  auth_index: string;
  failed: boolean;
  tokens: UsageTokenStats;
}

export interface UsageModelSnapshot {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  details?: UsageDetail[];
}

export interface UsageApiSnapshot {
  display_name?: string;
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  models: Record<string, UsageModelSnapshot>;
}

export interface UsageSnapshot {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  requests_by_day: Record<string, number>;
  requests_by_hour: Record<string, number>;
  tokens_by_day: Record<string, number>;
  tokens_by_hour: Record<string, number>;
  apis: Record<string, UsageApiSnapshot>;
}

export interface UsageOverviewSummary {
  request_count: number;
  token_count: number;
  window_minutes: number;
  rpm: number;
  tpm: number;
  total_cost: number;
  cost_available: boolean;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface UsageOverviewSeries {
  requests: Record<string, number>;
  tokens: Record<string, number>;
  rpm: Record<string, number>;
  tpm: Record<string, number>;
  cost: Record<string, number>;
  input_tokens: Record<string, number>;
  output_tokens: Record<string, number>;
  cached_tokens: Record<string, number>;
  reasoning_tokens: Record<string, number>;
  models?: Record<string, UsageOverviewSeries>;
}

export interface UsageOverviewServiceHealthBlock {
  start_time: string;
  end_time: string;
  success: number;
  failure: number;
  rate: number;
}

export interface UsageOverviewServiceHealth {
  total_success: number;
  total_failure: number;
  success_rate: number;
  rows?: number;
  columns?: number;
  bucket_seconds?: number;
  window_start?: string;
  window_end?: string;
  block_details: UsageOverviewServiceHealthBlock[];
}

export interface UsageOverviewResponse {
  usage: UsageSnapshot;
  summary?: UsageOverviewSummary;
  series?: UsageOverviewSeries;
  hourly_series?: UsageOverviewSeries;
  daily_series?: UsageOverviewSeries;
  service_health?: UsageOverviewServiceHealth;
  timezone?: string;
  range_start?: string;
  range_end?: string;
}

export interface UsageEventTokens {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface UsageEvent {
  id?: number;
  timestamp: string;
  model: string;
  source: string;
  source_raw?: string;
  source_type?: string;
  auth_index?: string;
  isDelete?: boolean;
  failed: boolean;
  latency_ms: number;
  tokens: UsageEventTokens;
}

export interface UsageSourceFilterOption {
  value: string;
  label: string;
  displayName?: string;
}

export interface UsageEventsResponse {
  events: UsageEvent[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UsageEventModelFilterOptionsResponse {
  models: string[];
}

export interface UsageEventSourceFilterOptionsResponse {
  sources: UsageSourceFilterOption[];
}

export type UsageIdentityAuthType = 1 | 2;

export interface UsageIdentity {
  id: number;
  name: string;
  displayName?: string;
  auth_type: UsageIdentityAuthType;
  auth_type_name: string;
  identity: string;
  type: string;
  provider: string;
  plan_type?: string;
  active_start?: string;
  active_until?: string;
  total_requests: number;
  success_count: number;
  failure_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  last_aggregated_usage_event_id: number;
  first_used_at?: string;
  last_used_at?: string;
  stats_updated_at?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface UsageIdentitiesResponse {
  identities: UsageIdentity[];
}

export interface UsageIdentitiesPageResponse {
  identities: UsageIdentity[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UsageQuotaWindow {
  duration?: number;
  unit?: string;
  seconds?: number;
}

export interface UsageQuotaRow {
  key: string;
  label?: string;
  scope?: string;
  metric?: string;
  planType?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  usedPercent?: number;
  remainingFraction?: number;
  allowed?: boolean;
  limitReached?: boolean;
  window?: UsageQuotaWindow;
  resetAt?: string;
  resetAfterSeconds?: number;
}

export interface UsageQuotaCheckResponse {
  id: string;
  quota: UsageQuotaRow[];
}

export interface UsageQuotaCacheResponse {
  items: UsageQuotaCheckResponse[];
}

export interface UsageQuotaRefreshTaskResponse {
  taskId: string;
  authIndex: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  quota?: UsageQuotaCheckResponse;
  error?: string;
  cachedAt?: string;
  expiresAt?: string;
}

export interface UsageQuotaRefreshTaskID {
  authIndex: string;
  taskId: string;
}

export interface UsageQuotaRefreshRejectedAuthIndex {
  authIndex: string;
  error: 'not_found' | 'not_auth_file' | 'unsupported' | 'duplicate' | 'invalid';
}

export interface UsageQuotaRefreshResponse {
  tasks: UsageQuotaRefreshTaskID[];
  rejected: UsageQuotaRefreshRejectedAuthIndex[];
  accepted: number;
  skipped: number;
  limit: number;
}

export interface UsageAnalysisModel {
  model: string;
  total_requests: number;
  success_count: number;
  failure_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  total_latency_ms: number;
  latency_sample_count: number;
}

export interface UsageAnalysisApi {
  api_key: string;
  display_name: string;
  total_requests: number;
  success_count: number;
  failure_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  models: UsageAnalysisModel[];
}

export interface UsageAnalysisResponse {
  apis: UsageAnalysisApi[];
  models: UsageAnalysisModel[];
}

export interface PricingEntry {
  model: string;
  prompt_price_per_1m: number;
  completion_price_per_1m: number;
  cache_price_per_1m: number;
}

export interface UsedModelsResponse {
  models: string[];
}

export interface PricingResponse {
  pricing: PricingEntry[];
}

export interface StatusResponse {
  running: boolean;
  sync_running: boolean;
  timezone: string;
  version?: string;
  updateCheckEnabled?: boolean;
  last_run_at?: string;
  last_error?: string;
  last_warning?: string;
  last_status?: string;
}

export interface UpdateCheckResponse {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  canCompare: boolean;
  message: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
}

export type UsageTimeRange = 'all' | '4h' | '8h' | '12h' | '24h' | 'today' | '7d' | '30d' | 'custom';

export interface FetchUsageEventsOptions {
  page?: number;
  pageSize?: number;
  model?: string;
  source?: string;
  result?: string;
}

export interface FetchUsageIdentitiesPageOptions {
  authType?: UsageIdentityAuthType;
  page?: number;
  pageSize?: number;
}

export const usageApi = {
  /**
   * 获取使用统计原始数据（兼容旧接口）
   */
  getUsage: () => apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导出数据库驱动的使用统计快照
   */
  exportUsage: () => apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入数据库驱动的使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取使用概览（keeper API）
   */
  getUsageOverview: (range: UsageTimeRange, start?: string, end?: string) => {
    const params = new URLSearchParams();
    params.set('range', range);
    if (start) params.set('start_time', start);
    if (end) params.set('end_time', end);
    const query = params.toString();
    return apiClient.get<UsageOverviewResponse>(
      `/usage/db/overview${query ? `?${query}` : ''}`,
      { timeout: USAGE_TIMEOUT_MS }
    );
  },

  /**
   * 获取使用分析（keeper API）
   */
  getUsageAnalysis: (range: UsageTimeRange, start?: string, end?: string) => {
    const params = new URLSearchParams();
    params.set('range', range);
    if (start) params.set('start_time', start);
    if (end) params.set('end_time', end);
    const query = params.toString();
    return apiClient.get<UsageAnalysisResponse>(
      `/usage/db/analysis${query ? `?${query}` : ''}`,
      { timeout: USAGE_TIMEOUT_MS }
    );
  },

  /**
   * 获取使用事件列表（keeper API）
   */
  getUsageEvents: (range: UsageTimeRange, start?: string, end?: string, options?: FetchUsageEventsOptions) => {
    const params = new URLSearchParams();
    params.set('range', range);
    if (start) params.set('start_time', start);
    if (end) params.set('end_time', end);
    if (options?.page && options.page > 0) params.set('page', String(Math.floor(options.page)));
    if (options?.pageSize && options.pageSize > 0) params.set('page_size', String(Math.floor(options.pageSize)));
    if (options?.model?.trim()) params.set('model', options.model.trim());
    if (options?.source?.trim()) params.set('source', options.source.trim());
    if (options?.result?.trim()) params.set('result', options.result.trim());
    const query = params.toString();
    return apiClient.get<UsageEventsResponse>(
      `/usage/db/events${query ? `?${query}` : ''}`,
      { timeout: USAGE_TIMEOUT_MS }
    );
  },

  /**
   * 获取模型过滤选项（keeper API）
   */
  getUsageEventModelFilters: () =>
    apiClient.get<UsageEventModelFilterOptionsResponse>('/usage/db/filter-options', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  /**
   * 获取来源过滤选项（keeper API）
   */
  getUsageEventSourceFilters: () =>
    apiClient.get<UsageEventSourceFilterOptionsResponse>('/usage/db/filter-options', {
      timeout: USAGE_TIMEOUT_MS,
    }),

  /**
   * 获取身份列表（keeper API）
   */
  getUsageIdentities: () =>
    apiClient.get<UsageIdentitiesResponse>('/usage/db', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取身份分页列表（keeper API）
   */
  getUsageIdentitiesPage: (options?: FetchUsageIdentitiesPageOptions) => {
    const params = new URLSearchParams();
    if (options?.authType) params.set('auth_type', String(options.authType));
    if (options?.page && options.page > 0) params.set('page', String(Math.floor(options.page)));
    if (options?.pageSize && options.pageSize > 0) params.set('page_size', String(Math.floor(options.pageSize)));
    const query = params.toString();
    return apiClient.get<UsageIdentitiesPageResponse>(
      `/usage/db${query ? `?${query}` : ''}`,
      { timeout: USAGE_TIMEOUT_MS }
    );
  },

  /**
   * 检查配额（keeper API）
   */
  checkUsageQuota: (authIndex: string) =>
    apiClient.post<UsageQuotaCheckResponse>(
      '/api/v1/quota/check',
      { auth_index: authIndex },
      { timeout: USAGE_TIMEOUT_MS }
    ),

  /**
   * 获取配额缓存（keeper API）
   */
  getUsageQuotaCache: (authIndexes: string[]) =>
    apiClient.post<UsageQuotaCacheResponse>(
      '/api/v1/quota/cache',
      { auth_indexes: authIndexes },
      { timeout: USAGE_TIMEOUT_MS }
    ),

  /**
   * 刷新配额（keeper API）
   */
  refreshUsageQuotas: (authIndexes: string[]) =>
    apiClient.post<UsageQuotaRefreshResponse>(
      '/api/v1/quota/refresh',
      { auth_indexes: authIndexes, limit: 20 },
      { timeout: USAGE_TIMEOUT_MS }
    ),

  /**
   * 获取配额刷新任务（keeper API）
   */
  getUsageQuotaRefreshTask: (taskId: string) =>
    apiClient.get<UsageQuotaRefreshTaskResponse>(`/api/v1/quota/refresh/${encodeURIComponent(taskId)}`, {
      timeout: USAGE_TIMEOUT_MS,
    }),

  /**
   * 获取使用的模型列表（keeper API）
   */
  getUsedModels: () => apiClient.get<UsedModelsResponse>('/api/v1/models/used', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取定价信息（keeper API）
   */
  getPricing: () => apiClient.get<PricingResponse>('/api/v1/pricing', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 更新定价（keeper API）
   */
  updatePricing: (model: string, pricing: Omit<PricingEntry, 'model'>) =>
    apiClient.put<PricingEntry>('/api/v1/pricing', { model, ...pricing }, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 删除定价（keeper API）
   */
  deletePricing: (model: string) => {
    const params = new URLSearchParams({ model });
    return apiClient.delete<void>(`/api/v1/pricing?${params.toString()}`, { timeout: USAGE_TIMEOUT_MS });
  },

  /**
   * 获取状态（keeper API）
   */
  getStatus: () => apiClient.get<StatusResponse>('/api/v1/status', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 触发同步（keeper API）
   */
  triggerSync: () => apiClient.post<StatusResponse>('/api/v1/sync', {}, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 检查更新（keeper API）
   */
  checkForUpdates: () => apiClient.get<UpdateCheckResponse>('/api/v1/update/check', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取会话（keeper API）
   */
  getSession: () => apiClient.get<AuthSessionResponse>('/api/v1/auth/session', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 登录（keeper API）
   */
  login: (password: string) =>
    apiClient.post<void>('/api/v1/auth/login', { password }, { timeout: USAGE_TIMEOUT_MS }),
};