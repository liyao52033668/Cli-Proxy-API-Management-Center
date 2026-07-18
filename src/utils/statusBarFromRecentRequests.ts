/**
 * Convert auth-file recent_requests buckets into status-bar data.
 * Backend returns 20 wall-clock 10-minute buckets (oldest → newest).
 */

export type StatusBlockState = 'success' | 'failure' | 'mixed' | 'idle';

export interface StatusBlockDetail {
  success: number;
  failure: number;
  /** 0–1, or -1 when no requests */
  rate: number;
  startTime: number;
  endTime: number;
}

export interface StatusBarData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
}

export interface RecentRequestBucket {
  time?: string;
  success: number;
  failed: number;
}

const BLOCK_COUNT = 20;
const BLOCK_DURATION_MS = 10 * 60 * 1000;

const toNonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
};

/**
 * Normalize one API bucket. Accepts success/failed and Success/Failed/failure aliases.
 */
export function normalizeRecentRequestBucket(raw: unknown): RecentRequestBucket | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const success = toNonNegativeInt(item.success ?? item.Success);
  const failed = toNonNegativeInt(item.failed ?? item.Failed ?? item.failure ?? item.Failure);
  const time = typeof item.time === 'string' ? item.time : typeof item.Time === 'string' ? item.Time : undefined;
  return { time, success, failed };
}

/**
 * Read recent_requests / recentRequests from an auth file item.
 */
export function extractRecentRequestBuckets(file: unknown): RecentRequestBucket[] {
  if (!file || typeof file !== 'object') return [];
  const record = file as Record<string, unknown>;
  const raw = record.recent_requests ?? record.recentRequests;
  if (!Array.isArray(raw)) return [];

  const out: RecentRequestBucket[] = [];
  for (const item of raw) {
    const normalized = normalizeRecentRequestBucket(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * Whether recent_requests has any non-zero traffic (used to prefer API buckets over usage events).
 */
export function hasRecentRequestTraffic(buckets: RecentRequestBucket[]): boolean {
  return buckets.some((b) => b.success > 0 || b.failed > 0);
}

/**
 * Map backend recent_requests buckets (oldest → newest, typically 20) into StatusBarData.
 * Times are aligned to the current wall-clock 10-minute bucket, matching backend.
 */
export function calculateStatusBarDataFromRecentRequests(
  buckets: RecentRequestBucket[],
  nowMs: number = Date.now()
): StatusBarData {
  const safeNow = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  // Align to wall-clock 10-minute bucket start (same as backend Unix/600).
  const currentBucketStart = Math.floor(safeNow / BLOCK_DURATION_MS) * BLOCK_DURATION_MS;
  const windowStart = currentBucketStart - (BLOCK_COUNT - 1) * BLOCK_DURATION_MS;

  // Right-align shorter arrays so the newest bucket is at the end.
  const aligned: RecentRequestBucket[] = Array.from({ length: BLOCK_COUNT }, () => ({
    success: 0,
    failed: 0,
  }));
  if (buckets.length > 0) {
    const srcStart = Math.max(0, buckets.length - BLOCK_COUNT);
    const dstStart = Math.max(0, BLOCK_COUNT - buckets.length);
    const copyCount = Math.min(BLOCK_COUNT, buckets.length);
    for (let i = 0; i < copyCount; i++) {
      const src = buckets[srcStart + i] as unknown;
      const normalized = normalizeRecentRequestBucket(src) ?? { success: 0, failed: 0 };
      aligned[dstStart + i] = normalized;
    }
  }

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const success = aligned[i].success;
    const failure = aligned[i].failed;
    const total = success + failure;
    totalSuccess += success;
    totalFailure += failure;

    if (total === 0) {
      blocks.push('idle');
    } else if (failure === 0) {
      blocks.push('success');
    } else if (success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const startTime = windowStart + i * BLOCK_DURATION_MS;
    blockDetails.push({
      success,
      failure,
      rate: total > 0 ? success / total : -1,
      startTime,
      endTime: startTime + BLOCK_DURATION_MS,
    });
  }

  const total = totalSuccess + totalFailure;
  return {
    blocks,
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
}
