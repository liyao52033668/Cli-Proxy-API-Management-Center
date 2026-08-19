import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { useNotificationStore, useAuthStore } from '@/stores';
import { modelsApi } from '@/services/api/models';
import { apiKeysApi } from '@/services/api/apiKeys';
import styles from './VisualConfigEditor.module.scss';
import { copyToClipboard } from '@/utils/clipboard';
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValidationErrorCode,
  PayloadParamValueType,
  PayloadRule,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import {
  getPayloadParamValidationError,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from '@/hooks/useVisualConfig';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';

/** Minimum character count before the expand/collapse toggle appears. */
const EXPAND_THRESHOLD = 30;

/** Auto-expanding textarea that collapses back to a single-line input on demand. */
function ExpandableInput({
  value,
  placeholder,
  ariaLabel,
  disabled,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Strip newlines — these fields are single-line identifiers/paths that
    // would break YAML serialization if they contained line breaks.
    const sanitized = e.target.value.replace(/[\r\n]/g, '');
    onChange(sanitized);
    // autoResize is handled by useLayoutEffect after React syncs the
    // sanitized value back to the DOM — calling it here would measure
    // stale content.
  };

  // Resize synchronously before paint to avoid visual flicker.
  useLayoutEffect(() => {
    if (!collapsed && textareaRef.current) {
      autoResize(textareaRef.current);
    }
  }, [collapsed, value, autoResize]);

  if (collapsed) {
    return (
      <div className={styles.expandableInputWrapper}>
        <input
          className={`input ${className ?? ''}`}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ''))}
          disabled={disabled}
        />
        {value.length > EXPAND_THRESHOLD && (
          <button
            type="button"
            className={styles.expandableToggle}
            disabled={disabled}
            onClick={() => {
              setCollapsed(false);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
              });
            }}
            title={t('common.expand')}
            aria-label={t('common.expand')}
          >
            ▼
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.expandableInputWrapper} ${styles.expandableInputExpanded}`}>
      <textarea
        ref={textareaRef}
        className={`input ${styles.expandableTextarea} ${className ?? ''}`}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        rows={2}
      />
      <button
        type="button"
        className={styles.expandableToggle}
        disabled={disabled}
        onClick={() => setCollapsed(true)}
        title={t('common.collapse')}
        aria-label={t('common.collapse')}
      >
        ▲
      </button>
    </div>
  );
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

function buildProtocolOptions(
  t: ReturnType<typeof useTranslation>['t'],
  rules: Array<{ models: PayloadModelEntry[] }>
) {
  const options: Array<{ value: string; label: string }> = VISUAL_CONFIG_PROTOCOL_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: t(option.labelKey, { defaultValue: option.defaultLabel }),
    })
  );
  const seen = new Set<string>(options.map((option) => option.value));

  for (const rule of rules) {
    for (const model of rule.models) {
      const protocol = model.protocol;
      if (!protocol || !protocol.trim() || seen.has(protocol)) continue;
      seen.add(protocol);
      options.push({ value: protocol, label: protocol });
    }
  }

  return options;
}

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const apiKeys = useMemo(
    () =>
      value
        .split('\n')
        .map((key) => key.trim())
        .filter(Boolean),
    [value]
  );
  const [apiKeyIds, setApiKeyIds] = useState(() => apiKeys.map(() => makeClientId()));
  const renderApiKeyIds = useMemo(() => {
    if (apiKeyIds.length === apiKeys.length) return apiKeyIds;
    if (apiKeyIds.length > apiKeys.length) return apiKeyIds.slice(0, apiKeys.length);
    return [
      ...apiKeyIds,
      ...Array.from({ length: apiKeys.length - apiKeyIds.length }, () => makeClientId()),
    ];
  }, [apiKeyIds, apiKeys.length]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [formError, setFormError] = useState('');

  // 模型选择相关状态
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [associatedModels, setAssociatedModels] = useState<string[]>([]);
  const [allAvailableModels, setAllAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [apiKeyModels, setApiKeyModels] = useState<Map<string, string[]>>(new Map());
  const [showAddModelDropdown, setShowAddModelDropdown] = useState(false);

  // 加载所有 API 密钥的模型白名单
  useEffect(() => {
    const loadApiKeyModels = async () => {
      try {
        const response = await fetch(`${apiBase}/v0/management/api-keys`, {
          headers: {
            'Authorization': `Bearer ${managementKey}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          const modelsMap = new Map<string, string[]>();
          // 后端返回格式: { "api-keys": [{key: "...", models: [...]}, ...] }
          const apiKeysList = data['api-keys'] || [];
          if (Array.isArray(apiKeysList)) {
            apiKeysList.forEach((item: any) => {
              if (item.key && Array.isArray(item.models)) {
                modelsMap.set(item.key, item.models);
              }
            });
          }
          setApiKeyModels(modelsMap);
        }
      } catch (error) {
        console.error('Failed to load API key models:', error);
      }
    };
    loadApiKeyModels();
  }, [apiBase, managementKey]);

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(17);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const openAddModal = () => {
    setEditingApiKeyId(null);
    setInputValue('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const editingIndex = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    setEditingApiKeyId(apiKeyId);
    setInputValue(apiKeys[editingIndex] ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setEditingApiKeyId(null);
    setFormError('');
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join('\n'));
  };

  const handleDelete = (apiKeyId: string) => {
    const index = renderApiKeyIds.findIndex((id) => id === apiKeyId);
    if (index < 0) return;
    setApiKeyIds(renderApiKeyIds.filter((id) => id !== apiKeyId));
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }

    const editingIndex = editingApiKeyId
      ? renderApiKeyIds.findIndex((id) => id === editingApiKeyId)
      : -1;
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    if (editingApiKeyId === null) {
      setApiKeyIds([...renderApiKeyIds, makeClientId()]);
    }
    updateApiKeys(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  // 打开模型选择弹窗
  const openModelModal = async (apiKey: string) => {
    setSelectedApiKey(apiKey);
    setModelModalOpen(true);
    setModelSearchQuery('');
    setShowAddModelDropdown(false);
    setAllAvailableModels([]);

    // 从后端获取最新的 API 密钥白名单配置
    try {
      const response = await fetch(`${apiBase}/v0/management/api-keys`, {
        headers: {
          'Authorization': `Bearer ${managementKey}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const apiKeysList = data['api-keys'] || [];
        const keyEntry = apiKeysList.find((item: any) => item.key === apiKey);
        const configuredModels = keyEntry?.models || [];
        setAssociatedModels(configuredModels);

        // 同时更新本地缓存
        setApiKeyModels(prev => {
          const next = new Map(prev);
          next.set(apiKey, configuredModels);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to load API key models:', error);
      // 降级到本地缓存
      const configuredModels = apiKeyModels.get(apiKey) || [];
      setAssociatedModels(configuredModels);
    }
  };

  // 点击添加按钮时，用 management key 获取所有可用模型
  const handleOpenAddModelDropdown = async () => {
    if (!showAddModelDropdown && allAvailableModels.length === 0) {
      setLoadingModels(true);
      try {
        const models = await modelsApi.fetchModels(apiBase, managementKey);
        setAllAvailableModels(models.map((m) => m.name));
      } catch (error) {
        console.error('Failed to load all available models:', error);
        showNotification(t('notification.error_loading_models'), 'error');
      } finally {
        setLoadingModels(false);
      }
    }
    setShowAddModelDropdown(!showAddModelDropdown);
    setModelSearchQuery('');
  };

  // 切换模型选择状态（多选框）
  const handleToggleModel = (modelId: string) => {
    setAssociatedModels(prev => {
      if (prev.includes(modelId)) {
        return prev.filter(m => m !== modelId);
      } else {
        return [...prev, modelId];
      }
    });
  };

  const closeModelModal = () => {
    setModelModalOpen(false);
    setSelectedApiKey('');
    setAssociatedModels([]);
    setAllAvailableModels([]);
    setModelSearchQuery('');
    setShowAddModelDropdown(false);
  };

  const handleSaveModels = async () => {
    if (!selectedApiKey) return;

    try {
      await apiKeysApi.setModels(selectedApiKey, associatedModels);

      // 更新本地状态
      setApiKeyModels(prev => {
        const next = new Map(prev);
        next.set(selectedApiKey, associatedModels);
        return next;
      });

      showNotification(t('notification.models_saved'), 'success');
      closeModelModal();
    } catch (error) {
      showNotification(t('notification.error_saving_models'), 'error');
    }
  };

  // 过滤可添加的模型（显示全部模型，用复选框区分已关联状态）
  const addableModels = allAvailableModels.filter(model =>
    model.toLowerCase().includes(modelSearchQuery.toLowerCase())
  );

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.api_keys.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.api_keys.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {apiKeys.map((key, index) => {
            const models = apiKeyModels.get(key) || [];
            return (
              <div key={renderApiKeyIds[index] ?? `${key}-${index}`} className="item-row">
                <div className="item-meta">
                  <div className="pill">#{index + 1}</div>
                  <div className="item-title">
                    {t('config_management.visual.api_keys.input_label')}
                  </div>
                  <div className="item-subtitle">{maskApiKey(String(key || ''))}</div>
                </div>
                {models.length > 0 && (
                  <div className="item-models">
                    <div className="item-models-label">{t('common.models')}:</div>
                    <div className="item-models-list">
                      {models.slice(0, 3).map(model => (
                        <span key={model} className="item-model-tag">{model}</span>
                      ))}
                      {models.length > 3 && (
                        <span className="item-model-more">+{models.length - 3}</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="item-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopy(key)}
                    disabled={disabled}
                  >
                    {t('common.copy')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openModelModal(key)}
                    disabled={disabled}
                  >
                    {t('config_management.visual.api_keys.models')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditModal(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.edit')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(renderApiKeyIds[index] ?? '')}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="hint">{t('config_management.visual.api_keys.hint')}</div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          editingApiKeyId !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingApiKeyId !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={apiKeyInputId}>
            {t('config_management.visual.api_keys.input_label')}
          </label>
          <div className={styles.apiKeyModalInputRow}>
            <input
              id={apiKeyInputId}
              className="input"
              placeholder={t('config_management.visual.api_keys.input_placeholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={disabled}
              aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
              aria-invalid={Boolean(formError)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={disabled}
            >
              {t('config_management.visual.api_keys.generate')}
            </Button>
          </div>
          <div id={apiKeyHintId} className="hint">
            {t('config_management.visual.api_keys.input_hint')}
          </div>
          {formError && (
            <div id={apiKeyErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
      </Modal>

      {/* 模型选择弹窗 */}
      <Modal
        open={modelModalOpen}
        onClose={closeModelModal}
        title={t('config_management.visual.api_keys.models_title')}
        footer={
          <>
            <Button variant="secondary" onClick={closeModelModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSaveModels} disabled={disabled || loadingModels}>
              {t('config_management.visual.common.save')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <div className="hint">{t('config_management.visual.api_keys.models_hint')}</div>

          {/* 已关联的模型列表 */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontWeight: 500, marginBottom: '8px', display: 'block' }}>{t('config_management.visual.api_keys.associated_models', '已关联的模型')}</label>

            {/* 搜索框 + 添加按钮同一行 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text"
                className="input"
                placeholder={showAddModelDropdown ? t('config_management.visual.api_keys.models_search_all_placeholder', '搜索全部模型...') : t('config_management.visual.api_keys.models_search_placeholder', '搜索关联模型...')}
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                disabled={loadingModels}
                style={{ flex: 1 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleOpenAddModelDropdown}
                disabled={disabled || loadingModels}
              >
                {showAddModelDropdown ? t('common.cancel', '取消') : t('common.add', '添加')}
              </Button>
            </div>

            {/* 添加模型的多选列表 */}
            {showAddModelDropdown && (
              <div className="addable-model-list">
                {loadingModels ? (
                  <div className="loading-state">{t('common.loading')}</div>
                ) : addableModels.length === 0 ? (
                  <div className="empty-state">{t('config_management.visual.api_keys.no_available_models', '没有可添加的模型')}</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const newModels = new Set(associatedModels);
                          addableModels.forEach(m => newModels.add(m));
                          setAssociatedModels(Array.from(newModels));
                        }}
                        disabled={disabled}
                      >
                        {t('common.select_all', '全选')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const removeSet = new Set(addableModels);
                          setAssociatedModels(associatedModels.filter(m => !removeSet.has(m)));
                        }}
                        disabled={disabled}
                      >
                        {t('common.deselect_all', '取消全选')}
                      </Button>
                    </div>
                    {addableModels.map((modelId) => (
                      <div key={modelId} className="model-item">
                        <input
                          type="checkbox"
                          checked={associatedModels.includes(modelId)}
                          onChange={() => handleToggleModel(modelId)}
                          disabled={disabled}
                          style={{ marginRight: '8px' }}
                        />
                        <span className="model-name">{modelId}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* 已关联模型列表 */}
            {loadingModels && !showAddModelDropdown ? (
              <div className="loading-state">{t('common.loading')}</div>
            ) : associatedModels.length === 0 ? (
              <div className="empty-state">{t('config_management.visual.api_keys.no_associated_models', '暂无关联模型')}</div>
            ) : (
              <div className="model-list">
                {associatedModels
                  .filter(modelId => !modelSearchQuery || modelId.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                  .map((modelId) => (
                    <div key={modelId} className="model-item">
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => handleToggleModel(modelId)}
                        disabled={disabled}
                        style={{ marginRight: '8px' }}
                      />
                      <span className="model-name">{modelId}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
});

export const StringListEditor = memo(function StringListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const items = value.length ? value : [];
  const [itemIds, setItemIds] = useState(() => items.map(() => makeClientId()));
  const renderItemIds = useMemo(() => {
    if (itemIds.length === items.length) return itemIds;
    if (itemIds.length > items.length) return itemIds.slice(0, items.length);
    return [
      ...itemIds,
      ...Array.from({ length: items.length - itemIds.length }, () => makeClientId()),
    ];
  }, [itemIds, items.length]);

  const updateItem = (index: number, nextValue: string) =>
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  const addItem = () => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  };
  const removeItem = (index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.stringList}>
      {items.map((item, index) => (
        <div key={renderItemIds[index] ?? `item-${index}`} className={styles.stringListRow}>
          <ExpandableInput
            placeholder={placeholder}
            ariaLabel={inputAriaLabel ?? placeholder}
            value={item}
            onChange={(nextValue) => updateItem(index, nextValue)}
            disabled={disabled}
          />
          <Button variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={disabled}>
            {t('config_management.visual.common.delete')}
          </Button>
        </div>
      ))}
      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addItem} disabled={disabled}>
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});

export const PayloadRulesEditor = memo(function PayloadRulesEditor({
  value,
  disabled,
  rawJsonValues = false,
  onChange,
}: {
  value: PayloadRule[];
  disabled?: boolean;
  /** @deprecated Layout no longer switches order; kept optional for call-site compatibility. */
  protocolFirst?: boolean;
  rawJsonValues?: boolean;
  onChange: (next: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);
  const payloadValueTypeOptions = useMemo(
    () =>
      VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey, { defaultValue: option.defaultLabel }),
      })),
    [t]
  );
  const booleanValueOptions = useMemo(
    () => [
      { value: 'true', label: t('config_management.visual.payload_rules.boolean_true') },
      { value: 'false', label: t('config_management.visual.payload_rules.boolean_false') },
    ],
    [t]
  );

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextParam: PayloadParamEntry = {
      id: makeClientId(),
      path: '',
      valueType: rawJsonValues ? 'json' : 'string',
      value: '',
    };
    updateRule(ruleIndex, { params: [...rule.params, nextParam] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (
    ruleIndex: number,
    paramIndex: number,
    patch: Partial<PayloadParamEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
    });
  };

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    switch (valueType) {
      case 'string':
        return t('config_management.visual.payload_rules.value_string');
      case 'number':
        return t('config_management.visual.payload_rules.value_number');
      case 'boolean':
        return t('config_management.visual.payload_rules.value_boolean');
      case 'json':
        return t('config_management.visual.payload_rules.value_json');
      default:
        return t('config_management.visual.payload_rules.value_default');
    }
  };

  const getParamErrorMessage = (param: PayloadParamEntry) => {
    const errorCode = getPayloadParamValidationError(
      rawJsonValues ? { ...param, valueType: 'json' } : param
    );
    return getValidationMessage(t, errorCode);
  };

  const renderParamValueEditor = (
    ruleIndex: number,
    paramIndex: number,
    param: PayloadParamEntry
  ) => {
    if (rawJsonValues) {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={t('config_management.visual.payload_rules.value_raw_json')}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) =>
            updateParam(ruleIndex, paramIndex, { value: e.target.value, valueType: 'json' })
          }
          disabled={disabled}
        />
      );
    }

    if (param.valueType === 'boolean') {
      return (
        <Select
          value={
            param.value.toLowerCase() === 'true' || param.value.toLowerCase() === 'false'
              ? param.value.toLowerCase()
              : ''
          }
          options={booleanValueOptions}
          placeholder={t('config_management.visual.payload_rules.value_boolean')}
          disabled={disabled}
          ariaLabel={t('config_management.visual.payload_rules.param_value')}
          onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        />
      );
    }

    if (param.valueType === 'json') {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={getValuePlaceholder(param.valueType)}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
          disabled={disabled}
        />
      );
    }

    return (
      <ExpandableInput
        placeholder={getValuePlaceholder(param.valueType)}
        ariaLabel={t('config_management.visual.payload_rules.param_value')}
        value={param.value}
        onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
            >
              {t('config_management.visual.common.delete')}
            </Button>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.models')}
            </div>
            {(rule.models.length ? rule.models : []).map((model, modelIndex) => (
              <div key={model.id} className={styles.payloadRuleModelRow}>
                <div className={styles.payloadRuleModelRowMain}>
                  <ExpandableInput
                    placeholder={t('config_management.visual.payload_rules.model_name')}
                    ariaLabel={t('config_management.visual.payload_rules.model_name')}
                    value={model.name}
                    onChange={(nextValue) => updateModel(ruleIndex, modelIndex, { name: nextValue })}
                    disabled={disabled}
                  />
                </div>
                <div className={styles.payloadRuleModelRowControls}>
                  <Select
                    value={model.protocol ?? ''}
                    options={protocolOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                    onChange={(nextValue) =>
                      updateModel(ruleIndex, modelIndex, {
                        protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.params')}
            </div>
            {(rule.params.length ? rule.params : []).map((param, paramIndex) => {
              const paramError = getParamErrorMessage(param);

              const deleteButton = (
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => removeParam(ruleIndex, paramIndex)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              );

              return (
                <div key={param.id} className={styles.payloadRuleParamGroup}>
                  {rawJsonValues ? (
                    <div className={styles.payloadRuleParamRow}>
                      <div className={styles.payloadRuleParamPathWithActionRow}>
                        <ExpandableInput
                          placeholder={t('config_management.visual.payload_rules.json_path')}
                          ariaLabel={t('config_management.visual.payload_rules.json_path')}
                          value={param.path}
                          onChange={(nextValue) =>
                            updateParam(ruleIndex, paramIndex, { path: nextValue })
                          }
                          disabled={disabled}
                        />
                        {deleteButton}
                      </div>
                      <div className={styles.payloadRuleParamValueRow}>
                        {renderParamValueEditor(ruleIndex, paramIndex, param)}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.payloadRuleParamInlineRow}>
                      <ExpandableInput
                        placeholder={t('config_management.visual.payload_rules.json_path')}
                        ariaLabel={t('config_management.visual.payload_rules.json_path')}
                        value={param.path}
                        onChange={(nextValue) =>
                          updateParam(ruleIndex, paramIndex, { path: nextValue })
                        }
                        disabled={disabled}
                      />
                      <Select
                        value={param.valueType}
                        options={payloadValueTypeOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.param_type')}
                        onChange={(nextValue) =>
                          updateParam(ruleIndex, paramIndex, {
                            valueType: nextValue as PayloadParamValueType,
                            value:
                              nextValue === 'boolean'
                                ? 'true'
                                : nextValue === 'json' && param.value.trim() === ''
                                  ? '{}'
                                  : param.value,
                          })
                        }
                      />
                      <div className={styles.payloadRuleParamInlineValue}>
                        {renderParamValueEditor(ruleIndex, paramIndex, param)}
                      </div>
                      {deleteButton}
                    </div>
                  )}
                  {paramError && (
                    <div className={`error-box ${styles.payloadParamError}`}>{paramError}</div>
                  )}
                </div>
              );
            })}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addParam(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});

export const PayloadFilterRulesEditor = memo(function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
            >
              {t('config_management.visual.common.delete')}
            </Button>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.models')}
            </div>
            {rule.models.map((model, modelIndex) => (
              <div key={model.id} className={styles.payloadFilterModelRow}>
                <div className={styles.payloadRuleModelRowMain}>
                  <ExpandableInput
                    placeholder={t('config_management.visual.payload_rules.model_name')}
                    ariaLabel={t('config_management.visual.payload_rules.model_name')}
                    value={model.name}
                    onChange={(nextValue) => updateModel(ruleIndex, modelIndex, { name: nextValue })}
                    disabled={disabled}
                  />
                </div>
                <div className={styles.payloadRuleModelRowControls}>
                  <Select
                    value={model.protocol ?? ''}
                    options={protocolOptions}
                    disabled={disabled}
                    ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                    onChange={(nextValue) =>
                      updateModel(ruleIndex, modelIndex, {
                        protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.payloadRowActionButton}
                    onClick={() => removeModel(ruleIndex, modelIndex)}
                    disabled={disabled}
                  >
                    {t('config_management.visual.common.delete')}
                  </Button>
                </div>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_model')}
              </Button>
            </div>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.remove_params')}
            </div>
            <StringListEditor
              value={rule.params}
              disabled={disabled}
              placeholder={t('config_management.visual.payload_rules.json_path_filter')}
              inputAriaLabel={t('config_management.visual.payload_rules.json_path_filter')}
              onChange={(params) => updateRule(ruleIndex, { params })}
            />
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});
