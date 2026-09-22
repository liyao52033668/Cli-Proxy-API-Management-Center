/**
 * Helpers for recognizing paid xAI OAuth credentials and representing API health.
 */

import type { AuthFileItem, XaiBillingSummary } from '@/types';

const XAI_PAID_PREFIX = 'paid';
const NESTED_AUTH_KEYS = ['metadata', 'attributes', 'oauth', 'raw', 'credential', 'auth'];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const collectAuthRecords = (value: unknown): Record<string, unknown>[] => {
  const records: Record<string, unknown>[] = [];
  const visited = new Set<Record<string, unknown>>();

  const visit = (candidate: unknown, depth: number) => {
    const record = asRecord(candidate);
    if (!record || visited.has(record) || depth > 2) return;
    visited.add(record);
    records.push(record);
    NESTED_AUTH_KEYS.forEach((key) => visit(record[key], depth + 1));
  };

  visit(value, 0);
  return records;
};

const readStrings = (records: Record<string, unknown>[], keys: string[]): string[] => {
  const values: string[] = [];
  records.forEach((record) => {
    keys.forEach((key) => {
      const value = asString(record[key]);
      if (value) values.push(value);
    });
  });
  return values;
};

const isTruthyValue = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;

  try {
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return asRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
};

const resolveJwtTier = (token: string): number | null => {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  // 更宽松的 tier 字段匹配：支持 tier、/tier、:tier、x-tier、subscription_tier 等
  const tierEntry = Object.entries(payload).find(([key]) => {
    const normalized = key.toLowerCase();
    return (
      normalized === 'tier' ||
      normalized.endsWith('/tier') ||
      normalized.endsWith(':tier') ||
      normalized.endsWith('-tier') ||
      normalized.endsWith('_tier') ||
      normalized.includes('tier')
    );
  });

  if (!tierEntry) return null;

  const rawValue = tierEntry[1];
  // 支持数字和字符串类型
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : null;
  }
  if (typeof rawValue === 'string') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const isPaidXaiAuthFile = (file: AuthFileItem | Record<string, unknown>): boolean => {
  const records = collectAuthRecords(file);

  // 1. 检查 using_api + paid prefix 组合
  const usesOfficialApi = records.some((record) =>
    isTruthyValue(record.using_api ?? record.usingApi)
  );
  const prefixes = readStrings(records, ['prefix']);
  const hasPaidPrefix = prefixes.some((prefix) => prefix.toLowerCase() === XAI_PAID_PREFIX);

  if (usesOfficialApi && hasPaidPrefix) return true;

  // 2. 检查 auth file 中是否有直接的 tier 字段（数字或字符串）
  for (const record of records) {
    for (const key of ['tier', 'subscriptionTier', 'accountTier', 'userTier']) {
      const value = record[key];
      if (value === undefined || value === null) continue;

      let tierValue: number | null = null;
      if (typeof value === 'number') {
        tierValue = Number.isFinite(value) ? value : null;
      } else if (typeof value === 'string') {
        const parsed = Number(value.trim());
        tierValue = Number.isFinite(parsed) ? parsed : null;
      }

      if (tierValue !== null && tierValue >= 1) {
        return true;
      }
    }
  }

  // 3. 检查 JWT 中的 tier 字段
  const tokens = readStrings(records, [
    'access_token',
    'accessToken',
    'id_token',
    'idToken',
    'token',
  ]);
  return tokens.some((token) => (resolveJwtTier(token) ?? 0) >= 1);
};

export const buildXaiPaidHealthSummary = (profile: unknown): XaiBillingSummary => {
  const record = asRecord(profile);
  const userId = asString(record?.user_id ?? record?.userId) ?? undefined;
  const teamId = asString(record?.team_id ?? record?.teamId) ?? undefined;

  return {
    mode: 'paid-health',
    source: 'api.x.ai-fallback',
    planType: 'paid',
    healthStatus: 'chat-ok',
    userId,
    teamId,
    periodType: 'unknown',
    usagePercent: null,
    productUsage: [],
    monthlyLimitCents: null,
    usedCents: null,
    includedUsedCents: null,
    onDemandCapCents: null,
    onDemandUsedCents: null,
    onDemandUsedPercent: null,
    usedPercent: null,
  };
};
