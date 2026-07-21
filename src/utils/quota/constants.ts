/**
 * Quota constants for API URLs, headers, and theme colors.
 */

import type {
  AntigravityQuotaGroupDefinition,
  GeminiCliQuotaGroupDefinition,
  TypeColorSet,
} from '@/types';

// Theme colors for type badges — keep in sync with authFiles/constants.ts
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
  codearts: {
    light: { bg: '#ffe4e6', text: '#be123c', border: '1px solid #fda4af' },
    dark: { bg: '#881337', text: '#fda4af', border: '1px solid #f43f5e' },
  },
  codebuddy: {
    light: { bg: '#e0f2fe', text: '#0369a1', border: '1px solid #7dd3fc' },
    dark: { bg: '#0c4a6e', text: '#7dd3fc', border: '1px solid #0ea5e9' },
  },
  'codebuddy-ai': {
    light: { bg: '#cffafe', text: '#0e7490', border: '1px solid #67e8f9' },
    dark: { bg: '#164e63', text: '#67e8f9', border: '1px solid #06b6d4' },
  },
  qoder: {
    light: { bg: '#fce7f3', text: '#9d174d', border: '1px solid #f9a8d4' },
    dark: { bg: '#831843', text: '#f9a8d4', border: '1px solid #ec4899' },
  },
  kilo: {
    light: { bg: '#d1fae5', text: '#047857', border: '1px solid #6ee7b7' },
    dark: { bg: '#064e3b', text: '#6ee7b7', border: '1px solid #10b981' },
  },
  joycode: {
    light: { bg: '#fef3c7', text: '#b45309', border: '1px solid #fcd34d' },
    dark: { bg: '#78350f', text: '#fcd34d', border: '1px solid #f59e0b' },
  },
  deepseek: {
    light: { bg: '#dbeafe', text: '#1d4ed8', border: '1px solid #93c5fd' },
    dark: { bg: '#1e3a8a', text: '#93c5fd', border: '1px solid #3b82f6' },
  },
  glm: {
    light: { bg: '#ccfbf1', text: '#0f766e', border: '1px solid #5eead4' },
    dark: { bg: '#134e4a', text: '#5eead4', border: '1px solid #14b8a6' },
  },
  minimax: {
    light: { bg: '#ffe4e6', text: '#9f1239', border: '1px solid #fb7185' },
    dark: { bg: '#4c0519', text: '#fb7185', border: '1px solid #e11d48' },
  },
  amp: {
    light: { bg: '#fef9c3', text: '#a16207', border: '1px solid #fde047' },
    dark: { bg: '#713f12', text: '#fde047', border: '1px solid #eab308' },
  },
  gitlab: {
    light: { bg: '#fff1eb', text: '#c2410c', border: '1px solid #fb923c' },
    dark: { bg: '#9a3412', text: '#fdba74', border: '1px solid #ea580c' },
  },
  openai: {
    light: { bg: '#d1fae5', text: '#065f46', border: '1px solid #6ee7b7' },
    dark: { bg: '#064e3b', text: '#a7f3d0', border: '1px solid #34d399' },
  },
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

// Antigravity API configuration
export const ANTIGRAVITY_QUOTA_URLS = [
  'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
  'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
  'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
];

export const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'User-Agent': 'antigravity/1.11.5 windows/amd64',
};

export const ANTIGRAVITY_QUOTA_GROUPS: AntigravityQuotaGroupDefinition[] = [
  {
    id: 'claude-gpt',
    label: 'Claude/GPT',
    identifiers: ['claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium'],
  },
  {
    id: 'gemini-3-pro',
    label: 'Gemini 3 Pro',
    identifiers: ['gemini-3-pro-high', 'gemini-3-pro-low'],
  },
  {
    id: 'gemini-3-1-pro-series',
    label: 'Gemini 3.1 Pro Series',
    identifiers: ['gemini-3.1-pro-high', 'gemini-3.1-pro-low'],
  },
  {
    id: 'gemini-2-5-flash',
    label: 'Gemini 2.5 Flash',
    identifiers: ['gemini-2.5-flash', 'gemini-2.5-flash-thinking'],
  },
  {
    id: 'gemini-2-5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    identifiers: ['gemini-2.5-flash-lite'],
  },
  {
    id: 'gemini-2-5-cu',
    label: 'Gemini 2.5 CU',
    identifiers: ['rev19-uic3-1p'],
  },
  {
    id: 'gemini-3-flash',
    label: 'Gemini 3 Flash',
    identifiers: ['gemini-3-flash'],
  },
  {
    id: 'gemini-image',
    label: 'gemini-3.1-flash-image',
    identifiers: ['gemini-3.1-flash-image'],
    labelFromModel: true,
  },
];

// Gemini CLI API configuration
export const GEMINI_CLI_QUOTA_URL =
  'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';

export const GEMINI_CLI_CODE_ASSIST_URL =
  'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist';

export const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
};

export const GEMINI_CLI_QUOTA_GROUPS: GeminiCliQuotaGroupDefinition[] = [
  {
    id: 'gemini-flash-lite-series',
    label: 'Gemini Flash Lite Series',
    preferredModelId: 'gemini-2.5-flash-lite',
    modelIds: ['gemini-2.5-flash-lite'],
  },
  {
    id: 'gemini-flash-series',
    label: 'Gemini Flash Series',
    preferredModelId: 'gemini-3-flash-preview',
    modelIds: ['gemini-3-flash-preview', 'gemini-2.5-flash'],
  },
  {
    id: 'gemini-pro-series',
    label: 'Gemini Pro Series',
    preferredModelId: 'gemini-3.1-pro-preview',
    modelIds: ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro'],
  },
];

export const GEMINI_CLI_GROUP_ORDER = new Map(
  GEMINI_CLI_QUOTA_GROUPS.map((group, index) => [group.id, index] as const)
);

export const GEMINI_CLI_GROUP_LOOKUP = new Map(
  GEMINI_CLI_QUOTA_GROUPS.flatMap((group) =>
    group.modelIds.map((modelId) => [modelId, group] as const)
  )
);

export const GEMINI_CLI_IGNORED_MODEL_PREFIXES = ['gemini-2.0-flash'];

// Claude API configuration
export const CLAUDE_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';

export const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export const CLAUDE_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'anthropic-beta': 'oauth-2025-04-20',
};

export const CLAUDE_USAGE_WINDOW_KEYS = [
  { key: 'five_hour', id: 'five-hour', labelKey: 'claude_quota.five_hour' },
  { key: 'seven_day', id: 'seven-day', labelKey: 'claude_quota.seven_day' },
  { key: 'seven_day_oauth_apps', id: 'seven-day-oauth-apps', labelKey: 'claude_quota.seven_day_oauth_apps' },
  { key: 'seven_day_opus', id: 'seven-day-opus', labelKey: 'claude_quota.seven_day_opus' },
  { key: 'seven_day_sonnet', id: 'seven-day-sonnet', labelKey: 'claude_quota.seven_day_sonnet' },
  { key: 'seven_day_cowork', id: 'seven-day-cowork', labelKey: 'claude_quota.seven_day_cowork' },
  { key: 'iguana_necktie', id: 'iguana-necktie', labelKey: 'claude_quota.iguana_necktie' },
] as const;

// Codex API configuration
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

export const CODEX_RATE_LIMIT_RESET_CREDITS_URL =
  'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits';

export const CODEX_RATE_LIMIT_RESET_CREDITS_CONSUME_URL =
  'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume';

export const CODEX_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
};

// Kimi API configuration
export const KIMI_USAGE_URL = 'https://api.kimi.com/coding/v1/usages';

export const KIMI_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
};

// xAI/Grok API configuration
export const XAI_BILLING_WEEKLY_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits';
export const XAI_BILLING_MONTHLY_URL = 'https://cli-chat-proxy.grok.com/v1/billing';
export const XAI_GROK_CLIENT_VERSION = '0.2.93';
export const XAI_GROK_USER_AGENT = 'grok-pager/0.2.93 grok-shell/0.2.93 (macos; aarch64)';

export const XAI_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'x-xai-token-auth': 'xai-grok-cli',
  'x-grok-client-version': XAI_GROK_CLIENT_VERSION,
  accept: '*/*',
  'user-agent': XAI_GROK_USER_AGENT,
};

// Cursor dashboard usage-summary (Cookie session token is expanded server-side)
export const CURSOR_USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary';

export const CURSOR_REQUEST_HEADERS = {
  Cookie: 'WorkosCursorSessionToken=$TOKEN$',
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
};
