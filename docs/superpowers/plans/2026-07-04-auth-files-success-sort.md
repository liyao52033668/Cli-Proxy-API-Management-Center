# 认证文件请求成功次数排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在认证文件页面的现有排序下拉中新增“请求成功次数”选项，按 `success` 次数降序排列，并在并列时按修改时间倒序排列。

**Architecture:** 复用现有 `AuthFilesSortMode` 持久化机制和 `AuthFilesPage` 中的 `sorted` 计算逻辑，不引入新接口、不改后端数据结构。成功次数直接使用现有卡片统计来源 `resolveAuthFileStats(file, keyStats).success`，从而保证排序结果与页面上展示的“成功 N”完全一致。

**Tech Stack:** React 19、TypeScript、Vite、i18next、node:test、ESLint

## Global Constraints

- 只做最小改动，不重构认证文件页面结构。
- 新增排序项文案必须是 `请求成功次数`。
- 新排序必须按 `resolveAuthFileStats(file, keyStats).success` 的值降序排列。
- 当两个文件的成功次数相同时，必须按修改时间倒序排列。
- 不修改默认排序规则。
- 不新增后端接口、字段或统计口径。
- 产品改动文件限定为 `src/features/authFiles/uiState.ts`、`src/pages/AuthFilesPage.tsx`、`src/i18n/locales/zh-CN.json`；如实现时项目要求语言包完整一致，可再补其它 locale。
- 该仓库没有 `npm test` 脚本；自动化验证优先使用 `node --test`、`npm run type-check`、`npm run build`。

---

### Task 1: 扩展排序模式持久化与回归测试

**Files:**
- Modify: `src/features/authFiles/uiState.ts:1-24`
- Create: `src/features/authFiles/uiState.test.mjs`

**Interfaces:**
- Consumes: `AUTH_FILES_SORT_MODES`, `isAuthFilesSortMode(value: unknown): value is AuthFilesSortMode`
- Produces: `AuthFilesSortMode` 新增 `'success'`；测试文件验证 `'success'` 可被持久化校验逻辑接受

- [ ] **Step 1: 写一个会失败的持久化回归测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_FILES_SORT_MODES, isAuthFilesSortMode } from './uiState.ts';

test('accepts success as an auth files sort mode', () => {
  assert.equal(AUTH_FILES_SORT_MODES.includes('success'), true);
  assert.equal(isAuthFilesSortMode('success'), true);
});

test('continues rejecting unknown auth files sort modes', () => {
  assert.equal(isAuthFilesSortMode('success-desc'), false);
});
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `node --test src/features/authFiles/uiState.test.mjs`

Expected: FAIL，至少有一个断言失败，因为当前 `AUTH_FILES_SORT_MODES` 里还没有 `success`。

- [ ] **Step 3: 以最小改动扩展排序模式**

将 `src/features/authFiles/uiState.ts` 顶部数组改成：

```ts
export const AUTH_FILES_SORT_MODES = ['default', 'time', 'az', 'priority', 'success'] as const;
```

保留其余类型与 `Set` 校验逻辑不变：

```ts
export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];

const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);
```

- [ ] **Step 4: 再次运行测试，确认持久化校验通过**

Run: `node --test src/features/authFiles/uiState.test.mjs`

Expected: PASS，输出 2 个通过的测试。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/features/authFiles/uiState.ts src/features/authFiles/uiState.test.mjs
git commit -m "test: cover auth file success sort mode"
```

### Task 2: 新增“请求成功次数”排序选项并接入列表排序

**Files:**
- Modify: `src/pages/AuthFilesPage.tsx:27-40`
- Modify: `src/pages/AuthFilesPage.tsx:418-424`
- Modify: `src/pages/AuthFilesPage.tsx:457-480`
- Modify: `src/i18n/locales/zh-CN.json:553-558`

**Interfaces:**
- Consumes: `sortMode: AuthFilesSortMode`, `readAuthFileTimestamp(file: AuthFileItem): number`, `resolveAuthFileStats(file: AuthFileItem, keyStats): { success: number; failure: number }`, `t('auth_files.sort_success')`
- Produces: 新排序模式 `'success'` 在下拉中可选；`sorted` 计算逻辑支持按成功次数降序、并列按修改时间倒序

- [ ] **Step 1: 先补中文文案，制造一个可观察的失败点**

在 `src/i18n/locales/zh-CN.json` 的排序文案附近新增：

```json
"sort_success": "请求成功次数"
```

把它放在现有排序键旁边，例如：

```json
"sort_label": "排序",
"sort_time": "按时间倒序",
"sort_default": "默认",
"sort_az": "A-Z 名称",
"sort_priority": "优先级",
"sort_success": "请求成功次数",
"priority_display": "优先级"
```

- [ ] **Step 2: 运行类型检查，确认当前还未完成功能接线**

Run: `npm run type-check`

Expected: PASS。此时类型检查不会替你验证功能完成，但这是修改前的基线检查，确保仓库当前可编译。

- [ ] **Step 3: 在页面中接入新排序选项与最小实现**

先在 `src/pages/AuthFilesPage.tsx` 的常量导入里补上 `resolveAuthFileStats`：

```ts
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  resolveAuthFileStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
```

再把 `sortOptions` 改成包含新值：

```ts
const sortOptions = useMemo(
  () => [
    { value: 'default', label: t('auth_files.sort_default') },
    { value: 'az', label: t('auth_files.sort_az') },
    { value: 'priority', label: t('auth_files.sort_priority') },
    { value: 'success', label: t('auth_files.sort_success') },
  ],
  [t]
);
```

最后在 `sorted` 的 `useMemo` 中新增 `success` 分支，只做最小比较：

```ts
} else if (sortMode === 'success') {
  copy.sort((a, b) => {
    const successA = resolveAuthFileStats(a, keyStats).success;
    const successB = resolveAuthFileStats(b, keyStats).success;
    if (successA !== successB) return successB - successA;

    const dateA = readAuthFileTimestamp(a);
    const dateB = readAuthFileTimestamp(b);
    return dateB - dateA;
  });
}
```

并把 `keyStats` 加入这个 `useMemo` 的依赖数组：

```ts
}, [filtered, keyStats, sortMode]);
```

- [ ] **Step 4: 运行静态验证，确认页面改动可编译**

Run: `npm run type-check && npm run build`

Expected: PASS，`tsc` 和 `vite build` 都成功完成，没有因为新增 `success` 分支或 i18n key 引入编译错误。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/pages/AuthFilesPage.tsx src/i18n/locales/zh-CN.json
git commit -m "feat: add auth file success sort option"
```

### Task 3: 验证页面行为与持久化恢复

**Files:**
- Reuse: `src/features/authFiles/uiState.test.mjs`
- Verify: `src/pages/AuthFilesPage.tsx:276-301`
- Verify: `src/pages/AuthFilesPage.tsx:802-810`
- Verify: `src/pages/AuthFilesPage.tsx:457-480`

**Interfaces:**
- Consumes: `handleSortModeChange(value: string)`, `writeAuthFilesUiState({... sortMode })`, `Select value={sortMode}`, `sorted` 的 `'success'` 分支
- Produces: 手动验证记录，确认新排序在 UI、分页前排序、刷新恢复三个层面都符合 spec

- [ ] **Step 1: 重新运行自动化与静态检查，确保进入手动验证前状态干净**

Run: `node --test src/features/authFiles/uiState.test.mjs && npm run type-check && npm run build`

Expected: PASS，测试、类型检查、构建全部通过。

- [ ] **Step 2: 启动开发服务器并打开认证文件页面**

Run: `npm run dev`

Expected: Vite 启动成功，默认监听 `http://localhost:5173`。

在浏览器中进入认证文件页面后，依次执行以下检查：

1. 打开“排序”下拉，确认出现 `请求成功次数`。
2. 选中 `请求成功次数`，确认成功次数更高的卡片排在前面。
3. 找两张成功次数相同的卡片，确认修改时间更新的排在前面。
4. 切回 `默认`、`A-Z 名称`、`优先级`，确认现有排序行为没有变化。
5. 保持 `请求成功次数` 选中状态刷新页面，确认排序模式仍被恢复。
6. 观察没有统计数据的卡片，确认页面不报错，并按成功次数 `0` 参与排序。

- [ ] **Step 3: 如项目要求其它语言包完整一致，再补齐 locale；否则保持最小闭环**

如果构建、检查或团队约定要求所有语言包同步，按相同 key 在其它 locale 文件中补齐：

```json
"sort_success": "请求成功次数"
```

如果没有这项要求，则不要额外扩展范围。

- [ ] **Step 4: 仅在 Step 3 实际改动了 locale 文件时做收尾提交**

先检查是否还有未提交改动：

```bash
git status --short
```

如果 Step 3 补了其它 locale，执行：

```bash
git add src/i18n/locales/*.json
git commit -m "chore: align auth file success sort locale copy"
```

如果 `git status --short` 为空，则不要创建空提交，直接以 Task 1 和 Task 2 的提交作为最终代码结果。

Expected: 只有在 Step 3 真的修改了其它语言包时才会产生额外 commit；否则工作区保持干净。

## Self-Review

- **Spec coverage:**
  - 新增排序选项文案 → Task 2 Step 1 / Step 3
  - 成功次数降序 → Task 2 Step 3
  - 并列按修改时间倒序 → Task 2 Step 3
  - 持久化恢复 → Task 1 Step 3 / Task 3 Step 2
  - 不改默认排序与后端接口 → Task 2 只增量修改当前页面逻辑，未引入任何 API 变更
- **Placeholder scan:** 计划中未使用 TBD/TODO/“自行实现”等占位写法；每个代码步骤都给了实际代码或命令。
- **Type consistency:** 计划统一使用 `success` 作为新增 `AuthFilesSortMode` 的值，统一使用 `t('auth_files.sort_success')` 作为文案 key，统一使用 `resolveAuthFileStats(file, keyStats).success` 作为排序值来源。
