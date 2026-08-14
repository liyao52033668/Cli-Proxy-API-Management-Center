import type { ApiCallResult } from '@/services/api';

export interface QuotaBalanceInfo {
  currency: string;
  total: string;
  granted: string;
  toppedUp: string;
}

export type QuotaBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; balances: QuotaBalanceInfo[] }
  | { status: 'error' };

/** 额度端点解析：仅当显式填写了 quotaEndpoint 时才进行额度查询，留空返回 null。 */
export const resolveQuotaEndpoint = (quotaEndpoint?: string): string | null => {
  const custom = String(quotaEndpoint ?? '').trim();
  return custom || null;
};

const asString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

/** 解析常见额度响应：优先 balance_infos 数组格式，其次简化 { balance, currency } 格式。 */
export const parseQuotaBalance = (body: unknown): QuotaBalanceInfo[] => {
  const record = asObject(body);
  if (!record) return [];

  const data = asObject(record.data);
  const infos = Array.isArray(record.balance_infos)
    ? record.balance_infos
    : data && Array.isArray(data.balance_infos)
      ? data.balance_infos
      : null;

  if (infos) {
    return infos
      .filter((info): info is Record<string, unknown> => Boolean(info) && typeof info === 'object')
      .map((info) => ({
        currency: asString(info.currency),
        total: asString(info.total_balance),
        granted: asString(info.granted_balance),
        toppedUp: asString(info.topped_up_balance),
      }))
      .filter((info) => Boolean(info.currency) || Boolean(info.total));
  }

  // 简化格式：{ balance, currency } 或 { data: { balance, currency } }
  const holder = data ?? record;
  const balanceValue = holder.balance ?? holder.total_balance ?? holder.amount;
  if (balanceValue === undefined) return [];
  return [
    {
      currency: asString(holder.currency),
      total: asString(balanceValue),
      granted: asString(holder.granted_balance ?? holder.granted ?? ''),
      toppedUp: asString(holder.topped_up_balance ?? holder.topped_up ?? ''),
    },
  ];
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export const formatQuotaBalance = (info: QuotaBalanceInfo): string => {
  const symbol = CURRENCY_SYMBOLS[info.currency.toUpperCase()] ?? '';
  if (symbol) {
    return `${symbol}${info.total}`;
  }
  return info.currency ? `${info.total} ${info.currency}` : info.total;
};

type BalanceRequester = (payload: {
  method: string;
  url: string;
  header?: Record<string, string>;
}) => Promise<ApiCallResult>;

/**
 * 使用一组 API Key 依次请求额度端点，返回第一个成功的结果。
 * 通用逻辑：只需填写额度端点即可自动根据 apiKey 查询额度。
 */
export const fetchQuotaBalance = async (
  apiKeys: string[],
  endpoint: string,
  request: BalanceRequester,
  extraHeaders?: Record<string, string>
): Promise<QuotaBalanceState> => {
  for (const apiKey of apiKeys) {
    const key = apiKey.trim();
    if (!key) continue;
    try {
      const result = await request({
        method: 'GET',
        url: endpoint,
        header: {
          Authorization: `Bearer ${key}`,
          ...extraHeaders,
        },
      });
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const balances = parseQuotaBalance(result.body ?? result.bodyText);
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
