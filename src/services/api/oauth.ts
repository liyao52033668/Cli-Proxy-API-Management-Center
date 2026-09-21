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
  | 'xai'
  | 'commandcode'
  | 'devin'
  | 'freebuff'
  | 'lobsterai'
  | 'alysis'
  | 'meta';

export interface OAuthStartResponse {
  status?: 'ok' | 'wait' | 'error' | 'device_code';
  url: string;
  state?: string;
  user_code?: string;
  verification_url?: string;
  verification_uri?: string;
  flow?: string;
  expires_in?: number;
}

export interface OAuthCallbackResponse {
  status: 'ok';
  /**
   * CodeArts remote-deployment flow: the pasted callback URL carries a nested
   * redirect back to the provider that still has to be opened in the same
   * browser that authorized, because it relies on that browser's session.
   */
  finalize_url?: string;
}

interface BasicTokenAuthResponse {
  status: 'ok' | 'error';
  error?: string;
}

export type BTAuthResponse = BasicTokenAuthResponse;

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

export type QoderTokenAuthResponse = BasicTokenAuthResponse;

export interface CodeArtsAKSKResponse {
  status: 'ok' | 'error';
  error?: string;
  saved_path?: string;
  user_name?: string;
  user_id?: string;
  token_label?: string;
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
  'xai',
  'commandcode',
  'devin',
  'freebuff',
  'lobsterai',
  'alysis',
  'meta'
];
const CALLBACK_PROVIDER_MAP: Partial<Record<OAuthProvider, string>> = {
  'gemini-cli': 'gemini'
};

export interface OAuthSessionCancelResponse {
  status: 'ok';
  /** False when the state was unknown or the attempt had already finished. */
  cancelled: boolean;
}

export interface StartAuthOptions {
  projectId?: string;
  signal?: AbortSignal;
}

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AbortSignal).aborted === 'boolean';

/**
 * Attaches an abort signal only when the caller supplied one, so the request
 * options stay untouched for every existing call site.
 */
const withSignal = <T extends Record<string, unknown>>(
  config: T,
  signal?: AbortSignal
): T | (T & { signal: AbortSignal }) => (signal ? { ...config, signal } : config);

export const oauthApi = {
  startAuth: (provider: OAuthProvider, optionsOrSignal?: StartAuthOptions | AbortSignal) => {
    const options = isAbortSignal(optionsOrSignal) ? undefined : optionsOrSignal;
    const signal = isAbortSignal(optionsOrSignal) ? optionsOrSignal : optionsOrSignal?.signal;
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    if (provider === 'gemini-cli' && options?.projectId) {
      params.project_id = options.projectId;
    }
    return apiClient.get<OAuthStartResponse>(
      `/${provider}-auth-url`,
      withSignal({ params: Object.keys(params).length ? params : undefined }, signal)
    );
  },

  getAuthStatus: (state: string, signal?: AbortSignal) =>
    apiClient.get<{
      status: 'ok' | 'wait' | 'error' | 'device_code' | 'auth_url';
      error?: string;
      verification_url?: string;
      user_code?: string;
      url?: string;
    }>(`/get-auth-status`, withSignal({ params: { state } }, signal)),

  /**
   * Third argument carries either the attempt state (to bind the callback to a
   * login started from this panel) or an AbortSignal for the request.
   */
  submitCallback: (
    provider: OAuthProvider,
    redirectUrl: string,
    stateOrSignal?: string | AbortSignal
  ) => {
    const state = typeof stateOrSignal === 'string' ? stateOrSignal : undefined;
    const signal = typeof stateOrSignal === 'string' ? undefined : stateOrSignal;
    const callbackProvider = CALLBACK_PROVIDER_MAP[provider] ?? provider;
    const body: Record<string, string> = {
      provider: callbackProvider,
      redirect_url: redirectUrl
    };
    if (state) {
      body.state = state;
    }
    return apiClient.post<OAuthCallbackResponse>(
      '/oauth-callback',
      body,
      signal ? { signal } : undefined
    );
  },

  /**
   * Aborts a login that is still waiting for authorization. The server drops the
   * pending session, so a retry started afterwards is not rejected as a duplicate.
   */
  cancelSession: (state: string, signal?: AbortSignal) =>
    apiClient.delete<OAuthSessionCancelResponse>(
      '/oauth-session',
      withSignal({ params: { state } }, signal)
    ),

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
  },

  qoderTokenAuth: (personalAccessToken: string) => {
    return apiClient.post<QoderTokenAuthResponse>('/qoder-auth-url', {
      personal_access_token: personalAccessToken
    });
  },

  commandCodeTokenAuth: (apiKey: string) => {
    return apiClient.post<BasicTokenAuthResponse>('/commandcode-auth-url', {
      api_key: apiKey
    });
  },

  /**
   * CodeArts 永久 IAM AK/SK 授权。相比 OAuth 流程，凭据不会在 24 小时后过期。
   */
  codeartsAKSKAuth: (ak: string, sk: string) => {
    return apiClient.post<CodeArtsAKSKResponse>('/codearts-auth-url', {
      ak,
      sk
    });
  }
};

