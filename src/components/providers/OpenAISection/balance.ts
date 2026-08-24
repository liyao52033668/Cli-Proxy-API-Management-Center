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

/**
 * 额度端点解析：
 * - 留空返回 null，不进行额度查询。
 * - 填写完整地址（http/https 开头）时直接使用。
 * - 只填接口路径时，自动复用 baseUrl 的 host（origin）拼接；
 *   交接处的斜杠会被规范化，避免出现两个 /。
 */
export const resolveQuotaEndpoint = (quotaEndpoint?: string, baseUrl?: string): string | null => {
  const custom = String(quotaEndpoint ?? '').trim();
  if (!custom) return null;

  // 已是完整地址（含协议）直接使用
  if (/^https?:\/\//i.test(custom)) return custom;

  // 只填了接口路径：复用 baseUrl 的 host（origin）
  const base = String(baseUrl ?? '').trim();
  if (!base) return custom;

  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    origin = base;
  }

  const cleanOrigin = origin.replace(/\/+$/, '');
  const path = custom.replace(/^\/+/, '');
  return `${cleanOrigin}/${path}`;
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

/** 解析常见额度响应：优先 balance_infos 数组格式，其次 display.remaining，最后简化格式。 */
export const parseQuotaBalance = (body: unknown): QuotaBalanceInfo[] => {
  let record = asObject(body);
  if (!record && typeof body === 'string') {
    try {
      record = asObject(JSON.parse(body));
    } catch {
      record = null;
    }
  }
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

  // token_usage 格式：{ data: { display: { remaining, total, unit } } }，remaining 即余额
  const displayHolder = asObject(data?.display) ?? asObject(record.display);
  if (displayHolder && displayHolder.remaining !== undefined) {
    return [
      {
        currency: asString(displayHolder.unit ?? displayHolder.currency),
        total: asString(displayHolder.remaining),
        granted: asString(displayHolder.total),
        toppedUp: asString(displayHolder.used),
      },
    ];
  }

  // 简化格式：{ balance, currency } / { quota } / { data: { balance, currency } } 等
  const holder = data ?? record;
  const balanceValue = holder.quota ?? holder.balance ?? holder.total_balance ?? holder.amount;
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

/** 将数值四舍五入并保留两位小数。 */
const roundMoney = (value: string): string => {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return value;
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
};

export const formatQuotaBalance = (info: QuotaBalanceInfo): string => {
  const rounded = roundMoney(info.total);
  const symbol = CURRENCY_SYMBOLS[info.currency.toUpperCase()] ?? '';
  if (symbol) {
    return `${symbol}${rounded}`;
  }
  return info.currency ? `${rounded} ${info.currency}` : rounded;
};

/** 将原始额度值除以换算除数（保留最多 8 位小数并去除尾随 0）。 */
const applyQuotaDivisor = (info: QuotaBalanceInfo, divisor: number): QuotaBalanceInfo => {
  const divide = (value: string): string => {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num) || !Number.isFinite(divisor) || divisor === 0) return value;
    const result = num / divisor;
    return String(Math.round(result * 1e8) / 1e8);
  };
  return {
    currency: info.currency,
    total: divide(info.total),
    granted: divide(info.granted),
    toppedUp: divide(info.toppedUp),
  };
};

export interface QuotaQueryOptions {
  /** 额度查询鉴权 token：填写后仅使用该 token（Bearer）查询；留空则依次尝试 apiKeys。 */
  token?: string;
  /** 额度换算除数：将原始额度值除以该值得到余额（如 NEW API 的 quota 需除以 500000）。 */
  divisor?: number;
  /** 附加请求头。 */
  extraHeaders?: Record<string, string>;
}

type BalanceRequester = (payload: {
  method: string;
  url: string;
  header?: Record<string, string>;
}) => Promise<ApiCallResult>;

/**
 * 请求额度端点，返回第一个成功的结果。
 * 通用逻辑：只需填写额度端点即可自动查询额度。
 * 鉴权：优先使用配置的 token，否则依次使用 apiKeys。
 */
export const fetchQuotaBalance = async (
  apiKeys: string[],
  endpoint: string,
  request: BalanceRequester,
  options?: QuotaQueryOptions
): Promise<QuotaBalanceState> => {
  const { token, divisor, extraHeaders } = options ?? {};
  const authTokens = token?.trim() ? [token.trim()] : apiKeys;

  for (const authToken of authTokens) {
    const key = authToken.trim();
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
        let balances = parseQuotaBalance(result.body ?? result.bodyText);
        if (divisor !== undefined && Number.isFinite(divisor) && divisor > 0) {
          balances = balances.map((info) => applyQuotaDivisor(info, divisor));
        }
        if (balances.length > 0) {
          return { status: 'success', balances };
        }
      }
    } catch {
      // 该鉴权不可用，继续尝试下一个
    }
  }
  return { status: 'error' };
};
