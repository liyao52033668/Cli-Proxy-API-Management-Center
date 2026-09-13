import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type { ModelInfo } from '@/utils/models';
import styles from '@/pages/AiProvidersPage.module.scss';

export interface ModelDiscoveryContentProps<T> {
  endpoint?: string;
  endpointLabel?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  hint?: string;
  items: T[];
  filteredItems: T[];
  fetching: boolean;
  error?: string;
  search: string;
  onSearchChange: (search: string) => void;
  selectedKeys: Set<string>;
  allVisibleSelected: boolean;
  getKey: (item: T) => string;
  renderItemMeta?: (item: T) => ReactNode;
  onRefresh?: () => void;
  onSelectVisible: () => void;
  onClearSelection: () => void;
  onToggleItem: (key: string) => void;
  disabled?: boolean;
}

export function ModelDiscoveryContent<T = ModelInfo>({
  endpoint,
  endpointLabel,
  searchLabel,
  searchPlaceholder,
  hint,
  items,
  filteredItems,
  fetching,
  error,
  search,
  onSearchChange,
  selectedKeys,
  allVisibleSelected,
  getKey,
  renderItemMeta,
  onRefresh,
  onSelectVisible,
  onClearSelection,
  onToggleItem,
  disabled = false,
}: ModelDiscoveryContentProps<T>) {
  const { t } = useTranslation();

  return (
    <div className={styles.openaiModelsContent}>
      {hint && <div className={styles.sectionHint}>{hint}</div>}

      {endpoint !== undefined && (
        <div className={styles.openaiModelsEndpointSection}>
          <label className={styles.openaiModelsEndpointLabel}>
            {endpointLabel || t('ai_providers.codex_models_fetch_url_label')}
          </label>
          <div className={styles.openaiModelsEndpointControls}>
            <input className={`input ${styles.openaiModelsEndpointInput}`} readOnly value={endpoint} />
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              loading={fetching}
              disabled={disabled}
            >
              {t('ai_providers.codex_models_fetch_refresh')}
            </Button>
          </div>
        </div>
      )}

      <Input
        label={searchLabel || t('ai_providers.codex_models_search_label')}
        placeholder={searchPlaceholder || t('ai_providers.codex_models_search_placeholder')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        disabled={fetching}
      />

      {items.length > 0 && (
        <div className={styles.modelDiscoveryToolbar}>
          <div className={styles.modelDiscoveryToolbarActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={onSelectVisible}
              disabled={disabled || fetching || filteredItems.length === 0 || allVisibleSelected}
            >
              {t('ai_providers.model_discovery_select_visible')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={disabled || fetching || selectedKeys.size === 0}
            >
              {t('ai_providers.model_discovery_clear_selection')}
            </Button>
          </div>
          <div className={styles.modelDiscoverySelectionSummary}>
            {t('ai_providers.model_discovery_selected_count', { count: selectedKeys.size })}
          </div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {fetching ? (
        <div className={styles.sectionHint}>{t('ai_providers.codex_models_fetch_loading')}</div>
      ) : items.length === 0 ? (
        <div className={styles.sectionHint}>{t('ai_providers.codex_models_fetch_empty')}</div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.sectionHint}>{t('ai_providers.codex_models_search_empty')}</div>
      ) : (
        <div className={styles.modelDiscoveryList}>
          {filteredItems.map((item) => {
            const key = getKey(item);
            const checked = selectedKeys.has(key);
            const modelInfo = item as unknown as ModelInfo;

            return (
              <SelectionCheckbox
                key={key}
                checked={checked}
                onChange={() => onToggleItem(key)}
                disabled={disabled || fetching}
                ariaLabel={key}
                className={`${styles.modelDiscoveryRow} ${checked ? styles.modelDiscoveryRowSelected : ''}`}
                labelClassName={styles.modelDiscoverySelectionLabel}
                label={
                  renderItemMeta ? (
                    renderItemMeta(item)
                  ) : (
                    <div className={styles.modelDiscoveryMeta}>
                      <div className={styles.modelDiscoveryName}>
                        {modelInfo.name}
                        {modelInfo.alias && (
                          <span className={styles.modelDiscoveryAlias}>{modelInfo.alias}</span>
                        )}
                      </div>
                      {modelInfo.description && (
                        <div className={styles.modelDiscoveryDesc}>{modelInfo.description}</div>
                      )}
                    </div>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
