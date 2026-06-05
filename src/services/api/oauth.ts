/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider =
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'gemini-cli'
  | 'kimi'
  | 'gitlab'
  | 'kilo'
  | 'iflow'
  | 'kiro'
  | 'cursor'
  | 'github'
  | 'qoder'
  | 'codebuddy'
  | 'codebuddy-ai'
  | 'codearts'
  | 'bt'
  | 'joycode'
  | 'xai';

export interface OAuthStartResponse {
  status?: 'ok' | 'wait' | 'error' | 'device_code';
  url: string;
  state?: string;
  user_code?: string;
  verification_url?: string;
  verification_uri?: string;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface BTAuthResponse {
  status: 'ok' | 'error';
  error?: string;
}

export interface GitLabPATResponse {
  status: 'ok' | 'error';
  error?: string;
  saved_path?: string;
  username?: string;
  email?: string;
  token_label?: string;
  model_provider?: string;
  model_name?: string;
}

const WEBUI_SUPPORTED: OAuthProvider[] = [
  'codex',
  'anthropic',
  'antigravity',
  'gemini-cli',
  'kimi',
  'gitlab',
  'kilo',
  'iflow',
  'kiro',
  'cursor',
  'github',
  'qoder',
  'codebuddy',
  'codebuddy-ai',
  'codearts',
  'bt',
  'joycode',
  'xai'
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini'
};

export const oauthApi = {
  startAuth: (provider: OAuthProvider, options?: { projectId?: string; planType?: string }) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    if (provider === 'github' && options?.planType) {
      params.plan_type = options.planType;
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined
    });
  },

  getAuthStatus: (state: string) =>
    apiClient.get<{
      status: 'ok' | 'wait' | 'error' | 'device_code' | 'auth_url';
      error?: string;
      verification_url?: string;
      user_code?: string;
      url?: string;
    }>(`/get-auth-status`, {
      params: { state }
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: callbackProvider,
      redirect_url: redirectUrl
    });
  },

  submitCode: (provider: OAuthProvider, state: string, code: string) => {
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider: callbackProvider,
      state,
      code
    });
  },

  btAuth: (phone: string, password: string) => {
    return apiClient.post<BTAuthResponse>('/bt-auth-url', {
      phone,
      password
    });
  },

  gitlabPATAuth: (personalAccessToken: string, baseUrl?: string) => {
    return apiClient.post<GitLabPATResponse>('/gitlab-auth-url', {
      personal_access_token: personalAccessToken,
      base_url: baseUrl
    });
  }
};
