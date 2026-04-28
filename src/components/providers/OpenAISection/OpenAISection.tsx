import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import {
  IconCheck,
  IconChevronDown,
  IconSlidersHorizontal,
  IconX,
} from '@/components/ui/icons';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import { calculateStatusBarData, type KeyStats } from '@/utils/usage';
import { type UsageDetailsByAuthIndex, type UsageDetailsBySource } from '@/utils/usageIndex';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import {
  collectOpenAIProviderUsageDetails,
  getOpenAIProviderKey,
  getOpenAIProviderStats,
  getStatsForIdentity,
} from '../utils';

interface FloatingToolbarStyle {
  left: number;
  top: number;
  width: number;
  visible: boolean;
}

const EMPTY_STATUS_BAR = calculateStatusBarData([]);

interface OpenAISectionProps {
  configs: OpenAIProviderConfig[];
  keyStats: KeyStats;
  usageDetailsBySource: UsageDetailsBySource;
  usageDetailsByAuthIndex: UsageDetailsByAuthIndex;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  resolvedTheme: string;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

interface IndexedOpenAIProvider {
  config: OpenAIProviderConfig;
  originalIndex: number;
}

const getApiKeyEntryRenderKey = (
  entry: NonNullable<OpenAIProviderConfig['apiKeyEntries']>[number],
  entryIndex: number
) => {
  const authIndex = entry.authIndex == null ? '' : String(entry.authIndex).trim();
  return authIndex ? `auth-index-${authIndex}` : `api-key-entry-${entryIndex}`;
};

export function OpenAISection({
  configs,
  keyStats,
  usageDetailsBySource,
  usageDetailsByAuthIndex,
  loading,
  disableControls,
  isSwitching,
  resolvedTheme,
  onAdd,
  onEdit,
  onDelete,
}: OpenAISectionProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isTransitionAnimating = pageTransitionLayer?.isAnimating ?? false;
  const actionsDisabled = disableControls || loading || isSwitching;

  // 模型筛选状态
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [modelDropdownLayout, setModelDropdownLayout] = useState({ openAbove: false, maxHeight: 300 });

  // 提供商筛选状态
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [providerDropdownLayout, setProviderDropdownLayout] = useState({ openAbove: false, maxHeight: 300 });

  const [floatingToolbarStyle, setFloatingToolbarStyle] = useState<FloatingToolbarStyle>({
    left: 0,
    top: 0,
    width: 0,
    visible: false,
  });
  const [isFloatingToolbarExpanded, setIsFloatingToolbarExpanded] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const topToolbarAnchorRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const providerDropdownRef = useRef<HTMLDivElement>(null);

  const shouldRenderFloatingToolbar = !isTransitionAnimating && floatingToolbarStyle.visible;

  useEffect(() => {
    if (isTransitionAnimating) {
      return;
    }

    const updateFloatingToolbar = () => {
      const section = sectionRef.current;
      const anchor = topToolbarAnchorRef.current;

      if (!section || !anchor) {
        return;
      }

      const sectionRect = section.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const rootStyles = getComputedStyle(document.documentElement);
      const fixedTop = Number.parseFloat(rootStyles.getPropertyValue('--header-height')) || 64;
      const toolbarHeight = anchorRect.height;
      const isMobile = window.innerWidth <= 768;
      const shouldShow =
        !isMobile && anchorRect.top <= fixedTop && sectionRect.bottom > fixedTop + toolbarHeight;

      setFloatingToolbarStyle((prev) => {
        const next = {
          left: sectionRect.left,
          top: fixedTop,
          width: sectionRect.width,
          visible: shouldShow,
        };

        if (
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.visible === next.visible
        ) {
          return prev;
        }

        // 当隐藏时自动收起
        if (!shouldShow) {
          setIsFloatingToolbarExpanded(false);
        }

        return next;
      });
    };

    updateFloatingToolbar();
    window.addEventListener('resize', updateFloatingToolbar);
    window.addEventListener('scroll', updateFloatingToolbar, true);

    return () => {
      window.removeEventListener('resize', updateFloatingToolbar);
      window.removeEventListener('scroll', updateFloatingToolbar, true);
    };
  }, [isTransitionAnimating]);

  // 模型下拉菜单点击外部关闭
  useEffect(() => {
    if (!isModelDropdownOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedModel = modelDropdownRef.current?.contains(target);

      if (!clickedModel) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModelDropdownOpen]);

  // 提供商下拉菜单点击外部关闭
  useEffect(() => {
    if (!isProviderDropdownOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedProvider = providerDropdownRef.current?.contains(target);

      if (!clickedProvider) {
        setIsProviderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProviderDropdownOpen]);

  // 模型下拉菜单位置更新
  useEffect(() => {
    if (!isModelDropdownOpen) {
      return;
    }

    const updateDropdownLayout = () => {
      const wrapper = floatingToolbarStyle.visible
        ? modelDropdownRef.current
        : modelDropdownRef.current;

      if (!wrapper) {
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const viewportPadding = 12;
      const dropdownGap = 4;
      const preferredMaxHeight = 300;
      const minimumMaxHeight = 120;
      const availableBelow = Math.max(
        0,
        window.innerHeight - rect.bottom - viewportPadding - dropdownGap
      );
      const availableAbove = Math.max(0, rect.top - viewportPadding - dropdownGap);
      const openAbove = availableBelow < preferredMaxHeight && availableAbove > availableBelow;
      const availableSpace = openAbove ? availableAbove : availableBelow;
      const maxHeight = Math.max(minimumMaxHeight, Math.min(preferredMaxHeight, availableSpace));

      setModelDropdownLayout((prev) => {
        if (prev.openAbove === openAbove && prev.maxHeight === maxHeight) {
          return prev;
        }
        return { openAbove, maxHeight };
      });
    };

    updateDropdownLayout();
    window.addEventListener('resize', updateDropdownLayout);
    window.addEventListener('scroll', updateDropdownLayout, true);

    return () => {
      window.removeEventListener('resize', updateDropdownLayout);
      window.removeEventListener('scroll', updateDropdownLayout, true);
    };
  }, [floatingToolbarStyle.visible, isModelDropdownOpen]);

  // 提供商下拉菜单位置更新
  useEffect(() => {
    if (!isProviderDropdownOpen) {
      return;
    }

    const updateDropdownLayout = () => {
      const wrapper = floatingToolbarStyle.visible
        ? providerDropdownRef.current
        : providerDropdownRef.current;

      if (!wrapper) {
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const viewportPadding = 12;
      const dropdownGap = 4;
      const preferredMaxHeight = 300;
      const minimumMaxHeight = 120;
      const availableBelow = Math.max(
        0,
        window.innerHeight - rect.bottom - viewportPadding - dropdownGap
      );
      const availableAbove = Math.max(0, rect.top - viewportPadding - dropdownGap);
      const openAbove = availableBelow < preferredMaxHeight && availableAbove > availableBelow;
      const availableSpace = openAbove ? availableAbove : availableBelow;
      const maxHeight = Math.max(minimumMaxHeight, Math.min(preferredMaxHeight, availableSpace));

      setProviderDropdownLayout((prev) => {
        if (prev.openAbove === openAbove && prev.maxHeight === maxHeight) {
          return prev;
        }
        return { openAbove, maxHeight };
      });
    };

    updateDropdownLayout();
    window.addEventListener('resize', updateDropdownLayout);
    window.addEventListener('scroll', updateDropdownLayout, true);

    return () => {
      window.removeEventListener('resize', updateDropdownLayout);
      window.removeEventListener('scroll', updateDropdownLayout, true);
    };
  }, [floatingToolbarStyle.visible, isProviderDropdownOpen]);

  // 获取所有模型名称
  const allModelNames = useMemo(() => {
    const modelSet = new Set<string>();
    configs.forEach((provider) => {
      provider.models?.forEach((model) => {
        if (model.name) {
          modelSet.add(model.name);
        }
      });
    });
    return Array.from(modelSet).sort();
  }, [configs]);

  // 过滤后的模型名称
  const filteredModelNames = useMemo(() => {
    if (!modelSearchQuery.trim()) {
      return allModelNames;
    }
    const query = modelSearchQuery.toLowerCase();
    return allModelNames.filter((name) => name.toLowerCase().includes(query));
  }, [allModelNames, modelSearchQuery]);

  // 获取所有提供商名称
  const allProviderNames = useMemo(() => {
    return configs.map((config) => config.name).sort();
  }, [configs]);

  // 过滤后的提供商名称
  const filteredProviderNames = useMemo(() => {
    if (!providerSearchQuery.trim()) {
      return allProviderNames;
    }
    const query = providerSearchQuery.toLowerCase();
    return allProviderNames.filter((name) => name.toLowerCase().includes(query));
  }, [allProviderNames, providerSearchQuery]);

  // 模型筛选相关
  const selectedModelNames = useMemo(() => Array.from(selectedModels).sort(), [selectedModels]);
  const modelFilterActive = selectedModelNames.length > 0;
  const modelFilterLabel = modelFilterActive
    ? t('ai_providers.model_discovery_selected_count', { count: selectedModelNames.length })
    : t('ai_providers.model_search_placeholder');
  const modelFilterTitle = modelFilterActive
    ? selectedModelNames.join(', ')
    : t('ai_providers.model_search_placeholder');

  // 提供商筛选相关
  const selectedProviderNames = useMemo(() => Array.from(selectedProviders).sort(), [selectedProviders]);
  const providerFilterActive = selectedProviderNames.length > 0;
  const providerFilterLabel = providerFilterActive
    ? t('ai_providers.provider_selected_count', { count: selectedProviderNames.length })
    : t('ai_providers.provider_search_placeholder');
  const providerFilterTitle = providerFilterActive
    ? selectedProviderNames.join(', ')
    : t('ai_providers.provider_search_placeholder');

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    configs.forEach((provider, index) => {
      const providerKey = getOpenAIProviderKey(provider, index);
      cache.set(
        providerKey,
        calculateStatusBarData(
          collectOpenAIProviderUsageDetails(provider, usageDetailsBySource, usageDetailsByAuthIndex)
        )
      );
    });

    return cache;
  }, [configs, usageDetailsByAuthIndex, usageDetailsBySource]);

  // 过滤后的配置列表
  const filteredConfigs = useMemo<IndexedOpenAIProvider[]>(() => {
    return configs
      .map((config, originalIndex) => ({ config, originalIndex }))
      .filter(({ config }) => {
        // 按提供商筛选
        if (selectedProviders.size > 0 && !selectedProviders.has(config.name)) {
          return false;
        }
        // 按模型筛选
        if (selectedModels.size > 0) {
          return config.models?.some((model) => selectedModels.has(model.name));
        }
        return true;
      });
  }, [configs, selectedModels, selectedProviders]);

  // 模型选择操作
  const toggleModelSelection = (modelName: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) {
        next.delete(modelName);
      } else {
        next.add(modelName);
      }
      return next;
    });
  };

  const clearAllModels = () => {
    setSelectedModels(new Set());
  };

  // 提供商选择操作
  const toggleProviderSelection = (providerName: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerName)) {
        next.delete(providerName);
      } else {
        next.add(providerName);
      }
      return next;
    });
  };

  const clearAllProviders = () => {
    setSelectedProviders(new Set());
  };

  // 渲染模型筛选器
  const renderModelFilter = (isFloating = false) => {
    const isActiveToolbar = isFloating === shouldRenderFloatingToolbar;
    const dropdownClassName = modelDropdownLayout.openAbove
      ? `${styles.modelDropdownList} ${styles.modelDropdownListAbove}`
      : styles.modelDropdownList;

    return (
      <div
        className={styles.modelMultiSelectWrapper}
        ref={modelDropdownRef}
      >
        <div
          className={[
            styles.modelFilterControl,
            modelFilterActive ? styles.modelFilterControlActive : '',
            actionsDisabled ? styles.modelFilterControlDisabled : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className={styles.modelFilterTrigger}
            onClick={() => {
              setIsModelDropdownOpen(!isModelDropdownOpen);
              setIsProviderDropdownOpen(false);
            }}
            disabled={actionsDisabled}
            title={modelFilterTitle}
            aria-label={modelFilterTitle}
            aria-haspopup="true"
            aria-expanded={isActiveToolbar && isModelDropdownOpen}
          >
            <span className={styles.modelFilterIcon} aria-hidden="true">
              <IconSlidersHorizontal size={14} />
            </span>
            <span className={styles.modelFilterText}>{modelFilterLabel}</span>
            {modelFilterActive && (
              <span className={styles.modelFilterCount}>{selectedModelNames.length}</span>
            )}
            <span className={styles.modelFilterChevron} aria-hidden="true">
              <IconChevronDown size={14} />
            </span>
          </button>
          {modelFilterActive && (
            <button
              type="button"
              className={styles.modelFilterInlineClear}
              onClick={clearAllModels}
              disabled={actionsDisabled}
              aria-label={t('ai_providers.model_search_clear')}
              title={t('ai_providers.model_search_clear')}
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        {isModelDropdownOpen && (
          <div
            className={dropdownClassName}
            style={{ maxHeight: `${modelDropdownLayout.maxHeight}px` }}
          >
            <div className={styles.modelDropdownHeader}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedModels(new Set(filteredModelNames))}
                className={styles.modelDropdownSelectAll}
                disabled={filteredModelNames.length === 0}
              >
                {t('ai_providers.model_select_all')}
              </Button>
              <div className={styles.modelDropdownSearchWrapper}>
                <Input
                  type="text"
                  placeholder={t('ai_providers.model_search_placeholder')}
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  className={styles.modelDropdownSearchInput}
                />
              </div>
              <div className={styles.modelDropdownHeaderRight}>
                {modelFilterActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllModels}
                    className={styles.modelDropdownClear}
                  >
                    {t('ai_providers.model_search_clear')}
                  </Button>
                )}
              </div>
            </div>
            <div
              className={styles.modelDropdownItems}
              role="group"
              aria-label={t('ai_providers.model_search_placeholder')}
            >
              {allModelNames.length === 0 ? (
                <div className={styles.modelDropdownEmpty}>
                  {t('ai_providers.model_filter_empty')}
                </div>
              ) : filteredModelNames.length === 0 ? (
                <div className={styles.modelDropdownEmpty}>
                  {t('ai_providers.model_search_no_results')}
                </div>
              ) : (
                filteredModelNames.map((name) => (
                  <SelectionCheckbox
                    key={`model-option-${name}`}
                    checked={selectedModels.has(name)}
                    onChange={() => toggleModelSelection(name)}
                    className={styles.modelDropdownItem}
                    labelClassName={styles.modelDropdownItemLabel}
                    label={<span title={name}>{name}</span>}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染提供商筛选器
  const renderProviderFilter = (isFloating = false) => {
    const isActiveToolbar = isFloating === shouldRenderFloatingToolbar;
    const dropdownClassName = providerDropdownLayout.openAbove
      ? `${styles.providerDropdownList} ${styles.providerDropdownListAbove}`
      : styles.providerDropdownList;

    return (
      <div
        className={styles.modelMultiSelectWrapper}
        ref={providerDropdownRef}
      >
        <div
          className={[
            styles.providerFilterControl,
            providerFilterActive ? styles.providerFilterControlActive : '',
            actionsDisabled ? styles.providerFilterControlDisabled : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className={styles.modelFilterTrigger}
            onClick={() => {
              setIsProviderDropdownOpen(!isProviderDropdownOpen);
              setIsModelDropdownOpen(false);
            }}
            disabled={actionsDisabled}
            title={providerFilterTitle}
            aria-label={providerFilterTitle}
            aria-haspopup="true"
            aria-expanded={isActiveToolbar && isProviderDropdownOpen}
          >
            <span className={styles.providerFilterIcon} aria-hidden="true">
              <IconSlidersHorizontal size={14} />
            </span>
            <span className={styles.providerFilterText}>{providerFilterLabel}</span>
            {providerFilterActive && (
              <span className={styles.providerFilterCount}>{selectedProviderNames.length}</span>
            )}
            <span className={styles.providerFilterChevron} aria-hidden="true">
              <IconChevronDown size={14} />
            </span>
          </button>
          {providerFilterActive && (
            <button
              type="button"
              className={styles.providerFilterInlineClear}
              onClick={clearAllProviders}
              disabled={actionsDisabled}
              aria-label={t('ai_providers.provider_search_clear')}
              title={t('ai_providers.provider_search_clear')}
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        {isProviderDropdownOpen && (
          <div
            className={dropdownClassName}
            style={{ maxHeight: `${providerDropdownLayout.maxHeight}px` }}
          >
            <div className={styles.modelDropdownHeader}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProviders(new Set(filteredProviderNames))}
                className={styles.modelDropdownSelectAll}
                disabled={filteredProviderNames.length === 0}
              >
                {t('ai_providers.provider_select_all')}
              </Button>
              <div className={styles.modelDropdownSearchWrapper}>
                <Input
                  type="text"
                  placeholder={t('ai_providers.provider_search_placeholder')}
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                  className={styles.modelDropdownSearchInput}
                />
              </div>
              <div className={styles.modelDropdownHeaderRight}>
                {providerFilterActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllProviders}
                    className={styles.modelDropdownClear}
                  >
                    {t('ai_providers.provider_search_clear')}
                  </Button>
                )}
              </div>
            </div>
            <div
              className={styles.modelDropdownItems}
              role="group"
              aria-label={t('ai_providers.provider_search_placeholder')}
            >
              {allProviderNames.length === 0 ? (
                <div className={styles.modelDropdownEmpty}>
                  {t('ai_providers.provider_filter_empty')}
                </div>
              ) : filteredProviderNames.length === 0 ? (
                <div className={styles.modelDropdownEmpty}>
                  {t('ai_providers.provider_search_no_results')}
                </div>
              ) : (
                filteredProviderNames.map((name) => (
                  <SelectionCheckbox
                    key={`provider-option-${name}`}
                    checked={selectedProviders.has(name)}
                    onChange={() => toggleProviderSelection(name)}
                    className={styles.modelDropdownItem}
                    labelClassName={styles.modelDropdownItemLabel}
                    label={<span title={name}>{name}</span>}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderToolbar = (isFloating = false) => {
    return (
      <div className={styles.cardHeaderActions}>
        {renderModelFilter(isFloating)}
        {renderProviderFilter(isFloating)}
        <Button
          size="sm"
          onClick={onAdd}
          disabled={actionsDisabled}
          className={styles.openaiAddButton}
        >
          {t('ai_providers.openai_add_button')}
        </Button>
      </div>
    );
  };

  const renderStaticTitle = () => (
    <span className={styles.cardTitle}>
      <img
        src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
        alt=""
        className={styles.cardTitleIcon}
      />
      {t('ai_providers.openai_title')}
    </span>
  );

  const renderProviderCard = ({ config: provider, originalIndex }: IndexedOpenAIProvider) => {
    const stats = getOpenAIProviderStats(provider, keyStats);
    const headerEntries = Object.entries(provider.headers || {});
    const apiKeyEntries = provider.apiKeyEntries || [];
    const statusData =
      statusBarCache.get(getOpenAIProviderKey(provider, originalIndex)) || EMPTY_STATUS_BAR;

    return (
      <div
        key={`openai-provider-${originalIndex}`}
        className={styles.openaiProviderCard}
        style={actionsDisabled ? { opacity: 0.6 } : undefined}
      >
        <div className={styles.openaiProviderMeta}>
          <div className={styles.openaiProviderTitle}>{provider.name}</div>
          {provider.priority !== undefined && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('common.priority')}:</span>
              <span className={styles.fieldValue}>{provider.priority}</span>
            </div>
          )}
          {provider.prefix && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('common.prefix')}:</span>
              <span className={styles.fieldValue}>{provider.prefix}</span>
            </div>
          )}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
            <span className={styles.fieldValue}>{provider.baseUrl}</span>
          </div>
          {headerEntries.length > 0 && (
            <div className={styles.headerBadgeList}>
              {headerEntries.map(([key, value]) => (
                <span key={key} className={styles.headerBadge}>
                  <strong>{key}:</strong> {value}
                </span>
              ))}
            </div>
          )}
          {apiKeyEntries.length > 0 && (
            <div className={styles.apiKeyEntriesSection}>
              <div className={styles.apiKeyEntriesLabel}>
                {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
              </div>
              <div className={styles.apiKeyEntryList}>
                {apiKeyEntries.map((entry, entryIndex) => {
                  const entryStats = getStatsForIdentity(
                    { authIndex: entry.authIndex, apiKey: entry.apiKey },
                    keyStats
                  );
                  return (
                    <div
                      key={getApiKeyEntryRenderKey(entry, entryIndex)}
                      className={styles.apiKeyEntryCard}
                    >
                      <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                      <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                      {entry.proxyUrl && (
                        <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                      )}
                      <div className={styles.apiKeyEntryStats}>
                        <span
                          className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}
                        >
                          <IconCheck size={12} /> {entryStats.success}
                        </span>
                        <span
                          className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}
                        >
                          <IconX size={12} /> {entryStats.failure}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
            <span className={styles.fieldLabel}>{t('ai_providers.openai_models_count')}:</span>
            <span className={styles.fieldValue}>{provider.models?.length || 0}</span>
          </div>
          {provider.models?.length ? (
            <div className={styles.modelTagList}>
              {provider.models.map((model) => (
                <span key={model.name} className={styles.modelTag}>
                  <span className={styles.modelName}>{model.name}</span>
                  {model.alias && model.alias !== model.name && (
                    <span className={styles.modelAlias}>{model.alias}</span>
                  )}
                </span>
              ))}
            </div>
          ) : null}
          {provider.testModel && (
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>{t('ai_providers.openai_test_model')}:</span>
              <span className={styles.fieldValue}>{provider.testModel}</span>
            </div>
          )}
          <div className={styles.cardStats}>
            <span className={`${styles.statPill} ${styles.statSuccess}`}>
              {t('stats.success')}: {stats.success}
            </span>
            <span className={`${styles.statPill} ${styles.statFailure}`}>
              {t('stats.failure')}: {stats.failure}
            </span>
          </div>
          <ProviderStatusBar statusData={statusData} />
        </div>
        <div className={styles.openaiProviderActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(originalIndex)}
            disabled={actionsDisabled}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(originalIndex)}
            disabled={actionsDisabled}
          >
            {t('common.delete')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div ref={sectionRef}>
        <Card
          title={renderStaticTitle()}
          extra={
            <div
              ref={topToolbarAnchorRef}
              className={shouldRenderFloatingToolbar ? styles.openaiToolbarAnchorHidden : undefined}
            >
              {renderToolbar(false)}
            </div>
          }
        >
          {loading && filteredConfigs.length === 0 ? (
            <div className="hint">{t('common.loading')}</div>
          ) : configs.length > 0 && filteredConfigs.length === 0 ? (
            <EmptyState
              title={t('ai_providers.openai_filtered_empty_title')}
              description={t('ai_providers.openai_filtered_empty_desc')}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    clearAllModels();
                    clearAllProviders();
                  }}
                  disabled={actionsDisabled}
                >
                  {t('ai_providers.model_search_clear')}
                </Button>
              }
            />
          ) : filteredConfigs.length === 0 ? (
            <EmptyState
              title={t('ai_providers.openai_empty_title')}
              description={t('ai_providers.openai_empty_desc')}
            />
          ) : (
            <div className={styles.openaiProviderList}>{filteredConfigs.map(renderProviderCard)}</div>
          )}
        </Card>
      </div>
      {typeof document !== 'undefined' && shouldRenderFloatingToolbar
        ? createPortal(
          <div
            className={`card ${styles.openaiFloatingToolbar} ${isFloatingToolbarExpanded ? styles.openaiFloatingToolbarExpanded : ''
              }`}
            style={{
              left: `${floatingToolbarStyle.left}px`,
              top: `${floatingToolbarStyle.top}px`,
              width: `${floatingToolbarStyle.width}px`
            }}
          >
            {!isFloatingToolbarExpanded ? (
              <div className="card-header" style={{ padding: '8px' }}>
                <Button
                  size="sm"
                  onClick={() => setIsFloatingToolbarExpanded(true)}
                  className={styles.openaiFloatingToggleButton}
                >
                  <img
                    src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
                    alt=""
                    style={{ width: 16, height: 16, marginRight: 6 }}
                  />
                  {t('ai_providers.openai_title')}
                  <IconChevronDown size={12} style={{ marginLeft: 6 }} />
                </Button>
              </div>
            ) : (
              <div className="card-header">
                <div className="title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsFloatingToolbarExpanded(false)}
                    className={styles.openaiFloatingCloseButton}
                  >
                    <IconX size={14} />
                  </Button>
                  {renderStaticTitle()}
                </div>
                {renderToolbar(true)}
              </div>
            )}
          </div>,
          document.body
        )
        : null}
    </>
  );
}
