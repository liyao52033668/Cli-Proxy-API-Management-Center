# 凭证统计 Token 与总花费 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在使用统计页的「凭证统计」表格中，为每个凭证展示 Token 总量与总花费，并支持表头排序。

**Architecture:** 在现有 `CredentialStatsCard` 内增量扩展：继续用 `collectUsageDetails` 归行凭证，聚合时累加 `extractTotalTokens` 与 `calculateCost`；`UsagePage` 传入已有 `modelPrices`；无价格配置时隐藏花费列。不新增 API、不抽公共聚合工具。

**Tech Stack:** React、TypeScript、i18next、现有 `@/utils/usage` 工具

**Spec:** `docs/superpowers/specs/2026-07-12-credential-stats-token-cost-design.md`

## Global Constraints

- 只改 `src/components/usage/CredentialStatsCard.tsx` 与 `src/pages/UsagePage.tsx`。
- 复用 `extractTotalTokens` / `calculateCost` / `formatCompactNumber` / `formatUsd`，不重复实现计费。
- 失败请求也计入 token 与 cost。
- 无模型价格时隐藏总花费列；有价格且 cost 为 0 时显示 `--`。
- i18n 复用 `usage_stats.tokens_count` / `usage_stats.total_cost` 等已有 key，不新增文案。
- 仓库无 `npm test`；验证用 `npm run type-check`，必要时 `npm run lint`。
- 提交前若 git 身份未配置，跳过 commit 并提示用户配置，不要擅自 `git config`。

---

### Task 1: 扩展 CredentialStatsCard（聚合 + 排序 + 列）

**Files:**
- Modify: `src/components/usage/CredentialStatsCard.tsx`

**Interfaces:**
- Consumes:
  - `collectUsageDetails`, `extractTotalTokens`, `calculateCost`, `formatCompactNumber`, `formatUsd`, `normalizeAuthIndex`, `type ModelPrice` from `@/utils/usage`
  - 现有 `buildSourceInfoMap` / `resolveSourceDisplay`
- Produces:
  - `CredentialStatsCardProps` 增加 `modelPrices: Record<string, ModelPrice>`
  - 表格列：凭证、请求次数、Token、成功率、总花费（条件）
  - 可排序：`credential | requests | tokens | successRate | cost`

- [ ] **Step 1: 替换 import 与类型定义**

将文件顶部改为：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { authFilesApi } from '@/services/api/authFiles';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import {
  calculateCost,
  collectUsageDetails,
  extractTotalTokens,
  formatCompactNumber,
  formatUsd,
  normalizeAuthIndex,
  type ModelPrice,
} from '@/utils/usage';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

export interface CredentialStatsCardProps {
  usage: UsagePayload | null;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  modelPrices: Record<string, ModelPrice>;
}

interface CredentialRow {
  key: string;
  displayName: string;
  type: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
  tokens: number;
  cost: number;
}

type SortKey = 'credential' | 'requests' | 'tokens' | 'successRate' | 'cost';
type SortDir = 'asc' | 'desc';
```

- [ ] **Step 2: 扩展组件 props 与聚合逻辑**

函数签名加入 `modelPrices`；在现有 `rows` 的 `useMemo` 中初始化并累加 `tokens` / `cost`：

```tsx
export function CredentialStatsCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  modelPrices,
}: CredentialStatsCardProps) {
  const { t } = useTranslation();
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [sortKey, setSortKey] = useState<SortKey>('requests');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const hasPrices = Object.keys(modelPrices).length > 0;

  // ... 保留现有 useEffect(authFilesApi.list) 与 sourceInfoMap useMemo 不变 ...

  const rows = useMemo((): CredentialRow[] => {
    if (!usage) return [];

    const rowMap = new Map<string, CredentialRow>();

    collectUsageDetails(usage).forEach((detail) => {
      const sourceInfo = resolveSourceDisplay(
        detail.source ?? '',
        detail.auth_index,
        sourceInfoMap,
        authFileMap
      );
      const key = sourceInfo.identityKey ?? sourceInfo.displayName;
      const row =
        rowMap.get(key) ??
        ({
          key,
          displayName: sourceInfo.displayName,
          type: sourceInfo.type,
          success: 0,
          failure: 0,
          total: 0,
          successRate: 100,
          tokens: 0,
          cost: 0,
        } satisfies CredentialRow);

      if (detail.failed === true) {
        row.failure += 1;
      } else {
        row.success += 1;
      }

      row.total = row.success + row.failure;
      row.successRate = row.total > 0 ? (row.success / row.total) * 100 : 100;
      row.tokens += extractTotalTokens(detail);
      row.cost += calculateCost(detail, modelPrices);
      rowMap.set(key, row);
    });

    return Array.from(rowMap.values());
  }, [authFileMap, modelPrices, sourceInfoMap, usage]);
```

注意：`rows` 不再在 `useMemo` 内按 total 排序；排序放到下一步的 `sorted`。

- [ ] **Step 3: 实现排序状态与 sorted 列表**

紧接 `rows` 之后加入：

```tsx
  const effectiveSortKey: SortKey = hasPrices || sortKey !== 'cost' ? sortKey : 'requests';
  const effectiveSortDir: SortDir =
    hasPrices || sortKey !== 'cost' ? sortDir : 'desc';

  const handleSort = (key: SortKey) => {
    if (key === 'cost' && !hasPrices) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'credential' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo((): CredentialRow[] => {
    const list = [...rows];
    const dir = effectiveSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (effectiveSortKey === 'credential') {
        return dir * a.displayName.localeCompare(b.displayName);
      }
      if (effectiveSortKey === 'requests') {
        return dir * (a.total - b.total);
      }
      const left = a[effectiveSortKey];
      const right = b[effectiveSortKey];
      const leftValid = typeof left === 'number' && Number.isFinite(left);
      const rightValid = typeof right === 'number' && Number.isFinite(right);
      if (!leftValid && !rightValid) return 0;
      if (!leftValid) return 1;
      if (!rightValid) return -1;
      return dir * (left - right);
    });
    return list;
  }, [effectiveSortDir, effectiveSortKey, rows]);

  const arrow = (key: SortKey) =>
    effectiveSortKey === key ? (effectiveSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const ariaSort = (key: SortKey): 'none' | 'ascending' | 'descending' =>
    effectiveSortKey === key
      ? effectiveSortDir === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
```

- [ ] **Step 4: 更新表格渲染**

用可排序表头替换原 `<thead>`，用 `sorted` 替换 `rows` 渲染，并增加 Token / 总花费列：

```tsx
  return (
    <Card title={t('usage_stats.credential_stats')} className={styles.detailsFixedCard}>
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : sorted.length > 0 ? (
        <div className={styles.detailsScroll}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.sortableHeader} aria-sort={ariaSort('credential')}>
                    <button
                      type="button"
                      className={styles.sortHeaderButton}
                      onClick={() => handleSort('credential')}
                    >
                      {t('usage_stats.credential_name')}
                      {arrow('credential')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader} aria-sort={ariaSort('requests')}>
                    <button
                      type="button"
                      className={styles.sortHeaderButton}
                      onClick={() => handleSort('requests')}
                    >
                      {t('usage_stats.requests_count')}
                      {arrow('requests')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader} aria-sort={ariaSort('tokens')}>
                    <button
                      type="button"
                      className={styles.sortHeaderButton}
                      onClick={() => handleSort('tokens')}
                    >
                      {t('usage_stats.tokens_count')}
                      {arrow('tokens')}
                    </button>
                  </th>
                  <th className={styles.sortableHeader} aria-sort={ariaSort('successRate')}>
                    <button
                      type="button"
                      className={styles.sortHeaderButton}
                      onClick={() => handleSort('successRate')}
                    >
                      {t('usage_stats.success_rate')}
                      {arrow('successRate')}
                    </button>
                  </th>
                  {hasPrices && (
                    <th className={styles.sortableHeader} aria-sort={ariaSort('cost')}>
                      <button
                        type="button"
                        className={styles.sortHeaderButton}
                        onClick={() => handleSort('cost')}
                      >
                        {t('usage_stats.total_cost')}
                        {arrow('cost')}
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.key}>
                    <td className={styles.modelCell}>
                      <span>{row.displayName}</span>
                      {row.type && <span className={styles.credentialType}>{row.type}</span>}
                    </td>
                    <td>
                      <span className={styles.requestCountCell}>
                        <span>{formatCompactNumber(row.total)}</span>
                        <span className={styles.requestBreakdown}>
                          (
                          <span className={styles.statSuccess}>
                            {row.success.toLocaleString()}
                          </span>{' '}
                          <span className={styles.statFailure}>
                            {row.failure.toLocaleString()}
                          </span>
                          )
                        </span>
                      </span>
                    </td>
                    <td>{formatCompactNumber(row.tokens)}</td>
                    <td>
                      <span
                        className={
                          row.successRate >= 95
                            ? styles.statSuccess
                            : row.successRate >= 80
                              ? styles.statNeutral
                              : styles.statFailure
                        }
                      >
                        {row.successRate.toFixed(1)}%
                      </span>
                    </td>
                    {hasPrices && <td>{row.cost > 0 ? formatUsd(row.cost) : '--'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
```

保留原有 `authFileMap` 的 `useEffect` 与 `sourceInfoMap` 的 `useMemo`，不要删。

- [ ] **Step 5: 类型检查该文件相关错误**

Run: `npm run type-check`

Expected: 仅可能因 `UsagePage` 尚未传入 `modelPrices` 而报 `CredentialStatsCard` 缺 prop；`CredentialStatsCard.tsx` 自身不应有其它 TS 错误。若出现 import/`ModelPrice` 相关错误，先修再继续。

- [ ] **Step 6: Commit（若 git 身份可用）**

```bash
git add src/components/usage/CredentialStatsCard.tsx
git commit -m "$(cat <<'EOF'
feat(usage): 凭证统计增加 Token 与总花费列

在 CredentialStatsCard 中按明细聚合 token/cost，
支持表头排序，有模型价格时显示总花费。

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

若 commit 因 identity 失败：跳过，继续 Task 2，最后统一提示用户配置 git 身份。

---

### Task 2: UsagePage 接线 modelPrices

**Files:**
- Modify: `src/pages/UsagePage.tsx:436-444`

**Interfaces:**
- Consumes: `CredentialStatsCardProps.modelPrices`
- Produces: 页面传入当前 `modelPrices`（同页 `ModelStatsCard` / `PriceSettingsCard` 已使用）

- [ ] **Step 1: 传入 modelPrices**

将：

```tsx
      <CredentialStatsCard
        usage={filteredUsageSnapshot}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={openaiProvidersForUsage}
      />
```

改为：

```tsx
      <CredentialStatsCard
        usage={filteredUsageSnapshot}
        loading={loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={openaiProvidersForUsage}
        modelPrices={modelPrices}
      />
```

确认同文件内已有 `const hasPrices = ...` / `modelPrices` 来自 `useUsageData`；不要新建价格状态。

- [ ] **Step 2: 全量类型检查**

Run: `npm run type-check`

Expected: PASS，无错误。

- [ ] **Step 3: 可选 lint**

Run: `npm run lint`

Expected: 无新增与本次改动相关的 error。

- [ ] **Step 4: 手工验收清单（开发服或已连接后端的环境）**

1. 打开「使用统计」→ 凭证统计表出现 **Token数量** 列。
2. 若未配置模型单价：无「总花费」列。
3. 在下方「价格设置」配置至少一个相关模型单价后刷新/重算：出现「总花费」列；有消耗的凭证显示 `$...`，无消耗显示 `--`。
4. 点击「Token数量」「请求次数」「成功率」「总花费」「凭证」表头可排序，默认按请求次数降序。
5. 切换时间范围后，Token/花费随范围变化。

- [ ] **Step 5: Commit（若 git 身份可用）**

```bash
git add src/pages/UsagePage.tsx src/components/usage/CredentialStatsCard.tsx
git commit -m "$(cat <<'EOF'
feat(usage): 凭证统计接入模型价格并展示花费

UsagePage 向 CredentialStatsCard 传入 modelPrices，
完成 token/cost 展示与排序闭环。

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

若 identity 不可用：保留工作区改动，告知用户先配置 `user.name` / `user.email` 再提交。

---

## Spec Coverage Checklist

| Spec 要求 | 对应任务 |
|-----------|----------|
| Token 列（总量） | Task 1 |
| 总花费列 + hasPrices 控制显示 | Task 1 + Task 2 |
| 可排序表头，默认请求次数降序 | Task 1 |
| 复用 calculateCost / extractTotalTokens | Task 1 |
| UsagePage 传入 modelPrices | Task 2 |
| 不改 API / 不抽 getCredentialStats / 不新增 i18n | 全局约束 |
| cost===0 显示 `--` | Task 1 Step 4 |
| 失败请求计入 token/cost | Task 1 Step 2 |

## Self-Review

- 无 TBD/TODO
- 类型名与 props 在两任务间一致：`modelPrices: Record<string, ModelPrice>`
- 列顺序与 spec 一致：凭证 | 请求次数 | Token | 成功率 | 总花费
- 项目无 test 脚本，故用 type-check + 手工验收，不虚构 `npm test`
