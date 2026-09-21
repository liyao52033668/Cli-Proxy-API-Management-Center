import { describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthPage } from '@/pages/OAuthPage';
import { apiClient } from '@/services/api/client';
import { oauthApi } from '@/services/api/oauth';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

describe('Alysis OAuth login UI', () => {
  test('renders a built-in device-flow login card with its hint', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(OAuthPage))
      )
    );
    expect(markup).toContain('Alysis Code OAuth');
    expect(markup).toContain('Start Alysis Login');
    expect(markup).not.toContain('auth_login.alysis_');
  });

  test('supplies every Alysis label and hint in all four languages', () => {
    const keys = Object.keys(en.auth_login).filter((key) => key.startsWith('alysis_'));
    // title, button, hint, url_label, three status strings, start_error, copy_link, open_link.
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.auth_login as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      expect(locale.auth_files.filter_alysis).toBe('Alysis Code');
    }
  });
});

describe('Alysis device flow keeps the callback UI out', () => {
  test('starts through the management device-flow endpoint, not a pasted callback', async () => {
    const get = spyOn(apiClient, 'get').mockResolvedValue({
      status: 'ok',
      url: 'https://alysiscode.com/activate?code=ABCD-EFGH',
      state: 'alysis-1',
      user_code: 'ABCD-EFGH',
    });
    try {
      await oauthApi.startAuth('alysis');
      expect(get).toHaveBeenCalledWith('/alysis-auth-url', { params: { is_webui: true } });
      expect(get).not.toHaveBeenCalledWith('/oauth-callback', expect.anything());
    } finally {
      get.mockRestore();
    }
  });
});
