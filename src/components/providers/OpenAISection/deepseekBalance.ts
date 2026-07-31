import type { ApiCallResult } from '@/services/api';

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

export interface DeepseekBalanceInfo {
  currency: string;
  total: string;
  granted: string;
  toppedUp: string;
}

export type DeepseekBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; balances: DeepseekBalanceInfo[] }
  | { status: 'error' };

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/v1$/i, '');
};

export const isDeepseekBaseUrl = (baseUrl?: string): boolean => {
  if (!baseUrl) return false;
  return normalizeBaseUrl(baseUrl) === 'https://api.deepseek.com';
};

const asString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

export const parseDeepseekBalance = (body: unknown): DeepseekBalanceInfo[] => {
  if (!body || typeof body !== 'object') return [];
  const record = body as Record<string, unknown>;
  const infos = Array.isArray(record.balance_infos) ? record.balance_infos : [];
  return infos
    .filter((info): info is Record<string, unknown> => Boolean(info) && typeof info === 'object')
    .map((info) => ({
      currency: asString(info.currency),
      total: asString(info.total_balance),
      granted: asString(info.granted_balance),
      toppedUp: asString(info.topped_up_balance),
    }))
    .filter((info) => Boolean(info.currency) || Boolean(info.total));
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export const formatDeepseekBalance = (info: DeepseekBalanceInfo): string => {
  const symbol = CURRENCY_SYMBOLS[info.currency.toUpperCase()] ?? '';
  if (symbol) {
    return `${symbol}${info.total}`;
  }
  return info.currency ? `${info.total} ${info.currency}` : info.total;
};

type DeepseekBalanceRequester = (payload: {
  method: string;
  url: string;
  header?: Record<string, string>;
}) => Promise<ApiCallResult>;

export const fetchDeepseekBalance = async (
  apiKeys: string[],
  request: DeepseekBalanceRequester
): Promise<DeepseekBalanceState> => {
  for (const apiKey of apiKeys) {
    const key = apiKey.trim();
    if (!key) continue;
    try {
      const result = await request({
        method: 'GET',
        url: DEEPSEEK_BALANCE_URL,
        header: { Authorization: `Bearer ${key}` },
      });
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const balances = parseDeepseekBalance(result.body ?? result.bodyText);
        if (balances.length > 0) {
          return { status: 'success', balances };
        }
      }
    } catch {
      // 该 key 不可用，继续尝试下一个
    }
  }
  return { status: 'error' };
};
