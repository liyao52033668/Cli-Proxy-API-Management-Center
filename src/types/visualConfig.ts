export type PayloadParamValueType = 'string' | 'number' | 'boolean' | 'json';
export type PayloadParamValidationErrorCode =
  | 'payload_invalid_number'
  | 'payload_invalid_boolean'
  | 'payload_invalid_json';

export type VisualConfigFieldPath =
  | 'port'
  | 'logsMaxTotalSizeMb'
  | 'errorLogsMaxFiles'
  | 'redisUsageQueueRetentionSeconds'
  | 'requestRetry'
  | 'maxRetryCredentials'
  | 'maxRetryInterval'
  | 'transientErrorCooldownSeconds'
  | 'authAutoRefreshWorkers'
  | 'antigravityConnectionPoolMaxIdleConnsPerHost'
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type DisableImageGenerationValue = 'false' | 'true' | 'chat';

export type VisualConfigValidationErrorCode = 'port_range' | 'non_negative_integer' | 'integer';

export type VisualConfigValidationErrors = Partial<
  Record<VisualConfigFieldPath, VisualConfigValidationErrorCode>
>;

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: string;
  /**
   * Original YAML value (string or object) this entry was parsed from. Re-emitted on
   * save when the entry is untouched so fields the visual editor does not model
   * (headers, from-protocol, match, not-match, exist, not-exist) survive the round trip.
   */
  raw?: unknown;
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

/**
 * One replacement step inside a payload replace rule. A literal step maps a
 * source phrase to its destination; a regex step carries a Go RE2 pattern and a
 * replacement string, where capture groups expand as $1 / ${name}.
 */
export type PayloadReplacementEntry = {
  id: string;
  kind: 'literal' | 'regex';
  /** Literal source phrase, or the RE2 pattern for a regex step. */
  from: string;
  /** Literal destination, or the replacement string for a regex step. */
  to: string;
};

/**
 * Selects the text a replace rule edits. Role/positions/all address messages in
 * the final upstream payload; paths address JSON nodes directly. The two forms
 * are mutually exclusive, mirroring the backend contract.
 */
export type PayloadReplaceTargetMode = 'positions' | 'all' | 'paths';

export type PayloadReplaceRule = {
  id: string;
  models: PayloadModelEntry[];
  targetMode: PayloadReplaceTargetMode;
  /** Message role when targeting by position; unused for paths. */
  role: 'user' | 'system' | 'developer';
  /** One-based message positions; kept as text so partial input is editable. */
  positions: string;
  /** JSON paths used when targetMode is 'paths'. */
  paths: string[];
  replacements: PayloadReplacementEntry[];
};

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

/**
 * One sensitive-word replacement entry. The backend maps a literal phrase to its
 * replacement; entries are held as an ordered list so the UI can edit them while
 * preserving the order the operator entered.
 */
export type SensitiveWordReplacementEntry = {
  id: string;
  from: string;
  to: string;
};

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  trustedProxies: string[];
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmDisableAutoUpdatePanel: boolean;
  rmPanelRepo: string;
  corsAllowedOrigins: string[];
  authDir: string;
  incognitoBrowser: boolean;
  ignoredAuthJsonPaths: string[];
  apiKeysText: string;
  debug: boolean;
  commercialMode: boolean;
  requestLog: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  redisUsageQueueRetentionSeconds: string;
  usageStatisticsEnabled: boolean;
  allowQueryApiKey: boolean;
  proxyUrl: string;
  forceModelPrefix: boolean;
  passthroughHeaders: boolean;
  enableGeminiCliEndpoint: boolean;
  disableUtls: boolean;
  disableImageGeneration: DisableImageGenerationValue;
  gptImage2BaseModel: string;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  transientErrorCooldownSeconds: string;
  authAutoRefreshWorkers: string;
  disableCooling: boolean;
  codexModelLevelCooling: boolean;
  claudeModelLevelCooling: boolean;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  antigravityConnectionPoolEnabled: boolean;
  antigravityConnectionPoolIdleConnTimeout: string;
  antigravityConnectionPoolMaxIdleConnsPerHost: string;
  devinSensitiveWords: string[];
  devinSensitiveWordsReplace: SensitiveWordReplacementEntry[];
  antigravitySensitiveWords: string[];
  antigravitySensitiveWordsReplace: SensitiveWordReplacementEntry[];
  codebuddyAiSensitiveWords: string[];
  routingStrategy: 'round-robin' | 'fill-first';
  routingSessionAffinity: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  xaiInjectXSearch: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
  payloadReplaceRules: PayloadReplaceRule[];
  streaming: StreamingConfig;
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: '',
  port: '',
  tlsEnable: false,
  tlsCert: '',
  tlsKey: '',
  trustedProxies: [],
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmDisableAutoUpdatePanel: false,
  rmPanelRepo: '',
  corsAllowedOrigins: [],
  authDir: '',
  incognitoBrowser: false,
  ignoredAuthJsonPaths: [],
  apiKeysText: '',
  debug: false,
  commercialMode: false,
  requestLog: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  errorLogsMaxFiles: '',
  redisUsageQueueRetentionSeconds: '',
  usageStatisticsEnabled: false,
  allowQueryApiKey: false,
  proxyUrl: '',
  forceModelPrefix: false,
  passthroughHeaders: false,
  enableGeminiCliEndpoint: false,
  disableUtls: false,
  disableImageGeneration: 'false',
  gptImage2BaseModel: '',
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  transientErrorCooldownSeconds: '',
  authAutoRefreshWorkers: '',
  disableCooling: false,
  codexModelLevelCooling: false,
  claudeModelLevelCooling: false,
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAntigravityCredits: true,
  antigravityConnectionPoolEnabled: false,
  antigravityConnectionPoolIdleConnTimeout: '',
  antigravityConnectionPoolMaxIdleConnsPerHost: '',
  devinSensitiveWords: [],
  devinSensitiveWordsReplace: [],
  antigravitySensitiveWords: [],
  antigravitySensitiveWordsReplace: [],
  codebuddyAiSensitiveWords: [],
  routingStrategy: 'round-robin',
  routingSessionAffinity: false,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  xaiInjectXSearch: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  payloadReplaceRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
};
