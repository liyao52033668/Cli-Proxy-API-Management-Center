import type { TFunction } from 'i18next';
import iconAmp from '@/assets/icons/amp.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconBt from '@/assets/icons/bt.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconCodearts from '@/assets/icons/codearts.svg';
import iconCodebuddy from '@/assets/icons/codebuddy.svg';
import iconCodebuddyAi from '@/assets/icons/codebuddy-ai.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconCursor from '@/assets/icons/cursor.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconGithub from '@/assets/icons/github.svg';
import iconGitlab from '@/assets/icons/gitlab.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconIflow from '@/assets/icons/iflow.svg';
import iconKilo from '@/assets/icons/kilo.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKiro from '@/assets/icons/kiro.svg';
import iconJoycode from '@/assets/icons/joycode.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconQoder from '@/assets/icons/qoder.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import type { AuthFileItem } from '@/types';
import { parseTimestamp } from '@/utils/timestamp';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type KeyStats,
} from '@/utils/usage';

export type ThemeColors = { bg: string; text: string; border?: string };
export type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
export type ResolvedTheme = 'light' | 'dark';
export type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};
export type AuthFileIconAsset = string | { light: string; dark: string };

export type QuotaProviderType =
  | 'antigravity'
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'cursor'
  | 'gemini-cli'
  | 'kimi'
  | 'kiro'
  | 'xai';

export const QUOTA_PROVIDER_TYPES = new Set<QuotaProviderType>([
  'antigravity',
  'claude',
  'codex',
  'copilot',
  'cursor',
  'gemini-cli',
  'kimi',
  'kiro',
  'xai',
]);

// Auth-file type/filter labels use github-copilot; quota configs use copilot.
export const resolveQuotaProviderType = (providerOrFilter: string): QuotaProviderType | null => {
  const key = providerOrFilter.trim().toLowerCase().replace(/_/g, '-');
  if (key === 'github' || key === 'github-copilot' || key === 'copilot') {
    return 'copilot';
  }
  if (QUOTA_PROVIDER_TYPES.has(key as QuotaProviderType)) {
    return key as QuotaProviderType;
  }
  return null;
};

export const MIN_CARD_PAGE_SIZE = 3;
export const MAX_CARD_PAGE_SIZE = 30;
export const AUTH_FILE_REFRESH_WARNING_MS = 24 * 60 * 60 * 1000;

export const INTEGER_STRING_PATTERN = /^[+-]?\d+$/;
export const TRUTHY_TEXT_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
export const FALSY_TEXT_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

// Normalize provider key for color/icon lookup (aliases + underscores).
export const normalizeProviderLookupKey = (type: string): string => {
  const key = type.trim().toLowerCase().replace(/_/g, '-');
  if (key === 'github' || key === 'github-copilot' || key === 'copilot') return 'github-copilot';
  if (key === 'grok') return 'xai';
  if (key === 'openai' || key === 'chatgpt') return 'openai';
  if (key === 'codebuddyai') return 'codebuddy-ai';
  return key;
};

// Brand colors + solid borders for every provider badge/avatar (similar to Kiro).
export const TYPE_COLORS: Record<string, TypeColorSet> = {
  qwen: {
    light: { bg: '#ede5fd', text: '#5530c7', border: '1px solid #c4b5fd' },
    dark: { bg: '#36208a', text: '#b5a3f0', border: '1px solid #7c6ad4' },
  },
  kimi: {
    light: { bg: '#dce8ff', text: '#0560cf', border: '1px solid #93c5fd' },
    dark: { bg: '#003880', text: '#70b5ff', border: '1px solid #3b82f6' },
  },
  gemini: {
    light: { bg: '#e3f2fd', text: '#1565c0', border: '1px solid #90caf9' },
    dark: { bg: '#0d47a1', text: '#64b5f6', border: '1px solid #42a5f5' },
  },
  'gemini-cli': {
    light: { bg: '#e0e8ff', text: '#1e4fa3', border: '1px solid #a5b4fc' },
    dark: { bg: '#1c3f73', text: '#a8c7ff', border: '1px solid #6366f1' },
  },
  aistudio: {
    light: { bg: '#f0f2f5', text: '#2f343c', border: '1px solid #d1d5db' },
    dark: { bg: '#373c42', text: '#cfd3db', border: '1px solid #6b7280' },
  },
  claude: {
    light: { bg: '#fbece4', text: '#c05621', border: '1px solid #fdba74' },
    dark: { bg: '#5e2c14', text: '#e8a882', border: '1px solid #ea580c' },
  },
  codex: {
    light: { bg: '#eae7ff', text: '#3538d4', border: '1px solid #c7d2fe' },
    dark: { bg: '#262395', text: '#b5b0ff', border: '1px solid #818cf8' },
  },
  antigravity: {
    light: { bg: '#e0f7fa', text: '#006064', border: '1px solid #67e8f9' },
    dark: { bg: '#004d40', text: '#80deea', border: '1px solid #22d3ee' },
  },
  iflow: {
    light: { bg: '#f5e3fc', text: '#9025c8', border: '1px solid #e9d5ff' },
    dark: { bg: '#521490', text: '#d49cf5', border: '1px solid #c084fc' },
  },
  vertex: {
    light: { bg: '#e4edfd', text: '#2b5fbc', border: '1px solid #bfdbfe' },
    dark: { bg: '#1a3d80', text: '#89b3f7', border: '1px solid #60a5fa' },
  },
  xai: {
    light: { bg: '#e8edf3', text: '#1f2937', border: '1px solid #d1d5db' },
    dark: { bg: '#1f2937', text: '#d1d5db', border: '1px solid #4b5563' },
  },
  cursor: {
    light: { bg: '#eef1f4', text: '#111827', border: '1px solid #cbd5e1' },
    dark: { bg: '#1f2937', text: '#e5e7eb', border: '1px solid #64748b' },
  },
  kiro: {
    light: { bg: '#fff3e0', text: '#c2410c', border: '1px solid #fdba74' },
    dark: { bg: '#7c2d12', text: '#fdba74', border: '1px solid #f97316' },
  },
  // GitHub Copilot: GitHub 黑 + 品牌绿点缀
  'github-copilot': {
    light: { bg: '#e8f5e9', text: '#1b5e20', border: '1px solid #86efac' },
    dark: { bg: '#14532d', text: '#86efac', border: '1px solid #22c55e' },
  },
  copilot: {
    light: { bg: '#e8f5e9', text: '#1b5e20', border: '1px solid #86efac' },
    dark: { bg: '#14532d', text: '#86efac', border: '1px solid #22c55e' },
  },
  github: {
    light: { bg: '#e8f5e9', text: '#1b5e20', border: '1px solid #86efac' },
    dark: { bg: '#14532d', text: '#86efac', border: '1px solid #22c55e' },
  },
  // CodeArts: 华为红
  codearts: {
    light: { bg: '#ffe4e6', text: '#be123c', border: '1px solid #fda4af' },
    dark: { bg: '#881337', text: '#fda4af', border: '1px solid #f43f5e' },
  },
  // CodeBuddy: 腾讯蓝
  codebuddy: {
    light: { bg: '#e0f2fe', text: '#0369a1', border: '1px solid #7dd3fc' },
    dark: { bg: '#0c4a6e', text: '#7dd3fc', border: '1px solid #0ea5e9' },
  },
  'codebuddy-ai': {
    light: { bg: '#cffafe', text: '#0e7490', border: '1px solid #67e8f9' },
    dark: { bg: '#164e63', text: '#67e8f9', border: '1px solid #06b6d4' },
  },
  // Qoder: 紫粉
  qoder: {
    light: { bg: '#fce7f3', text: '#9d174d', border: '1px solid #f9a8d4' },
    dark: { bg: '#831843', text: '#f9a8d4', border: '1px solid #ec4899' },
  },
  // Kilo: 青绿
  kilo: {
    light: { bg: '#d1fae5', text: '#047857', border: '1px solid #6ee7b7' },
    dark: { bg: '#064e3b', text: '#6ee7b7', border: '1px solid #10b981' },
  },
  // JoyCode: 琥珀
  joycode: {
    light: { bg: '#fef3c7', text: '#b45309', border: '1px solid #fcd34d' },
    dark: { bg: '#78350f', text: '#fcd34d', border: '1px solid #f59e0b' },
  },
  // DeepSeek: 深蓝
  deepseek: {
    light: { bg: '#dbeafe', text: '#1d4ed8', border: '1px solid #93c5fd' },
    dark: { bg: '#1e3a8a', text: '#93c5fd', border: '1px solid #3b82f6' },
  },
  // GLM / Zhipu: 青绿蓝
  glm: {
    light: { bg: '#ccfbf1', text: '#0f766e', border: '1px solid #5eead4' },
    dark: { bg: '#134e4a', text: '#5eead4', border: '1px solid #14b8a6' },
  },
  // MiniMax: 玫红
  minimax: {
    light: { bg: '#ffe4e6', text: '#9f1239', border: '1px solid #fb7185' },
    dark: { bg: '#4c0519', text: '#fb7185', border: '1px solid #e11d48' },
  },
  // Amp: 柠黄
  amp: {
    light: { bg: '#fef9c3', text: '#a16207', border: '1px solid #fde047' },
    dark: { bg: '#713f12', text: '#fde047', border: '1px solid #eab308' },
  },
  // GitLab: 品牌珊瑚橙 #FC6D26（与 Kiro AWS 橙区分）
  gitlab: {
    light: { bg: '#fff1eb', text: '#c2410c', border: '1px solid #fb923c' },
    dark: { bg: '#9a3412', text: '#fdba74', border: '1px solid #ea580c' },
  },
  // OpenAI: 墨绿
  openai: {
    light: { bg: '#d1fae5', text: '#065f46', border: '1px solid #6ee7b7' },
    dark: { bg: '#064e3b', text: '#a7f3d0', border: '1px solid #34d399' },
  },
  // BT panel: 天蓝
  bt: {
    light: { bg: '#e0f2fe', text: '#075985', border: '1px solid #7dd3fc' },
    dark: { bg: '#0c4a6e', text: '#7dd3fc', border: '1px solid #0284c7' },
  },
  empty: {
    light: { bg: '#f5f5f5', text: '#616161', border: '1px solid #d4d4d4' },
    dark: { bg: '#424242', text: '#bdbdbd', border: '1px solid #737373' },
  },
  unknown: {
    light: { bg: '#f0f0f0', text: '#666666', border: '1px dashed #999999' },
    dark: { bg: '#3a3a3a', text: '#aaaaaa', border: '1px dashed #666666' },
  },
};

export const AUTH_FILE_ICONS: Record<string, AuthFileIconAsset> = {
  amp: iconAmp,
  antigravity: iconAntigravity,
  aistudio: iconGemini,
  bt: iconBt,
  claude: iconClaude,
  codearts: iconCodearts,
  codebuddy: iconCodebuddy,
  'codebuddy-ai': iconCodebuddyAi,
  codex: iconCodex,
  copilot: iconGithub,
  cursor: iconCursor,
  deepseek: iconDeepseek,
  gemini: iconGemini,
  'gemini-cli': iconGemini,
  github: iconGithub,
  'github-copilot': iconGithub,
  gitlab: iconGitlab,
  glm: iconGlm,
  iflow: iconIflow,
  joycode: iconJoycode,
  kilo: iconKilo,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  kiro: iconKiro,
  minimax: iconMinimax,
  openai: { light: iconOpenaiLight, dark: iconOpenaiDark },
  qoder: iconQoder,
  qwen: iconQwen,
  vertex: iconVertex,
  xai: iconGrok,
};

export const clampCardPageSize = (value: number) =>
  Math.min(MAX_CARD_PAGE_SIZE, Math.max(MIN_CARD_PAGE_SIZE, Math.round(value)));

export const resolveQuotaErrorMessage = (
  t: TFunction,
  status: number | undefined,
  fallback: string
): string => {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback;
};

export const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

export const getAuthFileStatusMessage = (file: AuthFileItem): string => {
  const raw = file['status_message'] ?? file.statusMessage;
  if (typeof raw === 'string') return raw.trim();
  if (raw == null) return '';
  return String(raw).trim();
};

export const hasAuthFileStatusMessage = (file: AuthFileItem): boolean =>
  getAuthFileStatusMessage(file).length > 0;

export const getTypeLabel = (t: TFunction, type: string): string => {
  const key = `auth_files.filter_${type}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (type.toLowerCase() === 'iflow') return 'iFlow';
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const getTypeColor = (type: string, resolvedTheme: ResolvedTheme): ThemeColors => {
  const key = normalizeProviderLookupKey(type);
  const set = TYPE_COLORS[key] || TYPE_COLORS[type] || TYPE_COLORS.unknown;
  return resolvedTheme === 'dark' && set.dark ? set.dark : set.light;
};

export const getAuthFileIcon = (type: string, resolvedTheme: ResolvedTheme): string | null => {
  const key = normalizeProviderLookupKey(type);
  const iconEntry = AUTH_FILE_ICONS[key] || AUTH_FILE_ICONS[normalizeProviderKey(type)];
  if (!iconEntry) return null;
  return typeof iconEntry === 'string'
    ? iconEntry
    : resolvedTheme === 'dark'
      ? iconEntry.dark
      : iconEntry.light;
};

export const parsePriorityValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : undefined;
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !INTEGER_STRING_PATTERN.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

export const normalizeExcludedModels = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  value.forEach((entry) => {
    const model = String(entry ?? '')
      .trim()
      .toLowerCase();
    if (!model || seen.has(model)) return;
    seen.add(model);
    normalized.push(model);
  });

  return normalized.sort((a, b) => a.localeCompare(b));
};

export const parseExcludedModelsText = (value: string): string[] =>
  normalizeExcludedModels(value.split(/[\n,]+/));

export const parseDisableCoolingValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUTHY_TEXT_VALUES.has(normalized)) return true;
  if (FALSY_TEXT_VALUES.has(normalized)) return false;
  return undefined;
};

export const readCodexAuthFileWebsockets = (value: Record<string, unknown>): boolean =>
  parseDisableCoolingValue(value.websockets) ?? false;

export const applyCodexAuthFileWebsockets = (
  value: Record<string, unknown>,
  websockets: boolean
): Record<string, unknown> => {
  const next = { ...value };
  delete next.websocket;
  next.websockets = websockets;
  return next;
};

export function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean {
  const raw = file['runtime_only'] ?? file.runtimeOnly;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}

export function resolveAuthFileStats(file: AuthFileItem, stats: KeyStats): KeyStatBucket {
  const defaultStats: KeyStatBucket = { success: 0, failure: 0 };
  const rawFileName = file?.name || '';

  // 兼容 auth_index 和 authIndex 两种字段名（API 返回的是 auth_index）
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);

  // 尝试根据 authIndex 匹配
  if (authIndexKey && stats.byAuthIndex?.[authIndexKey]) {
    return stats.byAuthIndex[authIndexKey];
  }

  // 尝试根据 source (文件名) 匹配
  const fileNameId = rawFileName ? normalizeUsageSourceId(rawFileName) : '';
  if (fileNameId && stats.bySource?.[fileNameId]) {
    const fromName = stats.bySource[fileNameId];
    if (fromName.success > 0 || fromName.failure > 0) {
      return fromName;
    }
  }

  // 尝试去掉扩展名后匹配
  if (rawFileName) {
    const nameWithoutExt = rawFileName.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt && nameWithoutExt !== rawFileName) {
      const nameWithoutExtId = normalizeUsageSourceId(nameWithoutExt);
      const fromNameWithoutExt = nameWithoutExtId ? stats.bySource?.[nameWithoutExtId] : undefined;
      if (
        fromNameWithoutExt &&
        (fromNameWithoutExt.success > 0 || fromNameWithoutExt.failure > 0)
      ) {
        return fromNameWithoutExt;
      }
    }
  }

  // Fall back to auth-files API lifetime counters when usage key stats are unavailable.
  const fileSuccess = Number(file.success ?? file['Success'] ?? 0);
  const fileFailed = Number(file.failed ?? file['Failed'] ?? file['failure'] ?? 0);
  if (
    (Number.isFinite(fileSuccess) && fileSuccess > 0) ||
    (Number.isFinite(fileFailed) && fileFailed > 0)
  ) {
    return {
      success: Number.isFinite(fileSuccess) && fileSuccess > 0 ? Math.floor(fileSuccess) : 0,
      failure: Number.isFinite(fileFailed) && fileFailed > 0 ? Math.floor(fileFailed) : 0,
    };
  }

  return defaultStats;
}

export const formatModified = (item: AuthFileItem): string => {
  const raw = item['modtime'] ?? item.modified;
  if (!raw) return '-';
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : parseTimestamp(raw) ?? new Date(String(raw));
  if (Number.isNaN(date.getTime())) return '-';

  const padTime = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(date.getSeconds())}`;
};

// 检查模型是否被 OAuth 排除
export const isModelExcluded = (
  modelId: string,
  providerType: string,
  excluded: Record<string, string[]>
): boolean => {
  const providerKey = normalizeProviderKey(providerType);
  const excludedModels = excluded[providerKey] || excluded[providerType] || [];
  return excludedModels.some((pattern) => {
    if (pattern.includes('*')) {
      // 支持通配符匹配：先转义正则特殊字符，再将 * 视为通配符
      const regexSafePattern = pattern
        .split('*')
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      const regex = new RegExp(`^${regexSafePattern}$`, 'i');
      return regex.test(modelId);
    }
    return pattern.toLowerCase() === modelId.toLowerCase();
  });
};
