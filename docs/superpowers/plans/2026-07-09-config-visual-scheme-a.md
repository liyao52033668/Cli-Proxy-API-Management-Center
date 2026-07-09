# Config Visual Scheme A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Scheme A low-risk backend config fields to the React visual config editor so users can edit them without switching to YAML source mode.

**Architecture:** Extend the existing visual config pipeline: `VisualConfigValues` stores form state, `useVisualConfig` parses YAML into that state and serializes dirty values back into YAML, and `VisualConfigEditor` renders controls in existing sections. Reuse existing `Input`, `ToggleRow`, `Select`, and string-list editor patterns; do not add a new persistence path.

**Tech Stack:** React 19, TypeScript, Vite, i18next JSON locale files, `yaml` package, Zustand-backed config refresh already handled by `ConfigPage`.

## Global Constraints

- Work in `Cli-Proxy-API-Management-Center`; this is the React management UI, not the Go proxy server.
- Do not run `npm test`; this project has no test script configured.
- For frontend verification use `npm run type-check`, `npm run lint`, and `npm run build`.
- Keep user-visible strings in locale JSON files under `src/i18n/locales`.
- Do not print or commit real secret values from `config.yaml`.
- Preserve the existing YAML source/visual dual-mode flow and diff confirmation behavior.

---

## File Structure

Modify these existing files only:

- `src/types/visualConfig.ts` — add visual state fields and validation field paths for Scheme A.
- `src/hooks/useVisualConfig.ts` — parse Scheme A YAML fields, track dirty state, validate integer/enum fields, and write values back to YAML.
- `src/components/config/VisualConfigEditorBlocks.tsx` — export the existing string-list editor so `ignored-auth-json-paths` can reuse it.
- `src/components/config/VisualConfigEditor.tsx` — render new controls in existing sections.
- `src/i18n/locales/zh-CN.json` — add Simplified Chinese labels/hints.
- `src/i18n/locales/zh-TW.json` — add Traditional Chinese labels/hints.
- `src/i18n/locales/en.json` — add English labels/hints.
- `src/i18n/locales/ru.json` — add Russian labels/hints using concise English fallback if a precise Russian wording is uncertain.

No new runtime dependency is needed.

---

### Task 1: Extend Visual Config Types

**Files:**
- Modify: `src/types/visualConfig.ts`

**Interfaces:**
- Consumes: existing `VisualConfigValues`, `VisualConfigFieldPath`, `DEFAULT_VISUAL_VALUES`.
- Produces:
  - `ignoredAuthJsonPaths: string[]`
  - `rmDisableAutoUpdatePanel: boolean`
  - `errorLogsMaxFiles: string`
  - `redisUsageQueueRetentionSeconds: string`
  - `passthroughHeaders: boolean`
  - `enableGeminiCliEndpoint: boolean`
  - `disableImageGeneration: 'false' | 'true' | 'chat'`

- [ ] **Step 1: Update field path and value types**

In `src/types/visualConfig.ts`, replace the `VisualConfigFieldPath` union and add the image generation type exactly as shown:

```ts
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
```

- [ ] **Step 2: Add fields to `VisualConfigValues`**

Add these properties to `VisualConfigValues` near related existing fields:

```ts
  rmDisableAutoUpdatePanel: boolean;
  ignoredAuthJsonPaths: string[];
  errorLogsMaxFiles: string;
  redisUsageQueueRetentionSeconds: string;
  passthroughHeaders: boolean;
  enableGeminiCliEndpoint: boolean;
  disableImageGeneration: DisableImageGenerationValue;
```

- [ ] **Step 3: Add defaults**

Add these defaults to `DEFAULT_VISUAL_VALUES`:

```ts
  rmDisableAutoUpdatePanel: false,
  ignoredAuthJsonPaths: [],
  errorLogsMaxFiles: '',
  redisUsageQueueRetentionSeconds: '',
  passthroughHeaders: false,
  enableGeminiCliEndpoint: false,
  disableImageGeneration: 'false',
```

- [ ] **Step 4: Run type-check for type surface**

Run:

```bash
npm run type-check
```

Expected at this point: TypeScript may fail because parser/render code does not yet populate the new required fields. The acceptable failure is about missing properties in `VisualConfigValues` construction; any syntax error in `visualConfig.ts` must be fixed before continuing.

---

### Task 2: Parse, Dirty-Track, Validate, and Serialize New Fields

**Files:**
- Modify: `src/hooks/useVisualConfig.ts`

**Interfaces:**
- Consumes: fields added in Task 1.
- Produces: `useVisualConfig()` can load and save Scheme A fields through the existing `loadVisualValuesFromYaml()` and `applyVisualChangesToYaml()` functions.

- [ ] **Step 1: Import the image generation type**

Update the existing type import from `@/types/visualConfig` to include:

```ts
  DisableImageGenerationValue,
```

- [ ] **Step 2: Add parser helper for `disable-image-generation`**

Add this helper near `parsePayloadProtocol`:

```ts
function parseDisableImageGenerationValue(raw: unknown): DisableImageGenerationValue {
  if (raw === true) return 'true';
  if (raw === 'true') return 'true';
  if (raw === 'chat') return 'chat';
  return 'false';
}
```

- [ ] **Step 3: Add validation entries**

In `getVisualConfigValidationErrors`, add:

```ts
    errorLogsMaxFiles: getNonNegativeIntegerError(values.errorLogsMaxFiles),
    redisUsageQueueRetentionSeconds: getNonNegativeIntegerError(
      values.redisUsageQueueRetentionSeconds
    ),
```

- [ ] **Step 4: Add dirty tracking for all new fields**

Inside `getNextDirtyFields`, add these blocks near related fields:

```ts
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableAutoUpdatePanel')) {
    updateDirty(
      'rmDisableAutoUpdatePanel',
      nextValues.rmDisableAutoUpdatePanel === baselineValues.rmDisableAutoUpdatePanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'ignoredAuthJsonPaths')) {
    const left = nextValues.ignoredAuthJsonPaths;
    const right = baselineValues.ignoredAuthJsonPaths;
    updateDirty(
      'ignoredAuthJsonPaths',
      left.length === right.length && left.every((item, index) => item === right[index])
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'errorLogsMaxFiles')) {
    updateDirty('errorLogsMaxFiles', nextValues.errorLogsMaxFiles === baselineValues.errorLogsMaxFiles);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'redisUsageQueueRetentionSeconds')) {
    updateDirty(
      'redisUsageQueueRetentionSeconds',
      nextValues.redisUsageQueueRetentionSeconds === baselineValues.redisUsageQueueRetentionSeconds
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'passthroughHeaders')) {
    updateDirty('passthroughHeaders', nextValues.passthroughHeaders === baselineValues.passthroughHeaders);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'enableGeminiCliEndpoint')) {
    updateDirty(
      'enableGeminiCliEndpoint',
      nextValues.enableGeminiCliEndpoint === baselineValues.enableGeminiCliEndpoint
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disableImageGeneration')) {
    updateDirty(
      'disableImageGeneration',
      nextValues.disableImageGeneration === baselineValues.disableImageGeneration
    );
  }
```

- [ ] **Step 5: Populate new fields in `loadVisualValuesFromYaml`**

Add values to the `newValues` object:

```ts
        rmDisableAutoUpdatePanel: Boolean(remoteManagement?.['disable-auto-update-panel']),

        ignoredAuthJsonPaths: Array.isArray(parsed['ignored-auth-json-paths'])
          ? parsed['ignored-auth-json-paths'].map(String)
          : [],

        errorLogsMaxFiles: String(parsed['error-logs-max-files'] ?? ''),
        redisUsageQueueRetentionSeconds: String(
          parsed['redis-usage-queue-retention-seconds'] ?? ''
        ),

        passthroughHeaders: Boolean(parsed['passthrough-headers']),
        enableGeminiCliEndpoint: Boolean(parsed['enable-gemini-cli-endpoint']),
        disableImageGeneration: parseDisableImageGenerationValue(
          parsed['disable-image-generation']
        ),
```

Place each field near its related existing group: remote management with remote fields, ignored auth paths with auth fields, log/usage retention with system fields, and passthrough/Gemini/image generation near network or system booleans.

- [ ] **Step 6: Serialize new fields in `applyVisualChangesToYaml`**

Add these statements in related existing sections:

```ts
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-auto-update-panel'],
            values.rmDisableAutoUpdatePanel
          );
```

After `setStringInDoc(doc, ['auth-dir'], values.authDir);`, add:

```ts
        const ignoredAuthJsonPaths = values.ignoredAuthJsonPaths
          .map((path) => path.trim())
          .filter(Boolean);
        if (ignoredAuthJsonPaths.length > 0) {
          doc.setIn(['ignored-auth-json-paths'], ignoredAuthJsonPaths);
        } else if (docHas(doc, ['ignored-auth-json-paths'])) {
          doc.deleteIn(['ignored-auth-json-paths']);
        }
```

Near log and usage serialization, add:

```ts
        setIntFromStringInDoc(doc, ['error-logs-max-files'], values.errorLogsMaxFiles);
        setIntFromStringInDoc(
          doc,
          ['redis-usage-queue-retention-seconds'],
          values.redisUsageQueueRetentionSeconds
        );
```

Near network/system booleans, add:

```ts
        setBooleanInDoc(doc, ['passthrough-headers'], values.passthroughHeaders);
        setBooleanInDoc(doc, ['enable-gemini-cli-endpoint'], values.enableGeminiCliEndpoint);
        if (values.disableImageGeneration === 'true') {
          doc.setIn(['disable-image-generation'], true);
        } else if (values.disableImageGeneration === 'chat') {
          doc.setIn(['disable-image-generation'], 'chat');
        } else if (docHas(doc, ['disable-image-generation'])) {
          doc.setIn(['disable-image-generation'], false);
        }
```

- [ ] **Step 7: Run type-check for hook behavior**

Run:

```bash
npm run type-check
```

Expected: failure may remain because UI does not yet render or update these fields. There must be no errors in `useVisualConfig.ts`.

---

### Task 3: Expose the String List Editor for Ignored Auth Paths

**Files:**
- Modify: `src/components/config/VisualConfigEditorBlocks.tsx`

**Interfaces:**
- Consumes: existing internal `StringListEditor`.
- Produces: exported `StringListEditor` component with the existing props:

```ts
{
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  onChange: (next: string[]) => void;
}
```

- [ ] **Step 1: Export the existing component**

Change:

```ts
const StringListEditor = memo(function StringListEditor({
```

to:

```ts
export const StringListEditor = memo(function StringListEditor({
```

- [ ] **Step 2: Run type-check for export**

Run:

```bash
npm run type-check
```

Expected: no export-related errors. Any remaining errors should point to fields not yet rendered in `VisualConfigEditor.tsx`.

---

### Task 4: Render Scheme A Controls in the Visual Editor

**Files:**
- Modify: `src/components/config/VisualConfigEditor.tsx`

**Interfaces:**
- Consumes: updated `VisualConfigValues`, `StringListEditor`, and validation errors.
- Produces: visible controls for all Scheme A fields.

- [ ] **Step 1: Import `StringListEditor`**

Update the import from `./VisualConfigEditorBlocks` to:

```ts
import {
  ApiKeysCardEditor,
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
  StringListEditor,
} from './VisualConfigEditorBlocks';
```

- [ ] **Step 2: Add validation variables**

After `logsMaxSizeError`, add:

```ts
  const errorLogsMaxFilesError = getValidationMessage(t, validationErrors?.errorLogsMaxFiles);
  const redisUsageQueueRetentionSecondsError = getValidationMessage(
    t,
    validationErrors?.redisUsageQueueRetentionSeconds
  );
```

- [ ] **Step 3: Count new errors in the System section**

Change the System section `errorCount` from:

```ts
        errorCount: countErrors(['logsMaxTotalSizeMb']),
```

to:

```ts
        errorCount: countErrors([
          'logsMaxTotalSizeMb',
          'errorLogsMaxFiles',
          'redisUsageQueueRetentionSeconds',
        ]),
```

- [ ] **Step 4: Add remote management toggle**

In the remote section after `disable_panel`, add:

```tsx
              <ToggleRow
                title={t('config_management.visual.sections.remote.disable_auto_update_panel')}
                description={t(
                  'config_management.visual.sections.remote.disable_auto_update_panel_desc'
                )}
                checked={values.rmDisableAutoUpdatePanel}
                disabled={disabled}
                onChange={(rmDisableAutoUpdatePanel) => onChange({ rmDisableAutoUpdatePanel })}
              />
```

- [ ] **Step 5: Add ignored auth JSON path list**

In the auth section after the `authDir` input and before API keys, add:

```tsx
              <SectionSubsection
                title={t('config_management.visual.sections.auth.ignored_json_paths')}
                description={t('config_management.visual.sections.auth.ignored_json_paths_desc')}
              >
                <StringListEditor
                  value={values.ignoredAuthJsonPaths}
                  disabled={disabled}
                  placeholder=".management/codex-inspection-latest.json"
                  inputAriaLabel={t(
                    'config_management.visual.sections.auth.ignored_json_paths_input'
                  )}
                  onChange={(ignoredAuthJsonPaths) => onChange({ ignoredAuthJsonPaths })}
                />
              </SectionSubsection>
```

- [ ] **Step 6: Add system numeric fields and image generation select**

In the system section's numeric `SectionGrid`, after `logsMaxTotalSizeMb`, add:

```tsx
                <Input
                  label={t('config_management.visual.sections.system.error_logs_max_files')}
                  type="number"
                  placeholder="10"
                  value={values.errorLogsMaxFiles}
                  onChange={(e) => onChange({ errorLogsMaxFiles: e.target.value })}
                  disabled={disabled}
                  error={errorLogsMaxFilesError}
                />
                <Input
                  label={t('config_management.visual.sections.system.redis_usage_retention')}
                  type="number"
                  placeholder="60"
                  value={values.redisUsageQueueRetentionSeconds}
                  onChange={(e) => onChange({ redisUsageQueueRetentionSeconds: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.system.redis_usage_retention_hint')}
                  error={redisUsageQueueRetentionSecondsError}
                />
                <FieldShell
                  label={t('config_management.visual.sections.system.disable_image_generation')}
                  hint={t('config_management.visual.sections.system.disable_image_generation_hint')}
                >
                  <Select
                    value={values.disableImageGeneration}
                    options={[
                      {
                        value: 'false',
                        label: t('config_management.visual.sections.system.image_generation_enabled'),
                      },
                      {
                        value: 'chat',
                        label: t('config_management.visual.sections.system.image_generation_chat_disabled'),
                      },
                      {
                        value: 'true',
                        label: t('config_management.visual.sections.system.image_generation_disabled'),
                      },
                    ]}
                    disabled={disabled}
                    ariaLabel={t(
                      'config_management.visual.sections.system.disable_image_generation'
                    )}
                    onChange={(disableImageGeneration) =>
                      onChange({
                        disableImageGeneration:
                          disableImageGeneration as VisualConfigValues['disableImageGeneration'],
                      })
                    }
                  />
                </FieldShell>
```

- [ ] **Step 7: Add network toggles**

In the network section's toggle `SectionGrid`, after `ws_auth`, add:

```tsx
                <ToggleRow
                  title={t('config_management.visual.sections.network.passthrough_headers')}
                  description={t(
                    'config_management.visual.sections.network.passthrough_headers_desc'
                  )}
                  checked={values.passthroughHeaders}
                  disabled={disabled}
                  onChange={(passthroughHeaders) => onChange({ passthroughHeaders })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.enable_gemini_cli_endpoint')}
                  description={t(
                    'config_management.visual.sections.network.enable_gemini_cli_endpoint_desc'
                  )}
                  checked={values.enableGeminiCliEndpoint}
                  disabled={disabled}
                  onChange={(enableGeminiCliEndpoint) => onChange({ enableGeminiCliEndpoint })}
                />
```

- [ ] **Step 8: Run type-check for UI wiring**

Run:

```bash
npm run type-check
```

Expected: TypeScript passes or only locale-key typing is absent because locale JSON is not typed. Fix any compile errors before continuing.

---

### Task 5: Add Locale Strings

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/zh-TW.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/ru.json`

**Interfaces:**
- Consumes: translation keys used in Task 4.
- Produces: all new controls render readable labels and hints in every supported locale.

- [ ] **Step 1: Add Simplified Chinese strings**

Under `config_management.visual.sections.remote`, add:

```json
"disable_auto_update_panel": "禁用面板自动更新",
"disable_auto_update_panel_desc": "开启后，管理面板只在缺失时首次下载，不再后台自动检查更新。"
```

Under `config_management.visual.sections.auth`, add:

```json
"ignored_json_paths": "隐藏认证 JSON 路径",
"ignored_json_paths_desc": "这些相对 auth-dir 的 JSON 文件不会显示在认证文件列表中。",
"ignored_json_paths_input": "隐藏的认证 JSON 相对路径"
```

Under `config_management.visual.sections.system`, add:

```json
"error_logs_max_files": "错误日志保留数量",
"redis_usage_retention": "使用事件保留秒数",
"redis_usage_retention_hint": "Management API 内存使用事件队列的保留时间，后端最大限制为 3600 秒。",
"disable_image_generation": "图片生成能力",
"disable_image_generation_hint": "控制是否注入或允许 image_generation 工具和图片生成接口。",
"image_generation_enabled": "启用图片生成",
"image_generation_chat_disabled": "仅聊天接口禁用",
"image_generation_disabled": "全部禁用"
```

Under `config_management.visual.sections.network`, add:

```json
"passthrough_headers": "转发上游响应头",
"passthrough_headers_desc": "开启后，将过滤后的上游响应头继续传给客户端。",
"enable_gemini_cli_endpoint": "启用 Gemini CLI 内部端点",
"enable_gemini_cli_endpoint_desc": "允许 /v1internal:* 请求；仅在需要兼容 Gemini CLI 内部接口时开启。"
```

- [ ] **Step 2: Add Traditional Chinese strings**

Use these values in `zh-TW.json` at the same key locations:

```json
"disable_auto_update_panel": "停用面板自動更新",
"disable_auto_update_panel_desc": "開啟後，管理面板只會在缺失時首次下載，不再於背景自動檢查更新。",
"ignored_json_paths": "隱藏認證 JSON 路徑",
"ignored_json_paths_desc": "這些相對於 auth-dir 的 JSON 檔案不會顯示在認證檔案清單中。",
"ignored_json_paths_input": "隱藏的認證 JSON 相對路徑",
"error_logs_max_files": "錯誤日誌保留數量",
"redis_usage_retention": "使用事件保留秒數",
"redis_usage_retention_hint": "Management API 記憶體使用事件佇列的保留時間，後端最大限制為 3600 秒。",
"disable_image_generation": "圖片生成能力",
"disable_image_generation_hint": "控制是否注入或允許 image_generation 工具與圖片生成端點。",
"image_generation_enabled": "啟用圖片生成",
"image_generation_chat_disabled": "僅聊天端點停用",
"image_generation_disabled": "全部停用",
"passthrough_headers": "轉發上游回應標頭",
"passthrough_headers_desc": "開啟後，會將過濾後的上游回應標頭繼續傳給用戶端。",
"enable_gemini_cli_endpoint": "啟用 Gemini CLI 內部端點",
"enable_gemini_cli_endpoint_desc": "允許 /v1internal:* 請求；僅在需要相容 Gemini CLI 內部介面時開啟。"
```

- [ ] **Step 3: Add English strings**

Use these values in `en.json` at the same key locations:

```json
"disable_auto_update_panel": "Disable panel auto-update",
"disable_auto_update_panel_desc": "When enabled, the management panel is downloaded only when missing and is not updated in the background.",
"ignored_json_paths": "Hidden auth JSON paths",
"ignored_json_paths_desc": "JSON files at these paths relative to auth-dir are hidden from the auth file list.",
"ignored_json_paths_input": "Hidden auth JSON relative path",
"error_logs_max_files": "Error log file retention",
"redis_usage_retention": "Usage event retention seconds",
"redis_usage_retention_hint": "How long the Management API keeps in-memory usage events; the backend clamps this to 3600 seconds.",
"disable_image_generation": "Image generation capability",
"disable_image_generation_hint": "Controls whether the image_generation tool and image generation endpoints are injected or allowed.",
"image_generation_enabled": "Enable image generation",
"image_generation_chat_disabled": "Disable on chat endpoints only",
"image_generation_disabled": "Disable everywhere",
"passthrough_headers": "Forward upstream response headers",
"passthrough_headers_desc": "When enabled, filtered upstream response headers are forwarded to clients.",
"enable_gemini_cli_endpoint": "Enable Gemini CLI internal endpoints",
"enable_gemini_cli_endpoint_desc": "Allows /v1internal:* requests; enable only when Gemini CLI internal endpoint compatibility is required."
```

- [ ] **Step 4: Add Russian strings**

Use these values in `ru.json` at the same key locations:

```json
"disable_auto_update_panel": "Отключить автообновление панели",
"disable_auto_update_panel_desc": "Если включено, панель управления загружается только при отсутствии и не обновляется в фоне.",
"ignored_json_paths": "Скрытые пути JSON авторизации",
"ignored_json_paths_desc": "JSON-файлы по этим путям относительно auth-dir скрываются из списка файлов авторизации.",
"ignored_json_paths_input": "Относительный путь скрытого JSON авторизации",
"error_logs_max_files": "Количество файлов журналов ошибок",
"redis_usage_retention": "Хранение событий использования, секунд",
"redis_usage_retention_hint": "Сколько Management API хранит события использования в памяти; сервер ограничивает значение 3600 секундами.",
"disable_image_generation": "Возможность генерации изображений",
"disable_image_generation_hint": "Управляет внедрением и доступностью инструмента image_generation и эндпоинтов генерации изображений.",
"image_generation_enabled": "Генерация изображений включена",
"image_generation_chat_disabled": "Отключить только для chat-эндпоинтов",
"image_generation_disabled": "Отключить везде",
"passthrough_headers": "Передавать заголовки ответа upstream",
"passthrough_headers_desc": "Если включено, отфильтрованные заголовки ответа upstream передаются клиентам.",
"enable_gemini_cli_endpoint": "Включить внутренние эндпоинты Gemini CLI",
"enable_gemini_cli_endpoint_desc": "Разрешает запросы /v1internal:*; включайте только если нужна совместимость с внутренними эндпоинтами Gemini CLI."
```

- [ ] **Step 5: Validate JSON syntax**

Run:

```bash
node -e "for (const f of ['src/i18n/locales/zh-CN.json','src/i18n/locales/zh-TW.json','src/i18n/locales/en.json','src/i18n/locales/ru.json']) { JSON.parse(require('fs').readFileSync(f, 'utf8')); console.log(f + ' OK') }"
```

Expected: four `OK` lines.

---

### Task 6: Verify End-to-End Build Surface

**Files:**
- No code changes unless verification finds an issue.

**Interfaces:**
- Consumes: all changes from Tasks 1-5.
- Produces: verified frontend build and a browser-observed Config page flow.

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run type-check
```

Expected: exit code 0.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit code 0 and `dist/index.html` generated.

- [ ] **Step 4: Launch the app for UI verification**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, normally `http://127.0.0.1:5173/`.

- [ ] **Step 5: Browser-check the Config page**

Using the browser, open the Vite URL, log in to a running CLI Proxy API backend if required, then navigate to `#/config`.

Check:

- The visual tab renders without a crash.
- Remote Management shows “Disable panel auto-update”.
- Auth shows the hidden auth JSON paths list editor.
- System shows error log retention, usage event retention, and image generation capability.
- Network shows passthrough headers and Gemini CLI internal endpoint toggles.
- Invalid negative numbers in the new numeric fields block save with the existing validation style.
- Changing each new field marks the page dirty and the diff preview shows the expected YAML keys.

If a backend is unavailable, record that browser UI verification could not cover authenticated save/diff behavior and include the exact missing dependency.

---

## Self-Review

- Spec coverage: Scheme A fields are covered by Tasks 1-5, and verification is covered by Task 6.
- Placeholder scan: no placeholder tasks are intentionally left; every code-editing step names exact files and code snippets.
- Type consistency: field names are consistently camelCase in React state and kebab-case in YAML serialization.
