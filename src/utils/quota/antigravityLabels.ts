/**
 * Antigravity 额度标签 → i18n key 解析（纯函数）。
 *
 * 上游 displayName 会随版本变化（如 "Five Hour Limit Remaining"），因此先按
 * 归一化后的文案匹配，匹配不到再回落到结构化的 `window` 字段。
 */

const GROUP_LABEL_KEYS = new Map<string, string>([
  ['gemini models', 'group_gemini_models'],
  ['claude and gpt models', 'group_claude_gpt_models'],
]);

const BUCKET_LABEL_KEYS = new Map<string, string>([
  ['weekly limit', 'weekly_limit'],
  ['daily limit', 'daily_limit'],
  ['5 hour limit', 'five_hour_limit'],
  ['5-hour limit', 'five_hour_limit'],
  ['five hour limit', 'five_hour_limit'],
  ['five-hour limit', 'five_hour_limit'],
  ['monthly limit', 'monthly_limit'],
]);

const BUCKET_WINDOW_KEYS = new Map<string, string>([
  ['5h', 'five_hour_limit'],
  ['five-hour', 'five_hour_limit'],
  ['five_hour', 'five_hour_limit'],
  ['daily', 'daily_limit'],
  ['day', 'daily_limit'],
  ['weekly', 'weekly_limit'],
  ['week', 'weekly_limit'],
  ['monthly', 'monthly_limit'],
  ['month', 'monthly_limit'],
]);

/** 后端返回的自由文本分组描述 → i18n key（按归一化前缀匹配）。 */
const DESCRIPTION_KEYS: readonly { pattern: RegExp; key: string }[] = [
  {
    pattern: /^for paid pro plans, argon quota is separate\b/i,
    key: 'argon_pro_description',
  },
];

const GROUP_MODELS_PATTERN = /^models within this group:\s*(.+)$/i;

const normalizeText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

/** 去掉上游常见的 "Remaining" 后缀，如 "Weekly Limit Remaining" → "weekly limit"。 */
const stripRemainingSuffix = (value: string): string =>
  value.replace(/\s*(?:-|:)?\s*remaining$/, '').trim();

export function resolveAntigravityGroupLabelKey(label: string): string | null {
  return GROUP_LABEL_KEYS.get(normalizeText(label)) ?? null;
}

/**
 * 解析分组描述中的模型列表。描述不是「Models within this group: ...」格式时
 * 返回 null，由调用方按自由文本描述处理。
 */
export function resolveAntigravityGroupModels(description: string | undefined): string[] | null {
  const match = description?.trim().match(GROUP_MODELS_PATTERN);
  if (!match) return null;

  return match[1]
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

/** 翻译后端返回的自由文本分组/桶描述，未收录的原文返回。 */
export function resolveAntigravityDescriptionKey(description: string): string | null {
  const normalized = normalizeText(description);
  return DESCRIPTION_KEYS.find(({ pattern }) => pattern.test(normalized))?.key ?? null;
}

export function resolveAntigravityBucketLabelKey(
  label: string,
  window: string | undefined
): string | null {
  const normalized = normalizeText(label);
  const byLabel =
    BUCKET_LABEL_KEYS.get(normalized) ?? BUCKET_LABEL_KEYS.get(stripRemainingSuffix(normalized));
  if (byLabel) return byLabel;
  if (!window) return null;
  return BUCKET_WINDOW_KEYS.get(normalizeText(window)) ?? null;
}
