/**
 * Generic quota section component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ListPagination } from '@/components/common/ListPagination';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { QuotaCard } from './QuotaCard';
import type { QuotaStatusState } from './QuotaCard';
import { useQuotaLoader } from './useQuotaLoader';
import type { QuotaConfig } from './quotaConfigs';
import { useGridColumns } from './useGridColumns';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

type ViewMode = 'paged' | 'all';

const MAX_ITEMS_PER_PAGE = 25;
const MAX_SHOW_ALL_THRESHOLD = 30;

interface QuotaPaginationState<T> {
  pageSize: number;
  totalPages: number;
  currentPage: number;
  pageItems: T[];
  setPageSize: (size: number) => void;
  goToPage: (page: number) => void;
  goToPrev: () => void;
  goToNext: () => void;
  loading: boolean;
  loadingScope: 'page' | 'all' | null;
  setLoading: (loading: boolean, scope?: 'page' | 'all' | null) => void;
}

const useQuotaPagination = <T,>(items: T[], defaultPageSize = 6): QuotaPaginationState<T> => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [loading, setLoadingState] = useState(false);
  const [loadingScope, setLoadingScope] = useState<'page' | 'all' | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const currentPage = useMemo(() => Math.min(page, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      setPage(Math.max(1, Math.min(totalPages, nextPage)));
    },
    [totalPages]
  );

  const goToPrev = useCallback(() => {
    setPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }, [totalPages]);

  const setLoading = useCallback((isLoading: boolean, scope?: 'page' | 'all' | null) => {
    setLoadingState(isLoading);
    setLoadingScope(isLoading ? (scope ?? null) : null);
  }, []);

  return {
    pageSize,
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPage,
    goToPrev,
    goToNext,
    loading,
    loadingScope,
    setLoading
  };
};

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
}

export function QuotaSection<TState extends QuotaStatusState, TData>({
  config,
  files,
  loading,
  disabled
}: QuotaSectionProps<TState, TData>) {
  const { t } = useTranslation();
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const [columns, gridRef] = useGridColumns(380); // Min card width 380px matches SCSS
  const [viewMode, setViewMode] = useState<ViewMode>('paged');
  const [showTooManyWarning, setShowTooManyWarning] = useState(false);
  const [resettingQuotaNames, setResettingQuotaNames] = useState<Set<string>>(() => new Set());

  const filteredFiles = useMemo(() => files.filter((file) => config.filterFn(file)), [
    files,
    config
  ]);
  const showAllAllowed = filteredFiles.length <= MAX_SHOW_ALL_THRESHOLD;
  const effectiveViewMode: ViewMode = viewMode === 'all' && !showAllAllowed ? 'paged' : viewMode;

  const {
    totalPages,
    currentPage,
    pageItems,
    setPageSize,
    goToPage,
    loading: sectionLoading,
    loadingScope,
    setLoading
  } = useQuotaPagination(filteredFiles);

  useEffect(() => {
    if (showAllAllowed) return;
    if (viewMode !== 'all') return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setViewMode('paged');
      setShowTooManyWarning(true);
    });

    return () => {
      cancelled = true;
    };
  }, [showAllAllowed, viewMode]);

  // Update page size based on view mode and columns
  useEffect(() => {
    if (effectiveViewMode === 'all') {
      setPageSize(Math.max(1, filteredFiles.length));
    } else {
      // Paged mode: 3 rows * columns, capped to avoid oversized pages.
      setPageSize(Math.min(columns * 3, MAX_ITEMS_PER_PAGE));
    }
  }, [effectiveViewMode, columns, filteredFiles.length, setPageSize]);

  const { quota, loadQuota } = useQuotaLoader(config);

  // Keep pageItems/filteredFiles stable for refresh handlers without re-creating them every render.
  const pageItemsRef = useRef(pageItems);
  const filteredFilesRef = useRef(filteredFiles);
  pageItemsRef.current = pageItems;
  filteredFilesRef.current = filteredFiles;

  useEffect(() => {
    if (loading) return;
    if (filteredFiles.length === 0) {
      setQuota({});
      return;
    }
    setQuota((prev) => {
      const nextState: Record<string, TState> = {};
      filteredFiles.forEach((file) => {
        const cached = prev[file.name];
        if (cached) {
          nextState[file.name] = cached;
        }
      });
      return nextState;
    });
  }, [filteredFiles, loading, setQuota]);

  const refreshQuotaForFile = useCallback(
    async (file: AuthFileItem) => {
      if (disabled || file.disabled) return;
      if (quota[file.name]?.status === 'loading') return;

      setQuota((prev) => ({
        ...prev,
        [file.name]: config.buildLoadingState()
      }));

      try {
        const data = await config.fetchQuota(file, t);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildSuccessState(data)
        }));
        showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('common.unknown_error');
        const status = getStatusFromError(err);
        setQuota((prev) => ({
          ...prev,
          [file.name]: config.buildErrorState(message, status)
        }));
        showNotification(
          t('auth_files.quota_refresh_failed', { name: file.name, message }),
          'error'
        );
      }
    },
    [config, disabled, quota, setQuota, showNotification, t]
  );

  const resetQuotaForFile = useCallback(
    (file: AuthFileItem) => {
      const currentQuota = quota[file.name];
      if (disabled || file.disabled || resettingQuotaNames.has(file.name)) return;
      if (!config.resetQuota || !currentQuota || currentQuota.status === 'loading') return;
      if (!config.canResetQuota?.(currentQuota)) return;

      showConfirmation({
        title: t('codex_quota.reset_confirm_title'),
        message: t('codex_quota.reset_confirm_message', { name: file.name }),
        variant: 'danger',
        confirmText: t('codex_quota.reset_confirm_button'),
        onConfirm: async () => {
          setResettingQuotaNames((prev) => new Set(prev).add(file.name));
          try {
            const data = await config.resetQuota!(file, t);
            setQuota((prev) => ({
              ...prev,
              [file.name]: config.buildSuccessState(data)
            }));
            showNotification(t('codex_quota.reset_success', { name: file.name }), 'success');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.unknown_error');
            showNotification(
              t('codex_quota.reset_failed', { name: file.name, message }),
              'error'
            );
          } finally {
            setResettingQuotaNames((prev) => {
              const next = new Set(prev);
              next.delete(file.name);
              return next;
            });
          }
        }
      });
    },
    [
      config,
      disabled,
      quota,
      resettingQuotaNames,
      setQuota,
      showConfirmation,
      showNotification,
      t
    ]
  );

  const handleRefreshPage = useCallback(() => {
    const targets = pageItemsRef.current;
    if (targets.length === 0) return;
    void loadQuota(targets, 'page', setLoading);
  }, [loadQuota, setLoading]);

  const handleRefreshAll = useCallback(() => {
    const targets = filteredFilesRef.current;
    if (targets.length === 0) return;
    void loadQuota(targets, 'all', setLoading);
  }, [loadQuota, setLoading]);

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t(`${config.i18nPrefix}.title`)}</span>
      {filteredFiles.length > 0 && (
        <span className={styles.countBadge}>
          {filteredFiles.length}
        </span>
      )}
    </div>
  );

  const isRefreshing = sectionLoading || loading;
  const isRefreshingPage = sectionLoading && loadingScope === 'page';
  const isRefreshingAll = sectionLoading && loadingScope === 'all';

  return (
    <Card
      title={titleNode}
      extra={
        <div className={styles.headerActions}>
          <div className={styles.viewModeToggle}>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'paged' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => setViewMode('paged')}
            >
              {t('auth_files.view_mode_paged')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.viewModeButton} ${
                effectiveViewMode === 'all' ? styles.viewModeButtonActive : ''
              }`}
              onClick={() => {
                if (filteredFiles.length > MAX_SHOW_ALL_THRESHOLD) {
                  setShowTooManyWarning(true);
                  return;
                }
                setViewMode('all');
              }}
            >
              {t('auth_files.view_mode_all')}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshAllButton}
            onClick={handleRefreshPage}
            disabled={disabled || isRefreshing || pageItems.length === 0}
            loading={isRefreshingPage}
            title={t('quota_management.refresh_page_credentials')}
            aria-label={t('quota_management.refresh_page_credentials')}
          >
            {!isRefreshingPage && <IconRefreshCw size={16} />}
            {t('quota_management.refresh_page_credentials')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshAllButton}
            onClick={handleRefreshAll}
            disabled={disabled || isRefreshing || filteredFiles.length === 0}
            loading={isRefreshingAll}
            title={t('quota_management.refresh_all_credentials')}
            aria-label={t('quota_management.refresh_all_credentials')}
          >
            {!isRefreshingAll && <IconRefreshCw size={16} />}
            {t('quota_management.refresh_all_credentials')}
          </Button>
        </div>
      }
    >
      {filteredFiles.length === 0 ? (
        <EmptyState
          title={t(`${config.i18nPrefix}.empty_title`)}
          description={t(`${config.i18nPrefix}.empty_desc`)}
        />
      ) : (
        <>
          <div ref={gridRef} className={config.gridClassName}>
            {pageItems.map((item) => {
              const itemQuota = quota[item.name];
              const isResetting = resettingQuotaNames.has(item.name);
              const canReset =
                itemQuota !== undefined &&
                config.resetQuota !== undefined &&
                config.canResetQuota?.(itemQuota) === true;

              return (
                <QuotaCard
                  key={item.name}
                  item={item}
                  quota={itemQuota}
                  resolvedTheme={resolvedTheme}
                  i18nPrefix={config.i18nPrefix}
                  cardIdleMessageKey={config.cardIdleMessageKey}
                  cardClassName={config.cardClassName}
                  defaultType={config.type}
                  canRefresh={!disabled && !item.disabled}
                  onRefresh={() => void refreshQuotaForFile(item)}
                  resetQuotaAction={
                    canReset ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className={styles.quotaResetCreditButton}
                        onClick={() => resetQuotaForFile(item)}
                        disabled={disabled || Boolean(item.disabled) || isResetting}
                        loading={isResetting}
                      >
                        {!isResetting && <IconRefreshCw size={14} />}
                        {t('codex_quota.reset_button')}
                      </Button>
                    ) : undefined
                  }
                  renderQuotaItems={config.renderQuotaItems}
                />
              );
            })}
          </div>
          {effectiveViewMode === 'paged' && (
            <ListPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={filteredFiles.length}
              disabled={isRefreshing}
              onPageChange={goToPage}
            />
          )}
        </>
      )}
      {showTooManyWarning &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className={styles.warningOverlay} onClick={() => setShowTooManyWarning(false)}>
            <div className={styles.warningModal} onClick={(e) => e.stopPropagation()}>
              <p>
                {t('auth_files.too_many_files_warning', {
                  count: filteredFiles.length,
                  threshold: MAX_SHOW_ALL_THRESHOLD
                })}
              </p>
              <Button variant="primary" size="sm" onClick={() => setShowTooManyWarning(false)}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>,
          document.body
        )}
    </Card>
  );
}
