import { useCallback, useMemo, useState } from 'react';

export interface UseClientPaginationOptions {
  /** 初始每页条数，默认 20 */
  initialPageSize?: number;
  /** 初始页码 (1-based)，默认 1 */
  initialPage?: number;
  /** 当这些依赖项改变（如筛选条件、搜索词发生变更）时，自动重置回第 1 页 */
  resetDeps?: unknown[];
}

export interface ClientPaginationResult<T> {
  // 当前状态
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;

  // 切片后的当页数据及起始索引
  pagedItems: T[];
  startIndex: number;
  endIndex: number;

  // 状态变更方法
  setPage: (page: number | ((prev: number) => number)) => void;
  setPageSize: (size: number) => void;
  goToNext: () => void;
  goToPrev: () => void;
  resetPage: () => void;

  // 可直接传给 <ListPagination {...paginationProps} /> 的属性包
  paginationProps: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    onPageChange: (page: number) => void;
  };
}

export function useClientPagination<T>(
  items: T[],
  options: UseClientPaginationOptions = {}
): ClientPaginationResult<T> {
  const {
    initialPageSize = 20,
    initialPage = 1,
    resetDeps,
  } = options;

  const [pageSize, setPageSizeInternal] = useState(initialPageSize);
  // 将页码与重置依赖快照存储在一个 state 中，避免在 render 期间单独执行 setState
  const [pageState, setPageState] = useState<{ page: number; deps: unknown[] | undefined }>(() => ({
    page: initialPage,
    deps: resetDeps,
  }));

  // 判断传入的 resetDeps 是否发生变化
  const depsChanged =
    resetDeps !== undefined &&
    (pageState.deps === undefined ||
      resetDeps.length !== pageState.deps.length ||
      resetDeps.some((dep, i) => !Object.is(dep, pageState.deps?.[i])));

  // 如果外部依赖改变，直接派生当前生效页为 1，无需在 render 期间触发 setState
  const rawPage = depsChanged ? 1 : pageState.page;

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // 确保 currentPage 永远在 [1, totalPages] 合法范围内
  const currentPage = Math.min(Math.max(1, rawPage), totalPages);

  const setPage = useCallback(
    (targetPage: number | ((prev: number) => number)) => {
      setPageState(() => {
        const next = typeof targetPage === 'function' ? targetPage(currentPage) : targetPage;
        return {
          page: Math.max(1, Math.min(totalPages, next)),
          deps: resetDeps,
        };
      });
    },
    [currentPage, resetDeps, totalPages]
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      if (newSize <= 0) return;
      setPageSizeInternal(newSize);
      setPageState({ page: 1, deps: resetDeps });
    },
    [resetDeps]
  );

  const goToNext = useCallback(() => {
    setPage((p) => p + 1);
  }, [setPage]);

  const goToPrev = useCallback(() => {
    setPage((p) => p - 1);
  }, [setPage]);

  const resetPage = useCallback(() => {
    setPageState({ page: 1, deps: resetDeps });
  }, [resetDeps]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  const pagedItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  const paginationProps = useMemo(
    () => ({
      currentPage,
      totalPages,
      totalCount,
      onPageChange: setPage,
    }),
    [currentPage, totalPages, totalCount, setPage]
  );

  return {
    currentPage,
    pageSize,
    totalPages,
    totalCount,
    pagedItems,
    startIndex,
    endIndex,
    setPage,
    setPageSize,
    goToNext,
    goToPrev,
    resetPage,
    paginationProps,
  };
}
