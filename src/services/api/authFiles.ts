/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import type { AuthFilePatchFields, AuthFilesResponse } from '@/types/authFile';
import type { OAuthModelAliasEntry } from '@/types';
import { parseTimestampMs } from '@/utils/timestamp';
import { AUTH_FILES_UPLOAD_BATCH_SIZE, AUTH_FILES_UPLOAD_TIMEOUT_MS } from '@/utils/constants';

export type AuthFileModelTestStatus =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'unsupported'
  | 'disabled'
  | 'idle'
  | 'running';

export type AuthFileModelTestResult = {
  ok: boolean;
  status: Exclude<AuthFileModelTestStatus, 'idle' | 'running'>;
  latency_ms: number;
  model: string;
  provider?: string;
  auth_id?: string;
  http_status?: number;
  error?: string;
  preview?: string;
  /** True when the probe failure newly appended this model to auth-file excluded_models. */
  excluded_added?: boolean;
  /** Auth-file excluded_models after the probe (file-level list). */
  excluded_models?: string[];
};

const AUTH_FILE_MODEL_TEST_TIMEOUT_MS = 60 * 1000;

const normalizeAuthFileModelTestResult = (
  data: Record<string, unknown> | null | undefined,
  fallbackModel: string
): AuthFileModelTestResult => {
  const statusRaw = String(data?.status ?? data?.Status ?? '').trim().toLowerCase();
  const allowed = new Set(['success', 'failed', 'timeout', 'unsupported', 'disabled']);
  const status = (allowed.has(statusRaw) ? statusRaw : data?.ok || data?.OK ? 'success' : 'failed') as AuthFileModelTestResult['status'];
  const latency = Number(data?.latency_ms ?? data?.latencyMs ?? data?.LatencyMS ?? 0);
  const excludedRaw = data?.excluded_models ?? data?.excludedModels ?? data?.ExcludedModels;
  const excludedModels = Array.isArray(excludedRaw)
    ? excludedRaw
        .map((item) => String(item ?? '').trim().toLowerCase())
        .filter((item, index, arr) => item && arr.indexOf(item) === index)
    : undefined;

  return {
    ok: Boolean(data?.ok ?? data?.OK ?? status === 'success'),
    status,
    latency_ms: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : 0,
    model: String(data?.model ?? data?.Model ?? fallbackModel ?? '').trim(),
    provider: data?.provider != null ? String(data.provider) : data?.Provider != null ? String(data.Provider) : undefined,
    auth_id: data?.auth_id != null ? String(data.auth_id) : data?.authId != null ? String(data.authId) : undefined,
    http_status:
      data?.http_status != null
        ? Number(data.http_status)
        : data?.httpStatus != null
          ? Number(data.httpStatus)
          : undefined,
    error: data?.error != null ? String(data.error) : data?.Error != null ? String(data.Error) : undefined,
    preview: data?.preview != null ? String(data.preview) : data?.Preview != null ? String(data.Preview) : undefined,
    excluded_added: Boolean(data?.excluded_added ?? data?.excludedAdded ?? data?.ExcludedAdded),
    excluded_models: excludedModels
  };
};

type StatusError = { status?: number };
type AuthFileStatusResponse = { status: string; disabled: boolean };
type AuthFileEntry = AuthFilesResponse['files'][number];
type AuthFileBatchFailure = { name: string; error: string };
type AuthFileBatchUploadResponse = {
  status?: string;
  uploaded?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchDeleteResponse = {
  status?: string;
  deleted?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchUploadResult = {
  status: string;
  uploaded: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
type AuthFileBatchDeleteResult = {
  status: string;
  deleted: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};

export const AUTH_FILE_INVALID_JSON_OBJECT_ERROR = 'AUTH_FILE_INVALID_JSON_OBJECT';

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  if ('status' in err) return (err as StatusError).status;
  return undefined;
};

const normalizeRequestedAuthFileNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  names.forEach((name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizeBatchFileNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return normalizeRequestedAuthFileNames(value.map((item) => String(item ?? '')));
};

const normalizeBatchFailures = (value: unknown): AuthFileBatchFailure[] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<AuthFileBatchFailure[]>((result, item) => {
    if (!item || typeof item !== 'object') return result;
    const entry = item as Record<string, unknown>;
    const name = String(entry.name ?? '').trim();
    const error =
      typeof entry.error === 'string'
        ? entry.error.trim()
        : typeof entry.message === 'string'
          ? entry.message.trim()
          : '';

    if (!name && !error) return result;
    result.push({ name, error: error || 'Unknown error' });
    return result;
  }, []);
};

const deriveSuccessfulFileNames = (requestedNames: string[], failed: AuthFileBatchFailure[]): string[] => {
  const failedNames = new Set(
    failed
      .map((entry) => entry.name.trim())
      .filter(Boolean)
  );

  if (failedNames.size === 0) {
    return [...requestedNames];
  }

  return requestedNames.filter((name) => !failedNames.has(name));
};

const normalizeBatchUploadResponse = (
  payload: AuthFileBatchUploadResponse | undefined,
  requestedNames: string[]
): AuthFileBatchUploadResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const uploadedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const uploaded =
    typeof payload?.uploaded === 'number'
      ? payload.uploaded
      : uploadedFilesFromPayload.length > 0
        ? uploadedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let uploadedFiles = uploadedFilesFromPayload;
  if (uploadedFiles.length === 0 && uploaded > 0) {
    if (failed.length === 0 && uploaded === requestedNames.length) {
      uploadedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === uploaded) {
        uploadedFiles = derivedNames;
      }
    }
  }

  return {
    status: typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    uploaded,
    files: uploadedFiles,
    failed,
  };
};

const normalizeBatchDeleteResponse = (
  payload: AuthFileBatchDeleteResponse | undefined,
  requestedNames: string[]
): AuthFileBatchDeleteResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const deletedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const deleted =
    typeof payload?.deleted === 'number'
      ? payload.deleted
      : deletedFilesFromPayload.length > 0
        ? deletedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let deletedFiles = deletedFilesFromPayload;
  if (deletedFiles.length === 0 && deleted > 0) {
    if (failed.length === 0 && deleted === requestedNames.length) {
      deletedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === deleted) {
        deletedFiles = derivedNames;
      }
    }
  }

  return {
    status: typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    deleted,
    files: deletedFiles,
    failed,
  };
};

const readTextField = (entry: AuthFileEntry, key: string): string => {
  const value = entry[key];
  return typeof value === 'string' ? value.trim() : '';
};

const readDateField = (entry: AuthFileEntry): number => {
  const candidates = [entry['modtime'], entry.modified, entry['updated_at'], entry['last_refresh']];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        return asNumber < 1e12 ? asNumber * 1000 : asNumber;
      }
      const parsed = parseTimestampMs(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const isRuntimeOnlyEntry = (entry: AuthFileEntry): boolean => {
  const value = entry['runtime_only'] ?? entry.runtimeOnly;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const countMeaningfulFields = (entry: AuthFileEntry): number =>
  Object.values(entry).reduce<number>(
    (count, value) => count + (hasMeaningfulValue(value) ? 1 : 0),
    0
  );

const authFilePriorityScore = (entry: AuthFileEntry): number => {
  let score = 0;
  if (readTextField(entry, 'source').toLowerCase() === 'file') score += 32;
  if (readTextField(entry, 'path')) score += 16;
  if (!isRuntimeOnlyEntry(entry)) score += 8;
  if (entry.disabled !== true) score += 4;
  if (readDateField(entry) > 0) score += 2;
  return score;
};

const compareAuthFileEntries = (left: AuthFileEntry, right: AuthFileEntry): number => {
  const scoreDiff = authFilePriorityScore(right) - authFilePriorityScore(left);
  if (scoreDiff !== 0) return scoreDiff;

  const dateDiff = readDateField(right) - readDateField(left);
  if (dateDiff !== 0) return dateDiff;

  const fieldDiff = countMeaningfulFields(right) - countMeaningfulFields(left);
  if (fieldDiff !== 0) return fieldDiff;

  return 0;
};

const mergeAuthFileEntries = (entries: AuthFileEntry[]): AuthFileEntry => {
  const [primary, ...rest] = [...entries].sort(compareAuthFileEntries);
  const merged: AuthFileEntry = { ...primary };

  rest.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (!hasMeaningfulValue(merged[key]) && hasMeaningfulValue(value)) {
        merged[key] = value;
      }
    });
  });

  return merged;
};

const dedupeAuthFilesResponse = (payload: AuthFilesResponse): AuthFilesResponse => {
  const normalizeBoolean = (value: unknown): boolean | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
    }
    return Boolean(value);
  };

  const files = Array.isArray(payload?.files) ? payload.files : [];
  const grouped = new Map<string, AuthFileEntry[]>();

  files.forEach((entry) => {
    const name = readTextField(entry, 'name');
    const key = name || JSON.stringify(entry);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(entry);
      return;
    }
    grouped.set(key, [entry]);
  });

  const normalizedFiles = Array.from(grouped.values()).map((entries) => {
    const merged = mergeAuthFileEntries(entries);
    // Normalize disabled field to strict boolean
    if (merged.disabled !== undefined) {
      const normalized = normalizeBoolean(merged.disabled);
      if (normalized !== undefined) {
        merged.disabled = normalized;
      } else {
        delete merged.disabled;
      }
    }
    return merged;
  });
  normalizedFiles.sort((left, right) =>
    readTextField(left, 'name').localeCompare(readTextField(right, 'name'), undefined, {
      sensitivity: 'accent',
    })
  );

  return {
    ...payload,
    files: normalizedFiles,
    total: normalizedFiles.length,
  };
};

const parseAuthFileJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...(parsed as Record<string, unknown>) };
};

const saveAuthFileText = async (name: string, text: string) => {
  const file = new File([text], name, { type: 'application/json' });
  await authFilesApi.upload(file);
};

export const isAuthFileInvalidJsonObjectError = (err: unknown): boolean =>
  err instanceof Error && err.message === AUTH_FILE_INVALID_JSON_OBJECT_ERROR;

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, string[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source =
    record['oauth-model-alias'] ??
    record.items ??
    payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';

export const authFilesApi = {
  list: async () => dedupeAuthFilesResponse(await apiClient.get<AuthFilesResponse>('/auth-files')),

  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  patchFields: (name: string, fields: AuthFilePatchFields) =>
    apiClient.patch<{ status: string }>('/auth-files/fields', { name, ...fields }),

  uploadFiles: async (files: File[]): Promise<AuthFileBatchUploadResult> => {
    const requestedNames = files.map((file) => file.name);
    if (requestedNames.length === 0) {
      return { status: 'ok', uploaded: 0, files: [], failed: [] };
    }

    const batches: File[][] = [];
    for (let index = 0; index < files.length; index += AUTH_FILES_UPLOAD_BATCH_SIZE) {
      batches.push(files.slice(index, index + AUTH_FILES_UPLOAD_BATCH_SIZE));
    }

    if (batches.length === 1) {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('file', file, file.name);
      });
      const payload = await apiClient.postForm<AuthFileBatchUploadResponse>('/auth-files', formData, {
        timeout: AUTH_FILES_UPLOAD_TIMEOUT_MS,
      });
      return normalizeBatchUploadResponse(payload, requestedNames);
    }

    const aggregatedFailed: AuthFileBatchFailure[] = [];
    const aggregatedFiles: string[] = [];
    let aggregatedUploaded = 0;

    for (const batchFiles of batches) {
      const batchRequestedNames = batchFiles.map((file) => file.name);
      const formData = new FormData();
      batchFiles.forEach((file) => {
        formData.append('file', file, file.name);
      });

      const payload = await apiClient.postForm<AuthFileBatchUploadResponse>('/auth-files', formData, {
        timeout: AUTH_FILES_UPLOAD_TIMEOUT_MS,
      });
      const batchResult = normalizeBatchUploadResponse(payload, batchRequestedNames);

      aggregatedUploaded += batchResult.uploaded;
      aggregatedFiles.push(...batchResult.files);
      aggregatedFailed.push(...batchResult.failed);
    }

    return {
      status: aggregatedFailed.length > 0 ? 'partial' : 'ok',
      uploaded: aggregatedUploaded,
      files: aggregatedFiles,
      failed: aggregatedFailed,
    };
  },

  upload: (file: File) => authFilesApi.uploadFiles([file]),

  deleteFiles: async (names: string[]): Promise<AuthFileBatchDeleteResult> => {
    const requestedNames = normalizeRequestedAuthFileNames(names);
    if (requestedNames.length === 0) {
      return { status: 'ok', deleted: 0, files: [], failed: [] };
    }

    const batches: string[][] = [];
    for (let index = 0; index < requestedNames.length; index += AUTH_FILES_UPLOAD_BATCH_SIZE) {
      batches.push(requestedNames.slice(index, index + AUTH_FILES_UPLOAD_BATCH_SIZE));
    }

    if (batches.length === 1) {
      const payload = await apiClient.delete<AuthFileBatchDeleteResponse>('/auth-files', {
        data: { names: requestedNames },
      });
      return normalizeBatchDeleteResponse(payload, requestedNames);
    }

    const aggregatedFailed: AuthFileBatchFailure[] = [];
    const aggregatedFiles: string[] = [];
    let aggregatedDeleted = 0;

    for (const batchNames of batches) {
      const payload = await apiClient.delete<AuthFileBatchDeleteResponse>('/auth-files', {
        data: { names: batchNames },
      });
      const batchResult = normalizeBatchDeleteResponse(payload, batchNames);

      aggregatedDeleted += batchResult.deleted;
      aggregatedFiles.push(...batchResult.files);
      aggregatedFailed.push(...batchResult.failed);
    }

    return {
      status: aggregatedFailed.length > 0 ? 'partial' : 'ok',
      deleted: aggregatedDeleted,
      files: aggregatedFiles,
      failed: aggregatedFailed,
    };
  },

  deleteFile: (name: string) => authFilesApi.deleteFiles([name]),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  downloadText: async (name: string): Promise<string> => {
    const query = new URLSearchParams({ name });
    const response = await apiClient.getRaw(`/auth-files/download?${query.toString()}`, {
      responseType: 'blob'
    });
    const blob = response.data as Blob;
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases = normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, { channel: normalizedChannel, aliases: normalizedAliases });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, { channel: normalizedChannel, aliases: [] });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(`${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`);
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(name: string): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const data = await apiClient.get<Record<string, unknown>>(
      `/auth-files/models?name=${encodeURIComponent(name)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },

  // 测试认证文件下某个模型的连通性
  async testAuthFileModel(
    params: { name: string; model: string; timeout_seconds?: number },
    config?: { signal?: AbortSignal; timeout?: number }
  ): Promise<AuthFileModelTestResult> {
    const payload: Record<string, unknown> = {
      name: String(params.name ?? '').trim(),
      model: String(params.model ?? '').trim()
    };
    if (params.timeout_seconds && params.timeout_seconds > 0) {
      payload.timeout_seconds = params.timeout_seconds;
    }
    const data = await apiClient.post<Record<string, unknown>>(
      '/auth-files/test',
      payload,
      {
        signal: config?.signal,
        timeout: config?.timeout ?? AUTH_FILE_MODEL_TEST_TIMEOUT_MS
      }
    );
    return normalizeAuthFileModelTestResult(data, payload.model as string);
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(channel: string): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '').trim().toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  }
};
