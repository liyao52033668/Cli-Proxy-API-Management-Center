# Qoder 个人令牌登录设计

## 背景

当前管理界面的 Qoder 登录仅支持 OAuth 流程。前端会先请求授权链接，再等待用户完成外部授权并在需要时手动提交回调 URL。现在需要在保留旧 OAuth 作为备用方案的前提下，为 Qoder 新增直接提交个人令牌登录的方式。

后端已提供 Qoder 个人令牌登录接口，使用方式如下：

- 请求方法：`POST`
- 路径：`/qoder-auth-url`
- 请求体：`{ "personal_access_token": string }`
- 成功响应：`{ "status": "ok" }`

## 目标

- 在 Qoder 卡片内新增个人令牌登录能力。
- 保留现有 OAuth 流程作为备用方案。
- 通过模式切换控制界面，只显示当前模式对应的表单和按钮。
- 尽量限制改动范围，只改 Qoder，不重构整个 OAuth 页面。

## 非目标

- 不把多模式登录抽象成适用于所有 provider 的通用框架。
- 不修改其他 provider 的登录流程。
- 不改变现有 Qoder OAuth 的接口协议和用户流程。

## 用户界面设计

Qoder 卡片继续位于 `src/pages/OAuthPage.tsx` 中，保留原有标题、图标和卡片布局。

在 Qoder 卡片内容区域新增模式切换控件，提供两个选项：

- `Personal Token`
- `OAuth`

默认模式为 `Personal Token`。

### Personal Token 模式

只显示以下内容：

- 一个 `Personal Access Token` 输入框
- 一个登录按钮
- 当前模式下的状态提示
- 登录成功后的“查看认证文件”按钮

不显示以下 OAuth 专属元素：

- 授权链接
- 打开链接 / 复制链接按钮
- 回调 URL 输入框
- 提交回调按钮
- 设备码
- OAuth 等待认证提示

`Personal Access Token` 输入框使用 `type="password"`，避免在界面上明文展示。

### OAuth 模式

保留当前 Qoder OAuth 的全部现有行为：

- 点击登录后请求授权链接
- 展示授权链接
- 支持打开链接与复制链接
- 支持手动填写回调 URL 并提交
- 支持等待认证状态展示
- 成功后显示成功状态和“查看认证文件”按钮

## 状态设计

在 `ProviderState` 中为 Qoder 增加以下字段：

- `authMode?: 'token' | 'oauth'`
- `personalAccessToken?: string`

`authMode` 仅用于 Qoder。Qoder 初始状态默认为 `token`。

现有的 OAuth 相关字段继续保留，用于 Qoder 的 OAuth 模式和其他 provider：

- `url`
- `state`
- `callbackUrl`
- `callbackStatus`
- `callbackError`
- `callbackSubmitting`
- `polling`

## API 设计

在 `src/services/api/oauth.ts` 中保留现有方法：

- `startAuth(provider, options?)`
- `getAuthStatus(state)`
- `submitCallback(provider, redirectUrl)`

同时新增 Qoder 个人令牌登录方法，例如：

```ts
qoderTokenAuth(personalAccessToken: string)
```

该方法的行为：

- 发送 `POST /qoder-auth-url`
- 请求体为：

```json
{ "personal_access_token": "..." }
```

- 成功响应按 `{ status: 'ok' }` 判定为登录成功

现有 `startAuth('qoder')` 继续保留，用于 Qoder 的 OAuth 模式。

## 交互与数据流

### Qoder Personal Token 模式

1. 用户进入 OAuth 页面，Qoder 卡片默认处于 `Personal Token` 模式。
2. 用户输入 `Personal Access Token`。
3. 点击登录按钮。
4. 前端校验 token 非空；为空则提示用户输入。
5. 前端调用 `qoderTokenAuth(personalAccessToken)`。
6. 若响应为 `{ status: 'ok' }`，则复用现有成功收尾逻辑：
   - 清理当前流程状态
   - 显示成功状态
   - 显示成功通知
   - 显示“查看认证文件”按钮
7. 若请求失败或后端返回错误，则展示错误状态与通知。

### Qoder OAuth 模式

1. 用户切换到 `OAuth` 模式。
2. 点击登录按钮。
3. 前端继续调用现有 `startAuth('qoder')`。
4. 根据现有逻辑展示授权链接并开始轮询。
5. 如需要，用户手动提交回调 URL。
6. 完成认证后进入现有成功态。

## 模式切换规则

模式切换必须清理另一种模式的临时状态，避免界面和状态相互污染。

### 从 Token 切到 OAuth

需要清理：

- `personalAccessToken`
- token 模式下的错误状态
- token 模式下的等待状态

### 从 OAuth 切到 Token

需要清理：

- `url`
- `state`
- `callbackUrl`
- `callbackStatus`
- `callbackError`
- `callbackSubmitting`
- `deviceCode`
- `polling`
- 与该 provider 相关的轮询计时器

如果当前 OAuth 正在轮询，切换时先停止轮询，再切换模式。

## 成功与错误处理

### Token 模式成功

- 调用成功后复用 `completeProviderAuth('qoder')`
- 显示成功通知
- 显示成功状态 badge
- 显示“查看认证文件”按钮

### Token 模式失败

- token 为空时，前端直接提示用户输入
- 请求异常时，展示错误通知
- 设置卡片状态为 `error`
- 不要求用户提供回调 URL
- 不进入轮询流程

### OAuth 模式成功与失败

完全保留现有行为，不做协议和语义变更。

## 实现边界

本次改动限定在以下范围：

- `src/pages/OAuthPage.tsx`
- `src/services/api/oauth.ts`
- 与 Qoder 新增文案相关的 i18n 文本
- 如样式需要，调整 `src/pages/OAuthPage.module.scss`

不修改其他 provider 的分支逻辑，不重构页面公共结构。

## 验证方案

### 手工验证

1. 打开 OAuth 页面，确认 Qoder 默认显示 `Personal Token` 模式。
2. 在 `Personal Token` 模式下：
   - 输入 token 后点击登录
   - 确认请求为 `POST /qoder-auth-url`
   - 确认请求体包含 `personal_access_token`
   - 成功后显示成功态和“查看认证文件”按钮
3. 在 `Personal Token` 模式下留空提交：
   - 确认前端阻止提交并提示输入 token
4. 切换到 `OAuth` 模式：
   - 确认只显示 OAuth 相关表单和按钮
   - 确认仍能发起原有 Qoder OAuth 流程
5. 在两种模式之间来回切换：
   - 确认不会残留另一种模式的链接、回调值、错误态或轮询状态

### 静态校验

- `npm run type-check`
- `npm run lint`

## 风险与控制

### 风险

- Qoder 分支逻辑增加后，`startAuth` 中的 provider 特判会略微变多。
- 模式切换时如果没有完整清理状态，可能导致 UI 残留或错误提示串场。

### 控制措施

- 仅在 `provider === 'qoder'` 时引入模式分支。
- 复用现有成功收尾和通知机制，减少重复逻辑。
- 统一通过模式切换处理函数清理另一条流程的状态与计时器。

## 推荐实施方式

采用局部增强方案：在 Qoder 卡片内增加模式切换，并为 token 模式新增一个专用 API 方法。这样可以最小化改动范围，同时完整保留旧 OAuth 作为备用方案。