/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'vertex'
  | 'xai'
  | 'cursor'
  | 'kiro'
  | 'empty'
  | 'unknown';

/** Recent 10-minute request bucket from auth-files API (`recent_requests`). */
export interface AuthFileRecentRequestBucket {
  time?: string;
  success?: number;
  failed?: number;
  failure?: number;
}

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  modified?: number;
  prefix?: string;
  proxy_url?: string;
  priority?: number | string;
  excluded_models?: string[];
  disable_cooling?: boolean | string | number;
  websockets?: boolean | string | number;
  using_api?: boolean | string | number;
  note?: string;
  headers?: Record<string, string>;
  /** Lifetime success count from auth runtime (auth-files API). */
  success?: number;
  /** Lifetime failure count from auth runtime (auth-files API). */
  failed?: number;
  /** Last ~200 minutes of request buckets (10 min each), oldest → newest. */
  recent_requests?: AuthFileRecentRequestBucket[];
  [key: string]: unknown;
}

export interface AuthFilePatchFields {
  prefix?: string;
  proxy_url?: string;
  headers?: Record<string, string>;
  priority?: number;
  excluded_models?: string[];
  disable_cooling?: boolean | null;
  websockets?: boolean | null;
  using_api?: boolean | null;
  note?: string;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
