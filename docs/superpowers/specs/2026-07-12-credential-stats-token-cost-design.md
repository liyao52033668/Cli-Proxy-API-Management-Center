# 凭证统计展示 Token 与总花费

日期：2026-07-12  
状态：已确认

## 背景

使用统计页的「凭证统计」卡片（`CredentialStatsCard`）当前只展示每个凭证的请求次数与成功率。同一页面的「模型统计」「API 统计」已支持 Token 与总花费（花费依赖用户配置的模型价格）。用户希望在凭证维度也能看到对应的 Token 用量与总花费，便于对比不同凭证的资源消耗。

## 目标

在凭证统计表中为每个凭证补充：

1. **Token 数量**（总量）
2. **总花费**（有模型价格配置时）

并支持表头排序。

## 非目标

- 不新增后端 API 或改动 Management API
- 不展示 input / output / cached 等 Token 细分列
- 不抽独立的 `getCredentialStats` 工具函数（仅此卡片使用）
- 不扩展导入/导出字段
- 不新增单元测试（项目当前无 test 脚本）

## 方案选择

采用 **在现有 `CredentialStatsCard` 内增量扩展**（方案 A）：

- 复用 `collectUsageDetails` 明细聚合路径
- 复用 `extractTotalTokens` / `calculateCost` / `formatCompactNumber` / `formatUsd`
- 与模型统计同一价格口径与失败请求处理方式

备选方案（不采用）：

- **抽公共聚合工具**：当前仅一处消费，过度设计
- **走 `UsageIdentity` 后端聚合**：与当前时间范围过滤、前端价格配置体系不一致，且缺少 cost

## 数据流

```
UsagePage
  filteredUsageSnapshot ──┐
  modelPrices ────────────┼──► CredentialStatsCard
  provider configs ───────┘
                              │
                              ├─ collectUsageDetails(usage)
                              ├─ resolveSourceDisplay(...)  // 现有凭证归行
                              ├─ extractTotalTokens(detail)
                              └─ calculateCost(detail, modelPrices)
```

不新增 API、store 或 utils 公共接口。

## 数据结构

### CredentialRow（扩展）

```ts
interface CredentialRow {
  key: string;
  displayName: string;
  type: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
  tokens: number; // 新增
  cost: number;   // 新增
}
```

### Props（扩展）

```ts
export interface CredentialStatsCardProps {
  usage: UsagePayload | null;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  modelPrices: Record<string, ModelPrice>; // 新增
}
```

组件内：`hasPrices = Object.keys(modelPrices).length > 0`。

## 聚合规则

对 `collectUsageDetails(usage)` 的每条明细：

1. 用现有 `resolveSourceDisplay(detail.source, detail.auth_index, sourceInfoMap, authFileMap)` 得到凭证身份与展示名
2. 以 `sourceInfo.identityKey ?? sourceInfo.displayName` 为行 key（与现有一致）
3. 累加：
   - `success` / `failure`：`detail.failed === true` 则 failure +1，否则 success +1
   - `total` / `successRate`：由 success + failure 推导
   - `tokens`：`+= extractTotalTokens(detail)`
   - `cost`：`+= calculateCost(detail, modelPrices)`

说明：

- 失败请求也计入 token 与 cost，与 `getModelStats` / `calculateTotalCost` 口径一致
- 未配置某模型价格时，该明细 cost 为 0，不阻塞 token 汇总
- 默认排序：按 `total`（请求次数）降序；引入可排序表头后默认仍为请求次数降序

## UI 与交互

### 列布局

| 列 | 内容 | 可排序 | 显示条件 |
|----|------|--------|----------|
| 凭证 | 显示名 + type 标签 | 是（按 displayName） | 始终 |
| 请求次数 | `total (success failure)` 现有样式 | 是 | 始终 |
| Token | `formatCompactNumber(tokens)` | 是 | 始终 |
| 成功率 | `xx.x%`，沿用 ≥95 / ≥80 颜色阈值 | 是 | 始终 |
| 总花费 | `formatUsd(cost)`；`cost === 0` 显示 `--` | 是 | 仅 `hasPrices` |

### 排序

对齐 `ModelStatsCard`：

- `SortKey`: `'credential' | 'requests' | 'tokens' | 'successRate' | 'cost'`
- 默认：`requests` + `desc`
- 切换列：名称列默认 `asc`，数值列默认 `desc`；同列再次点击切换升降序
- 表头使用现有 `sortableHeader` / `sortHeaderButton`，展示 `▲/▼` 与 `aria-sort`
- 无价格时不渲染 cost 列；若排序键为 `cost` 且价格被清空，回退到 `requests` + `desc`

### 样式与文案

- 样式：复用 `UsagePage.module.scss` 现有类，不新增布局结构
- i18n：复用 `usage_stats.tokens_count`、`usage_stats.total_cost`、`usage_stats.credential_name`、`usage_stats.requests_count`、`usage_stats.success_rate` 等，原则上不新增 key

## 文件改动

1. `src/components/usage/CredentialStatsCard.tsx`
   - 扩展 row / props
   - 聚合 tokens / cost
   - 可排序表头 + Token / 总花费列
2. `src/pages/UsagePage.tsx`
   - 向 `CredentialStatsCard` 传入 `modelPrices={modelPrices}`

## 边界情况

| 场景 | 行为 |
|------|------|
| `usage` 为空或无明细 | 现有「无数据」提示 |
| loading | 现有 loading 提示 |
| 未配置任何模型价格 | 隐藏总花费列，Token 仍显示 |
| 有价格但该凭证 cost 为 0 | 显示 `--` |
| 价格配置变更 | `modelPrices` 变化后 cost 重算 |
| 未知 source / 解析失败 | 仍按现有 resolve 归行，token/cost 照常累加 |

## 验收标准

1. 凭证统计表出现 Token 列，数值为该凭证明细 token 之和
2. 配置过模型价格后出现总花费列，数值等于同时间范围、同价格下按凭证汇总的 `calculateCost` 之和
3. 未配置价格时不显示总花费列
4. 凭证名 / 请求次数 / Token / 成功率 / 总花费可排序；默认按请求次数降序
5. 时间范围切换后，token 与 cost 随 `filteredUsageSnapshot` 更新

## 实现备注

- 直接 import `@/utils/usage` 中已有符号，避免重复实现计费逻辑
- 保持卡片标题、高度、滚动容器与现有一致，仅扩展列
