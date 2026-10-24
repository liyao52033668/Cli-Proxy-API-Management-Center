/**
 * Antigravity 重置倒计时：文案调度与时长格式化（纯函数）。
 *
 * 额度重置时间来自服务器响应，倒计时基于「Date.now + 服务器时钟偏移」计算，
 * 文案以向上取整的分钟展示，因此在最近的分钟边界唤醒刷新即可。
 */

import type { TFunction } from 'i18next';

const MINUTE_MS = 60_000;

/**
 * 返回下一个可见倒计时文案发生变化的等待时间。
 *
 * 文案以向上取整的分钟展示，所以按最近的分钟边界唤醒即可；已经到期或
 * 无效的时间不再创建定时器。
 */
export function getNextAntigravityCountdownUpdateDelay(
  resetTimestamps: readonly number[],
  nowMs: number
): number | null {
  let nextDelay: number | null = null;

  resetTimestamps.forEach((resetMs) => {
    if (!Number.isFinite(resetMs)) return;
    const deltaMs = resetMs - nowMs;
    if (deltaMs <= 0) return;

    const remainder = deltaMs % MINUTE_MS;
    const delay = Math.max(1, Math.ceil(remainder === 0 ? MINUTE_MS : remainder));
    nextDelay = nextDelay === null ? delay : Math.min(nextDelay, delay);
  });

  return nextDelay;
}

const formatAntigravityDuration = (t: TFunction, deltaMs: number): string => {
  const totalMinutes = Math.max(1, Math.ceil(deltaMs / MINUTE_MS));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return t('antigravity_quota.duration_day_hour', { days, hours });
  }
  if (hours > 0) {
    return t('antigravity_quota.duration_hour_minute', { hours, minutes });
  }
  if (minutes > 0) {
    return t('antigravity_quota.duration_minute', { minutes });
  }
  return t('antigravity_quota.duration_less_than_minute');
};

export const formatAntigravityResetLabel = (
  resetTime: string | undefined,
  t: TFunction,
  nowMs: number
): string => {
  if (!resetTime) return '-';
  const resetMs = new Date(resetTime).getTime();
  if (Number.isNaN(resetMs)) return '-';
  const deltaMs = resetMs - nowMs;
  if (deltaMs <= 0) return t('antigravity_quota.refresh_available');
  return t('antigravity_quota.refreshes_in', {
    duration: formatAntigravityDuration(t, deltaMs),
  });
};

/** 从 apiCall 响应头解析服务器时钟偏移（Date 头与本地时间之差）。 */
export const resolveResponseServerTimeOffsetMs = (
  header: Record<string, string[]> | undefined
): number | null => {
  if (!header) return null;
  const dateEntry = Object.entries(header).find(([key]) => key.toLowerCase() === 'date');
  const rawDate = dateEntry?.[1]?.[0];
  if (!rawDate) return null;
  const serverTime = new Date(rawDate).getTime();
  if (Number.isNaN(serverTime)) return null;
  return serverTime - Date.now();
};
