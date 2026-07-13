/**
 * Generic hook for quota data fetching and management.
 */

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import { useQuotaStore } from '@/stores';
import { QUOTA_REFRESH_BATCH_SIZE } from '@/utils/constants';
import { getStatusFromError } from '@/utils/quota';
import type { QuotaConfig } from './quotaConfigs';

type QuotaScope = 'page' | 'all';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaSetter<T> = (updater: QuotaUpdater<T>) => void;

interface LoadQuotaResult<TData> {
  name: string;
  status: 'success' | 'error';
  data?: TData;
  error?: string;
  errorStatus?: number;
}

export function useQuotaLoader<TState, TData>(config: QuotaConfig<TState, TData>) {
  const { t } = useTranslation();
  const quota = useQuotaStore(config.storeSelector);
  const setQuota = useQuotaStore((state) => state[config.storeSetter]) as QuotaSetter<
    Record<string, TState>
  >;

  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadQuota = useCallback(
    async (
      targets: AuthFileItem[],
      scope: QuotaScope,
      setLoading: (loading: boolean, scope?: QuotaScope | null) => void
    ) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const requestId = ++requestIdRef.current;
      setLoading(true, scope);

      try {
        if (targets.length === 0) return;

        // Mark only the first batch as loading immediately; later batches
        // flip to loading right before they start, so the UI stays responsive.
        const markLoading = (files: AuthFileItem[]) => {
          setQuota((prev) => {
            const nextState = { ...prev };
            files.forEach((file) => {
              nextState[file.name] = config.buildLoadingState();
            });
            return nextState;
          });
        };

        const applyResults = (results: LoadQuotaResult<TData>[]) => {
          setQuota((prev) => {
            const nextState = { ...prev };
            results.forEach((result) => {
              if (result.status === 'success') {
                nextState[result.name] = config.buildSuccessState(result.data as TData);
              } else {
                nextState[result.name] = config.buildErrorState(
                  result.error || t('common.unknown_error'),
                  result.errorStatus
                );
              }
            });
            return nextState;
          });
        };

        const fetchOne = async (file: AuthFileItem): Promise<LoadQuotaResult<TData>> => {
          try {
            const data = await config.fetchQuota(file, t);
            return { name: file.name, status: 'success', data };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.unknown_error');
            const errorStatus = getStatusFromError(err);
            return { name: file.name, status: 'error', error: message, errorStatus };
          }
        };

        for (let index = 0; index < targets.length; index += QUOTA_REFRESH_BATCH_SIZE) {
          if (requestId !== requestIdRef.current) return;

          const batch = targets.slice(index, index + QUOTA_REFRESH_BATCH_SIZE);
          markLoading(batch);

          const results = await Promise.all(batch.map((file) => fetchOne(file)));
          if (requestId !== requestIdRef.current) return;
          applyResults(results);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    },
    [config, setQuota, t]
  );

  return { quota, loadQuota };
}
