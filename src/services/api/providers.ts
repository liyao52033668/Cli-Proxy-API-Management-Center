/**
 * AI 提供商相关 API
 */

import { apiClient } from './client';
import {
  normalizeFreebuffConfig,
  normalizeGeminiKeyConfig,
  normalizeOpenAIProvider,
  normalizeProviderKeyConfig
} from './transformers';
import type {
  FreebuffKeyConfig,
  FreebuffModel,
  GeminiKeyConfig,
  OpenAIProviderConfig,
  ProviderKeyConfig,
  ApiKeyEntry,
  ModelAlias
} from '@/types';
import {
  normalizeFreebuffCatalog,
  type FreebuffCatalogModel
} from '@/utils/freebuffModels';

const serializeHeaders = (headers?: Record<string, string>) => (headers && Object.keys(headers).length ? headers : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const buildProviderDeleteQuery = (apiKey: string, baseUrl?: string) => {
  const params = new URLSearchParams();
  params.set('api-key', apiKey.trim());
  params.set('base-url', (baseUrl ?? '').trim());
  return `?${params.toString()}`;
};

const serializeModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { name: model.name };
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias;
          }
          if (model.priority !== undefined) {
            payload.priority = model.priority;
          }
          if (model.testModel) {
            payload['test-model'] = model.testModel;
          }
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeApiKeyEntry = (entry: ApiKeyEntry) => {
  const payload: Record<string, unknown> = { 'api-key': entry.apiKey };
  if (entry.proxyUrl) payload['proxy-url'] = entry.proxyUrl;
  const headers = serializeHeaders(entry.headers);
  if (headers) payload.headers = headers;
  return payload;
};

const serializeProviderKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = {};
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    if (config.cloak.strictMode !== undefined) cloakPayload['strict-mode'] = config.cloak.strictMode;
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    }
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    }
  }
  return payload;
};

const serializeVertexModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (!name || !alias) return null;
          return { name, alias };
        })
        .filter(Boolean)
    : undefined;

const serializeVertexKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeVertexModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeGeminiKey = (config: GeminiKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  return payload;
};

const serializeFreebuffModels = (models?: FreebuffModel[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          const name = typeof model?.name === 'string' ? model.name.trim() : '';
          if (!name) return null;
          const payload: Record<string, unknown> = { name };
          const alias = typeof model?.alias === 'string' ? model.alias.trim() : '';
          if (alias) payload.alias = alias;
          const agentId = typeof model?.agentId === 'string' ? model.agentId.trim() : '';
          if (agentId) payload['agent-id'] = agentId;
          const displayName = typeof model?.displayName === 'string' ? model.displayName.trim() : '';
          if (displayName) payload['display-name'] = displayName;
          if (model?.maxContextLength !== undefined && Number.isFinite(model.maxContextLength)) {
            payload['max-context-length'] = model.maxContextLength;
          }
          if (model?.forceMapping !== undefined) payload['force-mapping'] = model.forceMapping;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeFreebuffKey = (config: FreebuffKeyConfig) => {
  const apiKey = config.apiKey.trim();
  const payload: Record<string, unknown> = { 'api-key': apiKey };
  if (config.comment?.trim()) payload.comment = config.comment.trim();
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl?.trim()) payload['base-url'] = config.baseUrl.trim();
  if (config.proxyUrl?.trim()) payload['proxy-url'] = config.proxyUrl.trim();
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeFreebuffModels(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
  }
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  // Preserve additional credentials in api-key-entries; the edited key stays first.
  if (Array.isArray(config.apiKeyEntries) && config.apiKeyEntries.length) {
    const entries = config.apiKeyEntries
      .filter((entry) => entry?.apiKey?.trim())
      .map((entry) => serializeApiKeyEntry(entry));
    const withoutEdited = entries.filter((entry) => entry['api-key'] !== apiKey);
    if (apiKey) {
      const editedEntry: Record<string, unknown> = { 'api-key': apiKey };
      if (config.proxyUrl?.trim()) editedEntry['proxy-url'] = config.proxyUrl.trim();
      payload['api-key-entries'] = [editedEntry, ...withoutEdited];
    } else if (entries.length) {
      payload['api-key-entries'] = entries;
    }
  }
  return payload;
};

const serializeOpenAIProvider = (provider: OpenAIProviderConfig) => {
  const payload: Record<string, unknown> = {
    name: provider.name,
    'base-url': provider.baseUrl,
    'api-key-entries': Array.isArray(provider.apiKeyEntries)
      ? provider.apiKeyEntries.map((entry) => serializeApiKeyEntry(entry))
      : []
  };
  if (provider.prefix?.trim()) payload.prefix = provider.prefix.trim();
  const headers = serializeHeaders(provider.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(provider.models);
  if (models && models.length) payload.models = models;
  if (provider.disabled !== undefined) payload.disabled = provider.disabled;
  if (provider.forceStream !== undefined) payload['force-stream'] = provider.forceStream;
  if (provider.supportPromptCacheKey !== undefined)
    payload['support-prompt-cache-key'] = provider.supportPromptCacheKey;
  if (provider.priority !== undefined) payload.priority = provider.priority;
  if (provider.testModel) payload['test-model'] = provider.testModel;
  if (provider.quotaEndpoint?.trim()) payload['quota-endpoint'] = provider.quotaEndpoint.trim();
  if (provider.quotaToken?.trim()) payload['quota-token'] = provider.quotaToken.trim();
  if (provider.quotaDivisor !== undefined && Number.isFinite(provider.quotaDivisor))
    payload['quota-divisor'] = provider.quotaDivisor;
  return payload;
};

export const providersApi = {
  async getGeminiKeys(): Promise<GeminiKeyConfig[]> {
    const data = await apiClient.get('/gemini-api-key');
    const list = extractArrayPayload(data, 'gemini-api-key');
    return list.map((item) => normalizeGeminiKeyConfig(item)).filter(Boolean) as GeminiKeyConfig[];
  },

  saveGeminiKeys: (configs: GeminiKeyConfig[]) =>
    apiClient.put('/gemini-api-key', configs.map((item) => serializeGeminiKey(item))),

  updateGeminiKey: (index: number, value: GeminiKeyConfig) =>
    apiClient.patch('/gemini-api-key', { index, value: serializeGeminiKey(value) }),

  deleteGeminiKey: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/gemini-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getCodexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/codex-api-key');
    const list = extractArrayPayload(data, 'codex-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveCodexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put('/codex-api-key', configs.map((item) => serializeProviderKey(item))),

  updateCodexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/codex-api-key', { index, value: serializeProviderKey(value) }),

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put('/claude-api-key', configs.map((item) => serializeProviderKey(item))),

  updateClaudeConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/claude-api-key', { index, value: serializeProviderKey(value) }),

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getVertexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/vertex-api-key');
    const list = extractArrayPayload(data, 'vertex-api-key');
    return list.map((item) => normalizeProviderKeyConfig(item)).filter(Boolean) as ProviderKeyConfig[];
  },

  saveVertexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put('/vertex-api-key', configs.map((item) => serializeVertexKey(item))),

  updateVertexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/vertex-api-key', { index, value: serializeVertexKey(value) }),

  deleteVertexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/vertex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getFreebuffConfigs(): Promise<FreebuffKeyConfig[]> {
    const data = await apiClient.get('/freebuff-api-key');
    const list = extractArrayPayload(data, 'freebuff-api-key');
    return list.map((item) => normalizeFreebuffConfig(item)).filter(Boolean) as FreebuffKeyConfig[];
  },

  saveFreebuffConfigs: (configs: FreebuffKeyConfig[]) =>
    apiClient.put('/freebuff-api-key', configs.map((item) => serializeFreebuffKey(item))),

  updateFreebuffConfig: (index: number, value: FreebuffKeyConfig) =>
    apiClient.patch('/freebuff-api-key', { index, value: serializeFreebuffKey(value) }),

  // Deletes by index because a Freebuff credential may repeat across proxy entries.
  deleteFreebuffConfig: (index: number) =>
    apiClient.delete(`/freebuff-api-key?index=${encodeURIComponent(String(index))}`),

  // Freebuff publishes no upstream model list, so the catalog ships with the
  // backend build and is read here instead of proxying /v1/models.
  async getFreebuffModelCatalog(): Promise<FreebuffCatalogModel[]> {
    const data = await apiClient.get('/freebuff/models');
    const list = isRecord(data) ? data.models : undefined;
    return normalizeFreebuffCatalog(list);
  },

  async getOpenAIProviders(): Promise<OpenAIProviderConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list.map((item) => normalizeOpenAIProvider(item)).filter(Boolean) as OpenAIProviderConfig[];
  },

  saveOpenAIProviders: (providers: OpenAIProviderConfig[]) =>
    apiClient.put('/openai-compatibility', providers.map((item) => serializeOpenAIProvider(item))),

  updateOpenAIProvider: (index: number, value: OpenAIProviderConfig) =>
    apiClient.patch('/openai-compatibility', { index, value: serializeOpenAIProvider(value) }),

  deleteOpenAIProvider: (name: string) =>
    apiClient.delete(`/openai-compatibility?name=${encodeURIComponent(name)}`)
};
