import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseModelDiscoveryOptions<T> {
  fetcher: () => Promise<T[]>;
  getKey: (item: T) => string;
  filterFn: (item: T, search: string) => boolean;
  autoFetch?: boolean;
  autoFetchKey?: string;
}

export function useModelDiscovery<T>({
  fetcher,
  getKey,
  filterFn,
  autoFetch = false,
  autoFetchKey = '',
}: UseModelDiscoveryOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const requestIdRef = useRef(0);
  const lastFetchSignatureRef = useRef<string>('');

  const applyItems = useCallback(
    (list: T[]) => {
      setItems(list);
      const availableKeys = new Set(list.map(getKey));
      setSelectedKeys((prev) => {
        let changed = false;
        const next = new Set<string>();
        prev.forEach((k) => {
          if (availableKeys.has(k)) {
            next.add(k);
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    [getKey]
  );

  const executeFetch = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setFetching(true);
    setError('');

    try {
      const list = await fetcher();
      if (requestIdRef.current === reqId) {
        applyItems(list);
      }
    } catch (err: unknown) {
      if (requestIdRef.current === reqId) {
        applyItems([]);
        setError(err instanceof Error ? err.message : String(err || 'Failed to fetch models'));
      }
    } finally {
      if (requestIdRef.current === reqId) {
        setFetching(false);
      }
    }
  }, [fetcher, applyItems]);

  useEffect(() => {
    if (!autoFetch) return;
    if (autoFetchKey && lastFetchSignatureRef.current === autoFetchKey) return;
    lastFetchSignatureRef.current = autoFetchKey;
    void executeFetch();
  }, [autoFetch, autoFetchKey, executeFetch]);

  const filteredItems = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => filterFn(item, trimmed));
  }, [items, search, filterFn]);

  const visibleKeys = useMemo(() => filteredItems.map(getKey), [filteredItems, getKey]);

  const allVisibleSelected = useMemo(
    () => visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k)),
    [visibleKeys, selectedKeys]
  );

  const toggleSelection = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectVisible = useCallback(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [visibleKeys]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const resetState = useCallback(() => {
    setItems([]);
    setSearch('');
    setSelectedKeys(new Set());
    setError('');
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.has(getKey(item))),
    [items, selectedKeys, getKey]
  );

  return {
    items,
    setItems,
    filteredItems,
    fetching,
    error,
    setError,
    search,
    setSearch,
    selectedKeys,
    setSelectedKeys,
    selectedItems,
    allVisibleSelected,
    executeFetch,
    toggleSelection,
    selectVisible,
    clearSelection,
    resetState,
  };
}
