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
  | 'streaming.keepaliveSeconds'
  | 'streaming.bootstrapRetries'
  | 'streaming.nonstreamKeepaliveInterval';

export type DisableImageGenerationValue = 'false' | 'true' | 'chat';

export type VisualConfigValidationErrorCode = 'port_range' | 'non_negative_integer';

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

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export type VisualConfigValues = {
  host: string;
  port: string;
  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;
  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmDisableAutoUpdatePanel: boolean;
  rmPanelRepo: string;
  authDir: string;
  ignoredAuthJsonPaths: string[];
  apiKeysText: string;
  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  redisUsageQueueRetentionSeconds: string;
  usageStatisticsEnabled: boolean;
  proxyUrl: string;
  forceModelPrefix: boolean;
  passthroughHeaders: boolean;
  enableGeminiCliEndpoint: boolean;
  disableImageGeneration: DisableImageGenerationValue;
  requestRetry: string;
  maxRetryCredentials: string;
  maxRetryInterval: string;
  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;
  quotaAntigravityCredits: boolean;
  routingStrategy: 'round-robin' | 'fill-first';
  routingSessionAffinity: boolean;
  routingSessionAffinityTTL: string;
  wsAuth: boolean;
  payloadDefaultRules: PayloadRule[];
  payloadDefaultRawRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadOverrideRawRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];
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
  rmAllowRemote: false,
  rmSecretKey: '',
  rmDisableControlPanel: false,
  rmDisableAutoUpdatePanel: false,
  rmPanelRepo: '',
  authDir: '',
  ignoredAuthJsonPaths: [],
  apiKeysText: '',
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: '',
  errorLogsMaxFiles: '',
  redisUsageQueueRetentionSeconds: '',
  usageStatisticsEnabled: false,
  proxyUrl: '',
  forceModelPrefix: false,
  passthroughHeaders: false,
  enableGeminiCliEndpoint: false,
  disableImageGeneration: 'false',
  requestRetry: '',
  maxRetryCredentials: '',
  maxRetryInterval: '',
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  quotaAntigravityCredits: true,
  routingStrategy: 'round-robin',
  routingSessionAffinity: false,
  routingSessionAffinityTTL: '',
  wsAuth: false,
  payloadDefaultRules: [],
  payloadDefaultRawRules: [],
  payloadOverrideRules: [],
  payloadOverrideRawRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: '',
    bootstrapRetries: '',
    nonstreamKeepaliveInterval: '',
  },
};
