import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPagination } from '@/components/common/ListPagination';
import { Card } from '@/components/ui/Card';
import { authFilesApi } from '@/services/api/authFiles';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { useUsageStatsStore } from '@/stores/useUsageStatsStore';
import {
  calculateCost,
  collectUsageDetails,
  extractTotalTokens,
  formatCompactNumber,
  formatUsd,
  normalizeAuthIndex,
  type KeyStats,
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

const PAGE_SIZE = 20;

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
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [sortKey, setSortKey] = useState<SortKey>('requests');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pageState, setPageState] = useState({ keyStats, page: 1 });
  const hasPrices = Object.keys(modelPrices).length > 0;

  useEffect(() => {
    let cancelled = false;

    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;

        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;

        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;

          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const rows = useMemo((): CredentialRow[] => {
    const rowMap = new Map<string, CredentialRow>();

    const upsert = (
      source: string,
      authIndex: string | number | null | undefined,
      success: number,
      failure: number,
      tokens: number,
      cost: number
    ) => {
      const sourceInfo = resolveSourceDisplay(source, authIndex, sourceInfoMap, authFileMap);
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

      row.success += success;
      row.failure += failure;
      row.total = row.success + row.failure;
      row.successRate = row.total > 0 ? (row.success / row.total) * 100 : 100;
      row.tokens += tokens;
      row.cost += cost;
      rowMap.set(key, row);
    };

    const hasServerKeyStats = (stats: KeyStats): boolean =>
      (stats.credentials?.length ?? 0) > 0 ||
      Object.keys(stats.byAuthIndex).length > 0 ||
      Object.keys(stats.bySource).length > 0;

    if (hasServerKeyStats(keyStats)) {
      const credentials = keyStats.credentials ?? [];
      if (credentials.length > 0) {
        credentials.forEach((credential) => {
          upsert(
            credential.source,
            credential.authIndex,
            Number(credential.success) || 0,
            Number(credential.failure) || 0,
            Number(credential.tokens) || 0,
            Number(credential.cost) || 0
          );
        });
      } else {
        const authEntries = Object.entries(keyStats.byAuthIndex);
        if (authEntries.length > 0) {
          authEntries.forEach(([authIndex, bucket]) => {
            upsert(
              '',
              authIndex,
              Number(bucket.success) || 0,
              Number(bucket.failure) || 0,
              Number(bucket.tokens) || 0,
              Number(bucket.cost) || 0
            );
          });
        } else {
          Object.entries(keyStats.bySource).forEach(([source, bucket]) => {
            upsert(
              source,
              null,
              Number(bucket.success) || 0,
              Number(bucket.failure) || 0,
              Number(bucket.tokens) || 0,
              Number(bucket.cost) || 0
            );
          });
        }
      }
      return Array.from(rowMap.values());
    }

    if (!usage) return [];

    collectUsageDetails(usage).forEach((detail) => {
      upsert(
        detail.source ?? '',
        detail.auth_index,
        detail.failed === true ? 0 : 1,
        detail.failed === true ? 1 : 0,
        extractTotalTokens(detail),
        calculateCost(detail, modelPrices)
      );
    });

    return Array.from(rowMap.values());
  }, [authFileMap, keyStats, modelPrices, sourceInfoMap, usage]);

  const effectiveSortKey: SortKey = hasPrices || sortKey !== 'cost' ? sortKey : 'requests';
  const effectiveSortDir: SortDir = hasPrices || sortKey !== 'cost' ? sortDir : 'desc';
  const setPage = (page: number) => setPageState({ keyStats, page });

  const handleSort = (key: SortKey) => {
    if (key === 'cost' && !hasPrices) return;
    setPage(1);
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = pageState.keyStats === keyStats ? Math.min(pageState.page, totalPages) : 1;
  const pagedRows = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, sorted]
  );

  const arrow = (key: SortKey) =>
    effectiveSortKey === key ? (effectiveSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const ariaSort = (key: SortKey): 'none' | 'ascending' | 'descending' =>
    effectiveSortKey === key ? (effectiveSortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <Card title={t('usage_stats.credential_stats')} className={styles.detailsFixedCard}>
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : sorted.length > 0 ? (
        <>
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
                  {pagedRows.map((row) => (
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
          <ListPagination
            currentPage={page}
            totalPages={totalPages}
            totalCount={sorted.length}
            onPageChange={setPage}
            className={styles.usagePagination}
            pageInfo={`${page} / ${totalPages} · ${sorted.length}`}
          />
        </>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
