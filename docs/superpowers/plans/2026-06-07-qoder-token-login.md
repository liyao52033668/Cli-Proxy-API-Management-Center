# Qoder Token Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 Qoder OAuth 备用流程的前提下，为 OAuth 页面中的 Qoder 卡片新增个人令牌登录模式。

**Architecture:** 只在 `src/pages/OAuthPage.tsx` 和 `src/services/api/oauth.ts` 上做局部增强：为 Qoder 增加 `token | oauth` 模式切换，在 token 模式下调用新的 `POST /qoder-auth-url` API，在 oauth 模式下继续复用现有 `GET /qoder-auth-url`、轮询和回调逻辑。由于当前仓库没有测试脚本，本计划用 `npm run type-check`、`npm run lint` 和浏览器手工验证代替自动化测试，同时保持每个任务都能独立验证。

**Tech Stack:** React 19、TypeScript、Vite、Zustand、i18next、SCSS Modules、Axios

---

## File Map

- **Modify:** `src/services/api/oauth.ts:27-137`
  - 为 Qoder 个人令牌登录增加响应类型与 `qoderTokenAuth` API 方法。
- **Modify:** `src/pages/OAuthPage.tsx:32-51`
  - 为 Qoder 增加 `authMode` 和 `personalAccessToken` 状态字段。
- **Modify:** `src/pages/OAuthPage.tsx:154-218`
  - 增加 Qoder 模式切换后的状态清理与成功收尾兼容逻辑。
- **Modify:** `src/pages/OAuthPage.tsx:263-418`
  - 在 `startAuth` 中增加 Qoder token 模式分支，并保留旧 OAuth 分支。
- **Modify:** `src/pages/OAuthPage.tsx:573-835`
  - 为 Qoder 卡片增加模式切换 UI，并按模式渲染不同表单。
- **Modify:** `src/pages/OAuthPage.module.scss:103-214`
  - 为模式切换和 Qoder token 表单增加局部样式。
- **Modify:** `src/i18n/locales/zh-CN.json:1076-1086`
  - 增加 Qoder token 模式相关中文文案。
- **Modify:** `src/i18n/locales/en.json:1076-1086`
  - 增加 Qoder token 模式相关英文文案。
- **Optional follow-through:** `src/i18n/locales/zh-TW.json:1102-1112`, `src/i18n/locales/ru.json:1073-1083`
  - 若项目要求所有已支持语言同步完整文案，则补齐同名键值，先用英文或简体中文作为临时文案，避免缺 key。

## Pre-flight Notes

- 当前仓库没有 `npm test` 或单测工具链，不能凭空添加测试框架；执行时以类型检查、lint 和浏览器验证为主。
- `OAuthPage.tsx` 已经包含 GitLab PAT 和 BT 账号密码登录分支，Qoder token 分支应沿用同样的“前端校验 + API 调用 + 成功态复用”模式，不要把页面重构成通用登录引擎。
- `completeProviderAuth()` 已经统一处理成功后的 badge、通知后续状态复位和“查看认证文件”按钮，不要重复实现成功收尾。

### Task 1: 扩展 Qoder API 层

**Files:**
- Modify: `src/services/api/oauth.ts:27-137`
- Verify: `npm run type-check`

- [ ] **Step 1: 为 Qoder token 登录补充响应类型和 API 方法草稿**

```ts
export interface QoderTokenAuthResponse {
  status: 'ok' | 'error';
  error?: string;
}

export const oauthApi = {
  // ...existing methods...

  qoderTokenAuth: (personalAccessToken: string) => {
    return apiClient.post<QoderTokenAuthResponse>('/qoder-auth-url', {
      personal_access_token: personalAccessToken
    });
  }
};
```

- [ ] **Step 2: 运行类型检查确认当前 API 文件无语法或导出错误**

Run: `npm run type-check`

Expected: `tsc --noEmit` completes with no errors from `src/services/api/oauth.ts`.

- [ ] **Step 3: 复查接口边界，确保没有误改现有 OAuth 调用**

核对 `oauthApi.startAuth()` 仍然保持：

```ts
return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
  params: Object.keys(params).length ? params : undefined
});
```

同时确保新的 token 方法独立存在，不复用 `startAuth('qoder')`。

- [ ] **Step 4: 再次运行类型检查，确认 API 层可供页面消费**

Run: `npm run type-check`

Expected: no TypeScript errors.

- [ ] **Step 5: 提交这个最小 API 变更**

```bash
git add src/services/api/oauth.ts
git commit -m "feat: add qoder token auth api"
```

### Task 2: 为 Qoder 增加模式状态与切换清理逻辑

**Files:**
- Modify: `src/pages/OAuthPage.tsx:32-51`
- Modify: `src/pages/OAuthPage.tsx:154-218`
- Verify: `npm run type-check`

- [ ] **Step 1: 扩展 `ProviderState`，只为 Qoder 预留模式和 token 字段**

```ts
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
  gitlabPersonalAccessToken?: string;
  gitlabBaseUrl?: string;
  githubCopilotPlanType?: string;
  authMode?: 'token' | 'oauth';
  personalAccessToken?: string;
}
```

- [ ] **Step 2: 增加 Qoder 专用的模式默认值和状态清理辅助函数**

把下面这些辅助函数加在 `updateProviderState()` 和 `startAuth()` 之间，避免把清理逻辑散在 JSX 中：

```ts
const getQoderAuthMode = (state?: ProviderState) => state?.authMode || 'token';

const resetQoderTokenState = (state: ProviderState): ProviderState => ({
  ...state,
  personalAccessToken: '',
  status: undefined,
  error: undefined,
  polling: false
});

const resetQoderOAuthState = (state: ProviderState): ProviderState => ({
  ...state,
  url: undefined,
  state: undefined,
  status: undefined,
  error: undefined,
  polling: false,
  deviceCode: undefined,
  callbackUrl: '',
  callbackSubmitting: false,
  callbackStatus: undefined,
  callbackError: undefined
});
```

- [ ] **Step 3: 增加模式切换函数，在切换到 token 前先停掉 Qoder 轮询**

```ts
const switchQoderAuthMode = (mode: 'token' | 'oauth') => {
  clearProviderTimers('qoder');
  setStates((prev) => {
    const current = prev.qoder ?? {};
    const next = mode === 'token'
      ? resetQoderOAuthState(current)
      : resetQoderTokenState(current);

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
```

- [ ] **Step 4: 保证 `resetProviderAttempt('qoder')` 不会把模式重置回空值**

把 `resetProviderAttempt()` 中的 `next` 构造改成保留 Qoder 模式：

```ts
const next: ProviderState = {};

if (provider === 'qoder' && current.authMode !== undefined) {
  next.authMode = current.authMode;
}
```

如果希望成功后始终回到 token 模式，则改成：

```ts
if (provider === 'qoder') {
  next.authMode = 'token';
}
```

本计划采用第二种，和设计文档里“默认进入 token 模式”保持一致。

- [ ] **Step 5: 跑类型检查验证辅助函数和状态字段都可编译**

Run: `npm run type-check`

Expected: no TypeScript errors around `ProviderState`, `switchQoderAuthMode`, or `resetProviderAttempt`.

- [ ] **Step 6: 提交状态模型变更**

```bash
git add src/pages/OAuthPage.tsx
git commit -m "feat: add qoder auth mode state"
```

### Task 3: 在 `startAuth` 中接入 Qoder token 分支

**Files:**
- Modify: `src/pages/OAuthPage.tsx:263-418`
- Verify: `npm run type-check`

- [ ] **Step 1: 在 `startAuth` 入口前读取 Qoder 当前模式**

在 `startAuth()` 一开始、`clearProviderTimers(provider);` 之后加入：

```ts
const providerState = states[provider];
const qoderAuthMode = provider === 'qoder' ? getQoderAuthMode(providerState) : undefined;
```

- [ ] **Step 2: 在 BT 和 GitLab 分支之前插入 Qoder token 分支**

```ts
if (provider === 'qoder' && qoderAuthMode === 'token') {
  const personalAccessToken = (providerState?.personalAccessToken || '').trim();

  if (!personalAccessToken) {
    showNotification(
      t('auth_login.qoder_token_required', {
        defaultValue: '请输入 Personal Access Token'
      }),
      'warning'
    );
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
      showNotification(
        t('auth_login.qoder_token_success', {
          defaultValue: 'Qoder 登录成功'
        }),
        'success'
      );
    } else {
      updateProviderState(provider, {
        status: 'error',
        error: res.error,
        polling: false
      });
      showNotification(
        res.error ||
          t('auth_login.qoder_token_error', {
            defaultValue: 'Qoder 登录失败'
          }),
        'error'
      );
    }
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    updateProviderState(provider, {
      status: 'error',
      error: message,
      polling: false
    });
    showNotification(
      `${t('auth_login.qoder_token_error', {
        defaultValue: 'Qoder 登录失败'
      })}${message ? ` ${message}` : ''}`,
      'error'
    );
  }

  return;
}
```

- [ ] **Step 3: 保持 Qoder OAuth 模式继续走现有 `startAuth('qoder')` 路径**

`qoderAuthMode !== 'token'` 时，不新增任何 `qoder` 特判，继续使用现有通用逻辑：

```ts
const res = await oauthApi.startAuth(
  provider,
  provider === 'gemini-cli'
    ? { projectId: projectId || undefined }
    : provider === 'github'
      ? { planType: githubCopilotPlanType }
      : undefined
);
```

- [ ] **Step 4: 运行类型检查确认新分支没有把其它 provider 逻辑弄坏**

Run: `npm run type-check`

Expected: no TypeScript errors in `OAuthPage.tsx`.

- [ ] **Step 5: 提交 Qoder token 行为分支**

```bash
git add src/pages/OAuthPage.tsx
git commit -m "feat: add qoder token auth flow"
```

### Task 4: 渲染 Qoder 模式切换 UI 和条件表单

**Files:**
- Modify: `src/pages/OAuthPage.tsx:573-835`
- Modify: `src/pages/OAuthPage.module.scss:103-214`
- Verify: `npm run type-check`

- [ ] **Step 1: 在 provider map 中计算 Qoder 模式相关布尔值，避免 JSX 里嵌套过深**

在 `PROVIDERS.map((provider) => { ... })` 开头、`const state = states[provider.id] || {};` 后追加：

```ts
const isQoder = provider.id === 'qoder';
const qoderAuthMode = isQoder ? getQoderAuthMode(state) : undefined;
const isQoderTokenMode = qoderAuthMode === 'token';
const isQoderOAuthMode = qoderAuthMode === 'oauth';
const canSubmitCallback =
  CALLBACK_SUPPORTED.includes(provider.id) &&
  Boolean(state.url) &&
  (!isQoder || isQoderOAuthMode);
const providerHint =
  isQoder && isQoderTokenMode
    ? t('auth_login.qoder_token_hint', {
        defaultValue: '通过 Personal Access Token 登录 Qoder 服务，自动获取并保存认证文件。'
      })
    : t(provider.hintKey);
const loginButtonLabel =
  state.status === 'success'
    ? t('auth_login.login_another_account')
    : isQoder && isQoderTokenMode
      ? t('auth_login.qoder_token_button', {
          defaultValue: '使用 Token 登录'
        })
      : t(getAuthKey(provider.id, 'oauth_button'));
```

- [ ] **Step 2: 在 Qoder 卡片顶部插入模式切换控件**

放在 `cardHint` 之后，使用现有 `Select` 组件保持页面风格一致：

```tsx
{isQoder && (
  <div className={styles.qoderModeField}>
    <label className={styles.formItemLabel} htmlFor="qoder-auth-mode">
      {t('auth_login.qoder_auth_mode_label', {
        defaultValue: '登录方式'
      })}
    </label>
    <Select
      id="qoder-auth-mode"
      value={qoderAuthMode || 'token'}
      options={[
        {
          value: 'token',
          label: t('auth_login.qoder_auth_mode_token', {
            defaultValue: 'Personal Token'
          })
        },
        {
          value: 'oauth',
          label: t('auth_login.qoder_auth_mode_oauth', {
            defaultValue: 'OAuth'
          })
        }
      ]}
      disabled={Boolean(state.polling) || state.callbackSubmitting}
      ariaLabel={t('auth_login.qoder_auth_mode_label', {
        defaultValue: '登录方式'
      })}
      onChange={(value) => switchQoderAuthMode(value as 'token' | 'oauth')}
    />
  </div>
)}
```

- [ ] **Step 3: 在 Qoder token 模式下渲染 token 输入框，隐藏 OAuth 专属块**

把下面片段插在 GitLab 分支之后、`{state.url && (` 之前：

```tsx
{isQoder && isQoderTokenMode && (
  <div className={styles.qoderTokenFields}>
    <Input
      type="password"
      label={t('auth_login.qoder_token_label', {
        defaultValue: 'Personal Access Token'
      })}
      hint={t('auth_login.qoder_token_input_hint', {
        defaultValue: '请输入您的 Qoder Personal Access Token。'
      })}
      value={state.personalAccessToken || ''}
      disabled={Boolean(state.polling)}
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
```

同时把 OAuth 相关块都包上额外判断：

```tsx
{(!isQoder || isQoderOAuthMode) && state.url && (
  // existing authUrlBox
)}
```

```tsx
{(!isQoder || isQoderOAuthMode) && canSubmitCallback && (
  // existing callbackSection
)}
```

- [ ] **Step 4: 更新卡片 hint 与按钮文案，让 token 模式不再显示 “Qoder OAuth” 语义**

把原来的：

```tsx
<div className={styles.cardHint}>{t(provider.hintKey)}</div>
```

改成：

```tsx
<div className={styles.cardHint}>{providerHint}</div>
```

如果希望连卡片标题都更准确，可把 Qoder 标题改成按模式切换：

```tsx
{isQoder && isQoderTokenMode
  ? t('auth_login.qoder_token_title', { defaultValue: 'Qoder Token' })
  : t(provider.titleKey)}
```

本计划建议改标题，这样用户一眼能分辨当前模式。

- [ ] **Step 5: 为模式字段和 token 输入块增加样式**

在 `OAuthPage.module.scss` 中新增：

```scss
.qoderModeField,
.qoderTokenFields {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.qoderModeField {
  :global(.select-trigger) {
    width: 100%;
  }
}

.qoderTokenFields {
  :global(.form-group) {
    margin-top: 0;
    margin-bottom: 0;
    gap: $spacing-xs;
  }

  :global(.input:disabled) {
    background-color: var(--bg-tertiary);
    border-color: var(--border-color);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
}
```

- [ ] **Step 6: 运行类型检查，确保 JSX 条件渲染与样式类名都正确**

Run: `npm run type-check`

Expected: no TS errors.

- [ ] **Step 7: 提交 UI 与样式改动**

```bash
git add src/pages/OAuthPage.tsx src/pages/OAuthPage.module.scss
git commit -m "feat: add qoder auth mode switcher"
```

### Task 5: 补齐 i18n 文案

**Files:**
- Modify: `src/i18n/locales/zh-CN.json:1076-1086`
- Modify: `src/i18n/locales/en.json:1076-1086`
- Optional follow-through: `src/i18n/locales/zh-TW.json`, `src/i18n/locales/ru.json`
- Verify: `npm run type-check`

- [ ] **Step 1: 为中文文案增加 Qoder token 模式键值**

在 `auth_login` 下新增：

```json
"qoder_token_title": "Qoder Token",
"qoder_token_button": "使用 Token 登录",
"qoder_token_hint": "通过 Personal Access Token 登录 Qoder 服务，自动获取并保存认证文件。",
"qoder_auth_mode_label": "登录方式",
"qoder_auth_mode_token": "Personal Token",
"qoder_auth_mode_oauth": "OAuth",
"qoder_token_label": "Personal Access Token",
"qoder_token_input_hint": "请输入您的 Qoder Personal Access Token。",
"qoder_token_placeholder": "请输入 Personal Access Token",
"qoder_token_required": "请输入 Personal Access Token",
"qoder_token_success": "Qoder 登录成功",
"qoder_token_error": "Qoder 登录失败"
```

- [ ] **Step 2: 为英文文案增加对应键值**

```json
"qoder_token_title": "Qoder Token",
"qoder_token_button": "Login with Token",
"qoder_token_hint": "Login to Qoder service with a Personal Access Token and automatically save the authentication files.",
"qoder_auth_mode_label": "Login Method",
"qoder_auth_mode_token": "Personal Token",
"qoder_auth_mode_oauth": "OAuth",
"qoder_token_label": "Personal Access Token",
"qoder_token_input_hint": "Enter your Qoder Personal Access Token.",
"qoder_token_placeholder": "Enter Personal Access Token",
"qoder_token_required": "Please enter a Personal Access Token",
"qoder_token_success": "Qoder login successful",
"qoder_token_error": "Qoder login failed"
```

- [ ] **Step 3: 若项目要求不留缺口，同步补齐 `zh-TW` 和 `ru`**

最小可用版本直接复用英文或手工翻译，不要缺 key。建议至少补下面这些键：

```json
"qoder_token_title": "Qoder Token",
"qoder_token_button": "Login with Token",
"qoder_token_hint": "Login to Qoder service with a Personal Access Token and automatically save the authentication files."
```

同时补齐其余 9 个同名键，保持四个 locale 键集合一致。

- [ ] **Step 4: 跑类型检查确认 JSON 改动没有破坏构建输入**

Run: `npm run type-check`

Expected: no TypeScript errors and no JSON parse failures in editor/build tooling.

- [ ] **Step 5: 提交文案改动**

```bash
git add src/i18n/locales/zh-CN.json src/i18n/locales/en.json src/i18n/locales/zh-TW.json src/i18n/locales/ru.json
git commit -m "feat: add qoder token login copy"
```

### Task 6: 运行静态校验并做浏览器手工验证

**Files:**
- Verify only: current working tree
- Manual verification target: OAuth page in local dev server

- [ ] **Step 1: 运行类型检查**

Run: `npm run type-check`

Expected: `tsc --noEmit` passes.

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`

Expected: ESLint exits successfully with no new errors in `OAuthPage.tsx`, `oauth.ts`, or locale-related imports.

- [ ] **Step 3: 启动开发服务器**

Run: `npm run dev`

Expected: Vite prints a local URL such as `http://localhost:5173/`.

- [ ] **Step 4: 在浏览器验证 Qoder token 模式默认态**

手工检查：

- 打开 `/#/oauth`
- Qoder 卡片默认显示 `Personal Token` 模式
- 显示 token 输入框
- 不显示授权链接、不显示回调输入框

Expected: UI 与 spec 一致。

- [ ] **Step 5: 在 token 模式验证前端空值拦截**

手工操作：

- 保持 token 为空
- 点击登录按钮

Expected: 出现 `qoder_token_required` 对应提示；不会发起请求。

- [ ] **Step 6: 在 token 模式验证请求格式**

手工操作：

- 输入一个测试 token
- 点击登录
- 在浏览器 Network 面板确认请求

Expected request:

```http
POST /v0/management/qoder-auth-url
Content-Type: application/json

{"personal_access_token":"<token>"}
```

Expected UI result on success:

- 成功通知出现
- Qoder 卡片显示成功 badge
- “查看认证文件”按钮出现

- [ ] **Step 7: 切到 OAuth 模式验证旧流程仍在**

手工检查：

- 切换为 `OAuth`
- token 输入框消失
- 原有授权链接/回调区域在登录后恢复显示
- `GET /qoder-auth-url` 仍然被调用

Expected: 旧 Qoder OAuth 流程无回归。

- [ ] **Step 8: 验证模式切换时状态被正确清空**

手工操作：

- 在 OAuth 模式拿到授权链接后切回 token
- 再切回 OAuth

Expected:

- token 模式不显示旧链接或回调值
- OAuth 模式重新开始，不残留上一次 `url/state/callbackStatus`
- 没有继续偷偷轮询旧 state

- [ ] **Step 9: 提交最终验证通过的改动**

```bash
git add src/services/api/oauth.ts src/pages/OAuthPage.tsx src/pages/OAuthPage.module.scss src/i18n/locales/zh-CN.json src/i18n/locales/en.json src/i18n/locales/zh-TW.json src/i18n/locales/ru.json
git commit -m "feat: add qoder token login mode"
```

## Spec Coverage Check

- **Qoder 卡片双模式切换** → Task 2, Task 4
- **默认显示 Personal Token** → Task 2 Step 4, Task 4 Step 2
- **Token 模式只显示 token 表单和按钮** → Task 4 Step 3
- **OAuth 模式保留原有流程** → Task 3 Step 3, Task 6 Step 7
- **Token 模式调用 `POST /qoder-auth-url`** → Task 1, Task 3 Step 2, Task 6 Step 6
- **成功响应 `{ status: 'ok' }`** → Task 1, Task 3 Step 2
- **成功后复用现有完成态与“查看认证文件”按钮** → Task 3 Step 2, Task 6 Step 6
- **模式切换时清理另一种模式状态并停止轮询** → Task 2 Step 2-4, Task 6 Step 8
- **验证 type-check、lint 和浏览器行为** → Task 6

## Self-Review Notes

- 本计划没有使用 `TODO`、`TBD` 或“类似 Task N”之类占位描述。
- 所有新增标识符保持一致：`authMode`、`personalAccessToken`、`getQoderAuthMode`、`switchQoderAuthMode`、`qoderTokenAuth`。
- 计划没有引入新的抽象层，也没有扩大到其它 provider，符合 spec 的局部增强范围。