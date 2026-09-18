import { describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import { oauthApi, type OAuthProvider } from '@/services/api/oauth';

describe('Alysis device-code OAuth contract', () => {
  test('starts the Alysis device flow through the web UI mode', async () => {
    const provider: OAuthProvider = 'alysis';
    const response = {
      status: 'ok',
      url: 'https://alysiscode.com/activate?code=ABCD-EFGH',
      state: 'alysis-1',
      user_code: 'ABCD-EFGH',
      flow: 'device',
      expires_in: 900,
    };
    const get = spyOn(apiClient, 'get').mockResolvedValue(response);
    try {
      expect(await oauthApi.startAuth(provider)).toEqual(response);
      expect(get).toHaveBeenCalledWith('/alysis-auth-url', { params: { is_webui: true } });
    } finally {
      get.mockRestore();
    }
  });

  test('polls using only the original attempt state', async () => {
    const get = spyOn(apiClient, 'get').mockResolvedValue({ status: 'wait' });
    try {
      expect(await oauthApi.getAuthStatus('alysis-1')).toEqual({ status: 'wait' });
      expect(get).toHaveBeenCalledWith('/get-auth-status', { params: { state: 'alysis-1' } });
    } finally {
      get.mockRestore();
    }
  });

  test('cancels a pending device login with the original state', async () => {
    const remove = spyOn(apiClient, 'delete').mockResolvedValue({ status: 'ok', cancelled: true });
    try {
      expect(await oauthApi.cancelSession('alysis-1')).toEqual({ status: 'ok', cancelled: true });
      expect(remove).toHaveBeenCalledWith('/oauth-session', { params: { state: 'alysis-1' } });
    } finally {
      remove.mockRestore();
    }
  });

  test('forwards attempt abort signals to every Alysis request', async () => {
    const signal = new AbortController().signal;
    const get = spyOn(apiClient, 'get').mockResolvedValue({});
    const remove = spyOn(apiClient, 'delete').mockResolvedValue({});
    try {
      await oauthApi.startAuth('alysis', signal);
      expect(get).toHaveBeenLastCalledWith('/alysis-auth-url', {
        params: { is_webui: true },
        signal,
      });
      await oauthApi.getAuthStatus('alysis-1', signal);
      expect(get).toHaveBeenLastCalledWith('/get-auth-status', {
        params: { state: 'alysis-1' },
        signal,
      });
      await oauthApi.cancelSession('alysis-1', signal);
      expect(remove).toHaveBeenCalledWith('/oauth-session', {
        params: { state: 'alysis-1' },
        signal,
      });
    } finally {
      get.mockRestore();
      remove.mockRestore();
    }
  });
});
