import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconBt from '@/assets/icons/bt.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconCodearts from '@/assets/icons/codearts.svg';
import iconCodebuddyAI from '@/assets/icons/codebuddy-ai.svg';
import iconCodebuddy from '@/assets/icons/codebuddy.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconCursor from '@/assets/icons/cursor.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconGitHub from '@/assets/icons/github.svg';
import iconGitLab from '@/assets/icons/gitlab.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconKilo from '@/assets/icons/kilo.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKiro from '@/assets/icons/kiro.svg';
import iconQoder from '@/assets/icons/qoder.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { oauthApi, type OAuthProvider } from '@/services/api/oauth';
import { vertexApi, type VertexImportResponse } from '@/services/api/vertex';
import { useNotificationStore, useThemeStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './OAuthPage.module.scss';

interface ProviderState {
  url?: string;
  state?: string;
  status?: 'idle' | 'waiting' | 'success' | 'error';
  error?: string;
  polling?: boolean;
  deviceCode?: string;
  projectId?: string;
  projectIdError?: string;
  callbackUrl?: string;
  callbackToken?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: 'success' | 'error';
  callbackError?: string;
  phone?: string;
  password?: string;
  authMode?: 'token' | 'oauth';
  personalAccessToken?: string;
  gitlabPersonalAccessToken?: string;
  gitlabBaseUrl?: string;
}

interface VertexImportResult {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
}

interface VertexImportState {
  file?: File;
  fileName: string;
  location: string;
  loading: boolean;
  error?: string;
  result?: VertexImportResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return typeof error === 'string' ? error : '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

const PROVIDERS: { id: OAuthProvider; titleKey: string; hintKey: string; urlLabelKey: string; icon: string | { light: string; dark: string } }[] = [
  { id: 'codex', titleKey: 'auth_login.codex_oauth_title', hintKey: 'auth_login.codex_oauth_hint', urlLabelKey: 'auth_login.codex_oauth_url_label', icon: iconCodex },
  { id: 'anthropic', titleKey: 'auth_login.anthropic_oauth_title', hintKey: 'auth_login.anthropic_oauth_hint', urlLabelKey: 'auth_login.anthropic_oauth_url_label', icon: iconClaude },
  { id: 'antigravity', titleKey: 'auth_login.antigravity_oauth_title', hintKey: 'auth_login.antigravity_oauth_hint', urlLabelKey: 'auth_login.antigravity_oauth_url_label', icon: iconAntigravity },
  { id: 'gemini-cli', titleKey: 'auth_login.gemini_cli_oauth_title', hintKey: 'auth_login.gemini_cli_oauth_hint', urlLabelKey: 'auth_login.gemini_cli_oauth_url_label', icon: iconGemini },
  { id: 'github', titleKey: 'auth_login.github_oauth_title', hintKey: 'auth_login.github_oauth_hint', urlLabelKey: 'auth_login.github_oauth_url_label', icon: iconGitHub },
  { id: 'gitlab', titleKey: 'auth_login.gitlab_oauth_title', hintKey: 'auth_login.gitlab_oauth_hint', urlLabelKey: 'auth_login.gitlab_oauth_url_label', icon: iconGitLab },
  { id: 'kilo', titleKey: 'auth_login.kilo_oauth_title', hintKey: 'auth_login.kilo_oauth_hint', urlLabelKey: 'auth_login.kilo_oauth_url_label', icon: iconKilo },
  { id: 'kiro', titleKey: 'auth_login.kiro_oauth_title', hintKey: 'auth_login.kiro_oauth_hint', urlLabelKey: 'auth_login.kiro_oauth_url_label', icon: iconKiro },
  { id: 'cursor', titleKey: 'auth_login.cursor_oauth_title', hintKey: 'auth_login.cursor_oauth_hint', urlLabelKey: 'auth_login.cursor_oauth_url_label', icon: iconCursor },
  { id: 'xai', titleKey: 'auth_login.xai_oauth_title', hintKey: 'auth_login.xai_oauth_hint', urlLabelKey: 'auth_login.xai_oauth_url_label', icon: iconGrok },
  { id: 'kimi', titleKey: 'auth_login.kimi_oauth_title', hintKey: 'auth_login.kimi_oauth_hint', urlLabelKey: 'auth_login.kimi_oauth_url_label', icon: { light: iconKimiLight, dark: iconKimiDark } },
  { id: 'qoder', titleKey: 'auth_login.qoder_oauth_title', hintKey: 'auth_login.qoder_oauth_hint', urlLabelKey: 'auth_login.qoder_oauth_url_label', icon: iconQoder },
  { id: 'codebuddy', titleKey: 'auth_login.codebuddy_oauth_title', hintKey: 'auth_login.codebuddy_oauth_hint', urlLabelKey: 'auth_login.codebuddy_oauth_url_label', icon: iconCodebuddy },
  { id: 'codebuddy-ai', titleKey: 'auth_login.codebuddy_ai_oauth_title', hintKey: 'auth_login.codebuddy_ai_oauth_hint', urlLabelKey: 'auth_login.codebuddy_ai_oauth_url_label', icon: iconCodebuddyAI },
  { id: 'codearts', titleKey: 'auth_login.codearts_oauth_title', hintKey: 'auth_login.codearts_oauth_hint', urlLabelKey: 'auth_login.codearts_oauth_url_label', icon: iconCodearts },
  { id: 'joycode', titleKey: 'auth_login.joycode_oauth_title', hintKey: 'auth_login.joycode_oauth_hint', urlLabelKey: 'auth_login.joycode_oauth_url_label', icon: iconKiro },
  { id: 'bt', titleKey: 'auth_login.bt_oauth_title', hintKey: 'auth_login.bt_oauth_hint', urlLabelKey: 'auth_login.bt_oauth_url_label', icon: iconBt }
 
];

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli', 'qoder'];
const SUCCESS_RESET_DELAY_MS = 5000;
const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace('-', '_');
const getAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;

const getIcon = (icon: string | { light: string; dark: string }, theme: 'light' | 'dark') => {
  return typeof icon === 'string' ? icon : icon[theme];
};

export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>({} as Record<OAuthProvider, ProviderState>);
  const [vertexState, setVertexState] = useState<VertexImportState>({
    fileName: '',
    location: '',
    loading: false
  });
  const pollingTimers = useRef<Partial<Record<OAuthProvider, number>>>({});
  const successResetTimers = useRef<Partial<Record<OAuthProvider, number>>>({});
  const vertexFileInputRef = useRef<HTMLInputElement | null>(null);

  const clearTimers = useCallback(() => {
    Object.values(pollingTimers.current).forEach((timer) => {
      if (timer !== undefined) window.clearInterval(timer);
    });
    Object.values(successResetTimers.current).forEach((timer) => {
      if (timer !== undefined) window.clearTimeout(timer);
    });
    pollingTimers.current = {};
    successResetTimers.current = {};
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const updateProviderState = (provider: OAuthProvider, next: Partial<ProviderState>) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? {}), ...next }
    }));
  };

  const clearPollingTimer = (provider: OAuthProvider) => {
    const timer = pollingTimers.current[provider];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete pollingTimers.current[provider];
    }
  };

  const clearSuccessResetTimer = (provider: OAuthProvider) => {
    const timer = successResetTimers.current[provider];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete successResetTimers.current[provider];
    }
  };

  const clearProviderTimers = (provider: OAuthProvider) => {
    clearPollingTimer(provider);
    clearSuccessResetTimer(provider);
  };

  const getQoderAuthMode = (providerState?: ProviderState): 'token' | 'oauth' => {
    return providerState?.authMode === 'oauth' ? 'oauth' : 'token';
  };

  const clearQoderTokenInputState = (providerState?: ProviderState): ProviderState => {
    return {
      ...providerState,
      personalAccessToken: undefined
    };
  };

  const clearQoderOAuthFlowState = (providerState?: ProviderState): ProviderState => {
    return {
      ...providerState,
      url: undefined,
      state: undefined,
      callbackUrl: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackSubmitting: false,
      deviceCode: undefined,
      polling: false
    };
  };

  const switchQoderAuthMode = (mode: 'token' | 'oauth') => {
    clearProviderTimers('qoder');
    setStates((prev) => {
      const current = prev.qoder ?? {};
      const currentMode = getQoderAuthMode(current);
      let next = current;

      if (currentMode === 'token' && mode === 'oauth') {
        next = clearQoderTokenInputState(next);
      } else if (currentMode === 'oauth' && mode === 'token') {
        next = clearQoderOAuthFlowState(next);
      }

      return {
        ...prev,
        qoder: {
          ...next,
          authMode: mode,
          status: undefined,
          error: undefined
        }
      };
    });
  };


  const resetProviderAttempt = (provider: OAuthProvider) => {
    clearProviderTimers(provider);
    if (provider === 'qoder') {
      setStates((prev) => ({
        ...prev,
        [provider]: {
          authMode: 'token'
        }
      }));
      return;
    }
    setStates((prev) => {
      const current = prev[provider] ?? {};
      const next: ProviderState = {};
      if (provider === 'gemini-cli' && current.projectId !== undefined) {
        next.projectId = current.projectId;
      }
      return {
        ...prev,
        [provider]: next
      };
    });
  };

  const completeProviderAuth = (provider: OAuthProvider) => {
    clearPollingTimer(provider);
    clearSuccessResetTimer(provider);
    updateProviderState(provider, {
      url: undefined,
      state: undefined,
      status: 'success',
      error: undefined,
      polling: false,
      callbackUrl: '',
      callbackToken: '',
      callbackSubmitting: false,
      callbackStatus: undefined,
      callbackError: undefined
    });
    successResetTimers.current[provider] = window.setTimeout(() => {
      resetProviderAttempt(provider);
    }, SUCCESS_RESET_DELAY_MS);
  };

  const startPolling = (provider: OAuthProvider, state: string) => {
    clearPollingTimer(provider);
    const timer = window.setInterval(async () => {
      try {
        const res = await oauthApi.getAuthStatus(state);
        if (res.status === 'ok') {
          completeProviderAuth(provider);
          showNotification(t(getAuthKey(provider, 'oauth_status_success')), 'success');
        } else if (res.status === 'device_code') {
          // Handle device code flow (AWS Builder ID)
          const resolvedURL = res.verification_url || res.url;
          const resolvedDeviceCode = res.user_code;
          updateProviderState(provider, {
            url: resolvedURL,
            deviceCode: resolvedDeviceCode,
            status: 'waiting',
            polling: true
          });
        } else if (res.status === 'auth_url') {
          // Handle auth URL flow (social auth)
          updateProviderState(provider, {
            url: res.url,
            status: 'waiting',
            polling: true
          });
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(
            `${t(getAuthKey(provider, 'oauth_status_error'))} ${res.error || ''}`,
            'error'
          );
          window.clearInterval(timer);
          delete pollingTimers.current[provider];
        }
      } catch (err: unknown) {
        updateProviderState(provider, { status: 'error', error: getErrorMessage(err), polling: false });
        window.clearInterval(timer);
        delete pollingTimers.current[provider];
      }
    }, 3000);
    pollingTimers.current[provider] = timer;
  };

  const startAuth = async (provider: OAuthProvider) => {
    clearProviderTimers(provider);

    if (provider === 'qoder') {
      const qoderState = states[provider];
      const qoderAuthMode = getQoderAuthMode(qoderState);

      if (qoderAuthMode === 'token') {
        const personalAccessToken = (qoderState?.personalAccessToken || '').trim();

        if (!personalAccessToken) {
          showNotification(t('auth_login.qoder_token_required'), 'warning');
          return;
        }

        updateProviderState(provider, {
          url: undefined,
          state: undefined,
          status: 'waiting',
          polling: true,
          error: undefined,
          deviceCode: undefined,
          callbackStatus: undefined,
          callbackError: undefined,
          callbackUrl: '',
          callbackToken: ''
        });

        try {
          const res = await oauthApi.qoderTokenAuth(personalAccessToken);
          if (res.status === 'ok') {
            completeProviderAuth(provider);
            showNotification(t('auth_login.qoder_token_success'), 'success');
          } else if (res.status === 'error') {
            updateProviderState(provider, { status: 'error', error: res.error, polling: false });
            showNotification(
              `${t('auth_login.qoder_token_error')}${res.error ? ` ${res.error}` : ''}`,
              'error'
            );
          }
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          updateProviderState(provider, { status: 'error', error: message, polling: false });
          showNotification(
            `${t('auth_login.qoder_token_error')}${message ? ` ${message}` : ''}`,
            'error'
          );
        }
        return;
      }
    }

    if (provider === 'bt') {
      const btState = states[provider];
      const phone = (btState?.phone || '').trim();
      const password = (btState?.password || '').trim();

      if (!phone) {
        showNotification(t('auth_login.bt_phone_required', { defaultValue: '请输入手机号' }), 'warning');
        return;
      }
      if (!password) {
        showNotification(t('auth_login.bt_password_required', { defaultValue: '请输入密码' }), 'warning');
        return;
      }

      updateProviderState(provider, {
        url: undefined,
        state: undefined,
        status: 'waiting',
        polling: true,
        error: undefined,
        deviceCode: undefined,
        callbackStatus: undefined,
        callbackError: undefined,
        callbackUrl: '',
        callbackToken: ''
      });

      try {
        const res = await oauthApi.btAuth(phone, password);
        if (res.status === 'ok') {
          completeProviderAuth(provider);
          showNotification(t('auth_login.bt_auth_success', { defaultValue: 'BT 登录成功' }), 'success');
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(res.error || t('auth_login.bt_auth_error', { defaultValue: 'BT 登录失败' }), 'error');
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        updateProviderState(provider, { status: 'error', error: message, polling: false });
        showNotification(`${t('auth_login.bt_auth_error', { defaultValue: 'BT 登录失败' })}${message ? ` ${message}` : ''}`, 'error');
      }
      return;
    }

    if (provider === 'gitlab') {
      const gitlabState = states[provider];
      const personalAccessToken = (gitlabState?.gitlabPersonalAccessToken || '').trim();
      const baseUrl = (gitlabState?.gitlabBaseUrl || '').trim();

      if (!personalAccessToken) {
        showNotification(t('auth_login.gitlab_pat_required', { defaultValue: '请输入 Personal Access Token' }), 'warning');
        return;
      }

      updateProviderState(provider, {
        url: undefined,
        state: undefined,
        status: 'waiting',
        polling: true,
        error: undefined,
        deviceCode: undefined,
        callbackStatus: undefined,
        callbackError: undefined,
        callbackUrl: '',
        callbackToken: ''
      });

      try {
        const res = await oauthApi.gitlabPATAuth(personalAccessToken, baseUrl || undefined);
        if (res.status === 'ok') {
          completeProviderAuth(provider);
          showNotification(t('auth_login.gitlab_auth_success', { defaultValue: 'GitLab 登录成功' }), 'success');
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(res.error || t('auth_login.gitlab_auth_error', { defaultValue: 'GitLab 登录失败' }), 'error');
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        updateProviderState(provider, { status: 'error', error: message, polling: false });
        showNotification(`${t('auth_login.gitlab_auth_error', { defaultValue: 'GitLab 登录失败' })}${message ? ` ${message}` : ''}`, 'error');
      }
      return;
    }

    const geminiState = provider === 'gemini-cli' ? states[provider] : undefined;
    const rawProjectId = provider === 'gemini-cli' ? (geminiState?.projectId || '').trim() : '';
    const projectId = rawProjectId
      ? rawProjectId.toUpperCase() === 'ALL'
        ? 'ALL'
        : rawProjectId
      : undefined;
    // 项目 ID 可选：留空自动选择第一个可用项目；输入 ALL 获取全部项目
    if (provider === 'gemini-cli') {
      updateProviderState(provider, { projectIdError: undefined });
    }
    updateProviderState(provider, {
      url: undefined,
      state: undefined,
      status: 'waiting',
      polling: true,
      error: undefined,
      deviceCode: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackUrl: ''
    });
    try {
      const res = await oauthApi.startAuth(
        provider,
        provider === 'gemini-cli' ? { projectId: projectId || undefined } : undefined
      );
      const resolvedURL = res.url || res.verification_url || res.verification_uri;
      const resolvedDeviceCode = res.user_code;

      if (!res.state) {
        const message = t('auth_login.missing_state');
        updateProviderState(provider, {
          url: resolvedURL,
          state: undefined,
          status: 'error',
          error: message,
          polling: false,
          deviceCode: resolvedDeviceCode
        });
        showNotification(message, 'error');
        return;
      }

      updateProviderState(provider, {
        url: resolvedURL,
        state: res.state,
        status: 'waiting',
        polling: true,
        deviceCode: resolvedDeviceCode
      });
      startPolling(provider, res.state);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      updateProviderState(provider, { status: 'error', error: message, polling: false });
      showNotification(
        `${t(getAuthKey(provider, 'oauth_start_error'))}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    const copied = await copyToClipboard(url);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const submitCallback = async (provider: OAuthProvider) => {
    const redirectUrl = (states[provider]?.callbackUrl || '').trim();
    if (!redirectUrl) {
      showNotification(t('auth_login.oauth_callback_required'), 'warning');
      return;
    }
    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined
    });
    try {
      await oauthApi.submitCallback(provider, redirectUrl);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.oauth_callback_success'), 'success');
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      const errorMessage =
        status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
            defaultValue: 'Please update CLI Proxy API or check the connection.'
          })
          : message || undefined;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.oauth_callback_error')} ${errorMessage}`
        : t('auth_login.oauth_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const submitXaiCallbackToken = async () => {
    const provider: OAuthProvider = 'xai';
    const state = (states[provider]?.state || '').trim();
    const code = (states[provider]?.callbackToken || '').trim();

    if (!code) {
      showNotification(t('auth_login.xai_callback_required'), 'warning');
      return;
    }
    if (!state) {
      showNotification(t('auth_login.missing_state'), 'error');
      return;
    }

    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined
    });

    try {
      await oauthApi.submitCode(provider, state, code);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.xai_callback_success'), 'success');
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      const errorMessage =
        status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
            defaultValue: 'Please update CLI Proxy API or check the connection.'
          })
          : message || undefined;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.xai_callback_error')} ${errorMessage}`
        : t('auth_login.xai_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const handleVertexFilePick = () => {
    vertexFileInputRef.current?.click();
  };

  const handleVertexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showNotification(t('vertex_import.file_required'), 'warning');
      event.target.value = '';
      return;
    }
    setVertexState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: undefined,
      result: undefined
    }));
    event.target.value = '';
  };

  const handleVertexImport = async () => {
    if (!vertexState.file) {
      const message = t('vertex_import.file_required');
      setVertexState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }
    const location = vertexState.location.trim();
    setVertexState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res: VertexImportResponse = await vertexApi.importCredential(
        vertexState.file,
        location || undefined
      );
      const result: VertexImportResult = {
        projectId: res.project_id,
        email: res.email,
        location: res.location,
        authFile: res['auth-file'] ?? res.auth_file
      };
      setVertexState((prev) => ({ ...prev, loading: false, result }));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setVertexState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed')
      }));
      const notification = message
        ? `${t('notification.upload_failed')}: ${message}`
        : t('notification.upload_failed');
      showNotification(notification, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth', { defaultValue: 'OAuth' })}</h1>

      <div className={styles.content}>
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] || {};
          const isQoder = provider.id === 'qoder';
          const qoderAuthMode = isQoder ? getQoderAuthMode(state) : undefined;
          const isQoderTokenMode = qoderAuthMode === 'token';
          const isQoderOAuthMode = qoderAuthMode === 'oauth';
          const canSubmitCallback =
            CALLBACK_SUPPORTED.includes(provider.id) && Boolean(state.url) && (!isQoder || isQoderOAuthMode);
          const canSubmitXaiCallbackToken = provider.id === 'xai' && Boolean(state.state);
          const loginButtonLabel =
            state.status === 'success'
              ? t('auth_login.login_another_account')
              : isQoderTokenMode
                ? t('auth_login.qoder_token_button', { defaultValue: '使用 Token 登录' })
                : t(getAuthKey(provider.id, 'oauth_button'));
          const statusBadgeClassName = [
            'status-badge',
            state.status === 'success' ? 'success' : '',
            state.status === 'error' ? 'error' : ''
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={provider.id}>
              <Card
                title={
                  <span className={styles.cardTitle}>
                    <img
                      src={getIcon(provider.icon, resolvedTheme)}
                      alt=""
                      className={styles.cardTitleIcon}
                    />
                    {t(provider.titleKey)}
                  </span>
                }
                extra={
                  <Button onClick={() => startAuth(provider.id)} loading={state.polling}>
                    {loginButtonLabel}
                  </Button>
                }
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardHint}>
                    {isQoderTokenMode
                      ? t('auth_login.qoder_token_hint', {
                        defaultValue: '请输入 Qoder Personal Access Token 直接完成登录；切换到 OAuth 模式可继续使用原有授权流程。'
                      })
                      : t(provider.hintKey)}
                  </div>
                  {isQoder && (
                    <div className={styles.qoderModeField}>
                      <label className={styles.formItemLabel} htmlFor="qoder-auth-mode">
                        {t('auth_login.qoder_auth_mode_label', { defaultValue: '认证方式' })}
                      </label>
                      <Select
                        id="qoder-auth-mode"
                        value={qoderAuthMode || 'token'}
                        options={[
                          {
                            value: 'token',
                            label: t('auth_login.qoder_auth_mode_token', { defaultValue: 'Token' })
                          },
                          {
                            value: 'oauth',
                            label: t('auth_login.qoder_auth_mode_oauth', { defaultValue: 'OAuth' })
                          }
                        ]}
                        disabled={Boolean(state.polling || state.callbackSubmitting)}
                        ariaLabel={t('auth_login.qoder_auth_mode_label', { defaultValue: '认证方式' })}
                        onChange={(value) => switchQoderAuthMode(value as 'token' | 'oauth')}
                      />
                      <div className={styles.cardHintSecondary}>
                        {t('auth_login.qoder_auth_mode_hint', {
                          defaultValue: 'Token 模式适合直接粘贴 Personal Access Token；OAuth 模式保留浏览器授权与回调流程。'
                        })}
                      </div>
                    </div>
                  )}
                  {isQoderTokenMode && (
                    <div className={styles.qoderTokenField}>
                      <Input
                        type="password"
                        label={t('auth_login.qoder_token_label', {
                          defaultValue: 'Personal Access Token'
                        })}
                        hint={t('auth_login.qoder_token_input_hint', {
                          defaultValue: '请输入您的 Qoder Personal Access Token。'
                        })}
                        value={state.personalAccessToken || ''}
                        disabled={Boolean(state.polling || state.callbackSubmitting)}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            personalAccessToken: e.target.value,
                            status: undefined,
                            error: undefined
                          })
                        }
                        placeholder={t('auth_login.qoder_token_placeholder', {
                          defaultValue: '请输入 Personal Access Token'
                        })}
                      />
                    </div>
                  )}
                  {provider.id === 'gemini-cli' && (
                    <div className={styles.geminiProjectField}>
                      <Input
                        label={t('auth_login.gemini_cli_project_id_label')}
                        hint={t('auth_login.gemini_cli_project_id_hint')}
                        value={state.projectId || ''}
                        error={state.projectIdError}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            projectId: e.target.value,
                            projectIdError: undefined
                          })
                        }
                        placeholder={t('auth_login.gemini_cli_project_id_placeholder')}
                      />
                    </div>
                  )}
                  {provider.id === 'bt' && (
                    <div className={styles.btAuthFields}>
                      <Input
                        type="tel"
                        label={t('auth_login.bt_phone_label', { defaultValue: '手机号' })}
                        hint={t('auth_login.bt_phone_hint', { defaultValue: '请输入您的 BT 账号手机号' })}
                        value={state.phone || ''}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, { phone: e.target.value })
                        }
                        placeholder={t('auth_login.bt_phone_placeholder', { defaultValue: '请输入手机号' })}
                      />
                      <Input
                        type="password"
                        label={t('auth_login.bt_password_label', { defaultValue: '密码' })}
                        hint={t('auth_login.bt_password_hint', { defaultValue: '请输入您的 BT 账号密码' })}
                        value={state.password || ''}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, { password: e.target.value })
                        }
                        placeholder={t('auth_login.bt_password_placeholder', { defaultValue: '请输入密码' })}
                      />
                    </div>
                  )}
                  {provider.id === 'gitlab' && (
                    <div className={styles.gitlabAuthFields}>
                      <Input
                        type="password"
                        label={t('auth_login.gitlab_pat_label', { defaultValue: 'Personal Access Token' })}
                        hint={t('auth_login.gitlab_pat_hint', { defaultValue: '请输入您的 GitLab 个人访问令牌' })}
                        value={state.gitlabPersonalAccessToken || ''}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, { gitlabPersonalAccessToken: e.target.value })
                        }
                        placeholder={t('auth_login.gitlab_pat_placeholder', { defaultValue: '请输入 Personal Access Token' })}
                      />
                      <Input
                        label={t('auth_login.gitlab_base_url_label', { defaultValue: 'GitLab 地址 (可选)' })}
                        hint={t('auth_login.gitlab_base_url_hint', { defaultValue: '自定义 GitLab 地址，留空默认使用 https://gitlab.com' })}
                        value={state.gitlabBaseUrl || ''}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, { gitlabBaseUrl: e.target.value })
                        }
                        placeholder={t('auth_login.gitlab_base_url_placeholder', { defaultValue: 'https://gitlab.com' })}
                      />
                    </div>
                  )}
                  {(!isQoder || isQoderOAuthMode) && state.url && (
                    <div className={styles.authUrlBox}>
                      <div className={styles.authUrlLabel}>{t(provider.urlLabelKey)}</div>
                      <div className={styles.authUrlValue}>{state.url}</div>
                      {state.deviceCode && (
                        <div className={styles.authUrlDeviceCode}>
                          <div className={styles.authUrlDeviceCodeLabel}>设备码</div>
                          <div className={styles.authUrlDeviceCodeValue}>{state.deviceCode}</div>
                        </div>
                      )}
                      <div className={styles.authUrlActions}>
                        <Button variant="secondary" size="sm" onClick={() => copyLink(state.url!)}>
                          {t(getAuthKey(provider.id, 'copy_link'))}
                        </Button>
                        {state.deviceCode && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const copied = await copyToClipboard(state.deviceCode!);
                              showNotification(
                                t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
                                copied ? 'success' : 'error'
                              );
                            }}
                          >
                            复制设备码
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
                        >
                          {t(getAuthKey(provider.id, 'open_link'))}
                        </Button>
                      </div>
                    </div>
                  )}
                  {canSubmitXaiCallbackToken && (
                    <div className={styles.callbackSection}>
                      <Input
                        label={t('auth_login.xai_callback_label')}
                        hint={t('auth_login.xai_callback_hint')}
                        placeholder={t('auth_login.xai_callback_placeholder')}
                        value={state.callbackToken || ''}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            callbackToken: e.target.value,
                            callbackStatus: undefined,
                            callbackError: undefined
                          })
                        }
                      />
                      <div className={styles.callbackActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={submitXaiCallbackToken}
                          loading={state.callbackSubmitting}
                        >
                          {t('auth_login.xai_callback_button')}
                        </Button>
                      </div>
                      {state.callbackStatus === 'success' && state.status === 'waiting' && (
                        <div className="status-badge success">
                          {t('auth_login.xai_callback_status_success')}
                        </div>
                      )}
                      {state.callbackStatus === 'error' && (
                        <div className="status-badge error">
                          {t('auth_login.xai_callback_status_error')} {state.callbackError || ''}
                        </div>
                      )}
                    </div>
                  )}
                  {canSubmitCallback && (
                    <div className={styles.callbackSection}>
                      <Input
                        label={t('auth_login.oauth_callback_label')}
                        hint={t(provider.id === 'qoder' ? 'auth_login.oauth_callback_qoder_hint' : 'auth_login.oauth_callback_hint')}
                        placeholder={t(provider.id === 'qoder' ? 'auth_login.oauth_callback_qoder_placeholder' : 'auth_login.oauth_callback_placeholder')}
                        value={state.callbackUrl || ''}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            callbackUrl: e.target.value,
                            callbackStatus: undefined,
                            callbackError: undefined
                          })
                        }
                      />
                      <div className={styles.callbackActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => submitCallback(provider.id)}
                          loading={state.callbackSubmitting}
                        >
                          {t('auth_login.oauth_callback_button')}
                        </Button>
                      </div>
                      {state.callbackStatus === 'success' && state.status === 'waiting' && (
                        <div className="status-badge success">
                          {t('auth_login.oauth_callback_status_success')}
                        </div>
                      )}
                      {state.callbackStatus === 'error' && (
                        <div className="status-badge error">
                          {t('auth_login.oauth_callback_status_error')} {state.callbackError || ''}
                        </div>
                      )}
                    </div>
                  )}
                  {state.status && state.status !== 'idle' && (
                    <div className={statusBadgeClassName}>
                      {state.status === 'success'
                        ? t(getAuthKey(provider.id, 'oauth_status_success'))
                        : state.status === 'error'
                          ? `${t(getAuthKey(provider.id, 'oauth_status_error'))} ${state.error || ''}`
                          : t(getAuthKey(provider.id, 'oauth_status_waiting'))}
                    </div>
                  )}
                  {state.status === 'success' && (
                    <div className={styles.successActions}>
                      <Button variant="secondary" size="sm" onClick={() => navigate('/auth-files')}>
                        {t('auth_login.view_auth_files')}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })}

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
              {t('vertex_import.title')}
            </span>
          }
          extra={
            <Button onClick={handleVertexImport} loading={vertexState.loading}>
              {t('vertex_import.import_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('vertex_import.description')}</div>
            <Input
              label={t('vertex_import.location_label')}
              hint={t('vertex_import.location_hint')}
              value={vertexState.location}
              onChange={(e) =>
                setVertexState((prev) => ({
                  ...prev,
                  location: e.target.value
                }))
              }
              placeholder={t('vertex_import.location_placeholder')}
            />
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('vertex_import.file_label')}</label>
              <div className={styles.filePicker}>
                <Button variant="secondary" size="sm" onClick={handleVertexFilePick}>
                  {t('vertex_import.choose_file')}
                </Button>
                <div
                  className={`${styles.fileName} ${vertexState.fileName ? '' : styles.fileNamePlaceholder
                    }`.trim()}
                >
                  {vertexState.fileName || t('vertex_import.file_placeholder')}
                </div>
              </div>
              <div className={styles.cardHintSecondary}>{t('vertex_import.file_hint')}</div>
              <input
                ref={vertexFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleVertexFileChange}
              />
            </div>
            {vertexState.error && (
              <div className="status-badge error">
                {vertexState.error}
              </div>
            )}
            {vertexState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>{t('vertex_import.result_title')}</div>
                <div className={styles.keyValueList}>
                  {vertexState.result.projectId && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_project')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.projectId}</span>
                    </div>
                  )}
                  {vertexState.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_email')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.email}</span>
                    </div>
                  )}
                  {vertexState.result.location && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_location')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.location}</span>
                    </div>
                  )}
                  {vertexState.result.authFile && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_file')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.authFile}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
