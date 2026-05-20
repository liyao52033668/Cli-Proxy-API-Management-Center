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
  | 'empty'
  | 'unknown';

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
  note?: string;
  headers?: Record<string, string>;
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
  note?: string;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
