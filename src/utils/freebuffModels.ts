/**
 * Freebuff (Codebuff) 模型目录的类型与纯函数。
 *
 * 目录数据不在这里：上游 codebuff.com 没有模型列表接口，后端把编译期目录
 * 通过 `GET /freebuff/models` 暴露出来，前端在编辑页拉取后使用。
 * 这样模型表只在后端维护一份，前端不再硬编码。
 *
 * 注意：后端返回的 agentId 是当前 base3 harness 的根 agent，
 * legacyAgentId 是 base2 回滚 id。
 */

export interface FreebuffCatalogModel {
  /** 上游模型 id（wire 协议里传给 chat/completions 的 model）。 */
  id: string;
  /** 官方选择器里显示的名字。 */
  name: string;
  /** 当前 base3 harness 的 root agent id。 */
  agentId: string;
  /** 旧 base2 harness 的 root agent id，仅用于回滚。 */
  legacyAgentId?: string;
  /** 是否出现在 freebuff 客户端的选择器网格里。 */
  inPicker: boolean;
  /** 上下文窗口。 */
  contextLength?: number;
}

interface FreebuffCatalogModelResponse {
  id?: unknown;
  name?: unknown;
  agent_id?: unknown;
  agentId?: unknown;
  legacy_agent_id?: unknown;
  legacyAgentId?: unknown;
  in_picker?: unknown;
  inPicker?: unknown;
  context_length?: unknown;
  contextLength?: unknown;
}

const toTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 把后端响应规范化为前端类型；缺失 id 或 agent 的条目会被丢弃。 */
export const normalizeFreebuffCatalog = (raw: unknown): FreebuffCatalogModel[] => {
  if (!Array.isArray(raw)) return [];
  return raw.reduce<FreebuffCatalogModel[]>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const record = item as FreebuffCatalogModelResponse;
    const id = toTrimmedString(record.id);
    const agentId = toTrimmedString(record.agent_id) || toTrimmedString(record.agentId);
    if (!id || !agentId) return acc;

    const entry: FreebuffCatalogModel = { id, name: toTrimmedString(record.name) || id, agentId, inPicker: false };
    const legacy =
      toTrimmedString(record.legacy_agent_id) || toTrimmedString(record.legacyAgentId);
    if (legacy) entry.legacyAgentId = legacy;
    const inPicker = record.in_picker ?? record.inPicker;
    if (typeof inPicker === 'boolean') entry.inPicker = inPicker;

    const contextLength = record.context_length ?? record.contextLength;
    if (contextLength !== undefined && contextLength !== null && String(contextLength).trim() !== '') {
      const parsed = Number(contextLength);
      if (Number.isFinite(parsed) && parsed > 0) entry.contextLength = parsed;
    }
    acc.push(entry);
    return acc;
  }, []);
};

/**
 * 按模型名解析候选 agent id。匹配规则与后端 lookupFreebuffBuiltin 一致：
 * 先精确匹配完整 id，再按短名（最后一段）匹配。
 */
export const lookupFreebuffAgentId = (
  catalog: FreebuffCatalogModel[],
  model: string
): string | undefined => {
  const trimmed = String(model ?? '').trim();
  if (!trimmed || !catalog.length) return undefined;
  const lower = trimmed.toLowerCase();
  const shortName = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;

  const exact = catalog.find((item) => item.id.toLowerCase() === lower);
  if (exact) return exact.agentId;

  const byShortName = catalog.find((item) => {
    const itemLower = item.id.toLowerCase();
    const itemShort = itemLower.includes('/')
      ? itemLower.slice(itemLower.lastIndexOf('/') + 1)
      : itemLower;
    return itemShort === shortName;
  });
  return byShortName?.agentId;
};

/** 模型候选：value 为上游模型 id，label 显示官方名称。 */
export const freebuffModelOptions = (
  catalog: FreebuffCatalogModel[]
): { value: string; label: string }[] =>
  catalog.map((item) => ({ value: item.id, label: item.name }));

/** agent 候选：base3 为当前 harness，base2 标注为 legacy 供回滚使用。 */
export const freebuffAgentIdOptions = (
  catalog: FreebuffCatalogModel[]
): { value: string; label: string }[] =>
  catalog.flatMap((item) => {
    const options = [{ value: item.agentId, label: `${item.name} · ${item.id}` }];
    if (item.legacyAgentId) {
      options.push({ value: item.legacyAgentId, label: `${item.name} · legacy base2` });
    }
    return options;
  });
