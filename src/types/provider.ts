/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
  authIndex?: string;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
  authIndex?: string;
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
  authIndex?: string;
}

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  /** 额度查询端点：填写后自动查询并展示余额；留空则不进行额度查询。 */
  quotaEndpoint?: string;
  /** 额度查询鉴权 token：留空时依次使用下方 apiKey 进行查询。 */
  quotaToken?: string;
  /** 额度换算除数：将原始额度值除以该值得到余额（如 NEW API 的 quota 需除以 500000）。 */
  quotaDivisor?: number;
  apiKeyEntries: ApiKeyEntry[];
  headers?: Record<string, string>;
  models?: ModelAlias[];
  disabled?: boolean;
  forceStream?: boolean;
  supportPromptCacheKey?: boolean;
  updatedAt?: string;
  priority?: number;
  testModel?: string;
  authIndex?: string;
  [key: string]: unknown;
}
