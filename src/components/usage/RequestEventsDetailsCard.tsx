import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPagination } from '@/components/common/ListPagination';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { authFilesApi } from '@/services/api/authFiles';
import { usageApi, type UsageEvent, type UsageTimeRange } from '@/services/api/usage';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import { downloadBlob } from '@/utils/download';
import { formatDurationMs, LATENCY_SOURCE_FIELD, normalizeAuthIndex } from '@/utils/usage';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';
const PAGE_SIZE = 20;

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampLabel: string;
  model: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
  failed: boolean;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export interface RequestEventsDetailsCardProps {
  timeRange: UsageTimeRange;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
}

const encodeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export function RequestEventsDetailsCard({
  timeRange,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [eventSource, setEventSource] = useState<'memory' | 'history'>('memory');
  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const queryIdentity = `${eventSource}::${timeRange}::${modelFilter}::${sourceFilter}::${authIndexFilter}`;
  const [pageState, setPageState] = useState({ queryIdentity, page: 1 });
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const page = pageState.queryIdentity === queryIdentity ? pageState.page : 1;
  const queryKey = `${queryIdentity}::${page}`;
  const [loadedQueryKey, setLoadedQueryKey] = useState('');
  const eventsLoading = loadedQueryKey !== queryKey;
  const setPage = (nextPage: number) => setPageState({ queryIdentity, page: nextPage });
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

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

  useEffect(() => {
    if (eventSource === 'history') return;
    let cancelled = false;
    usageApi
      .getUsageEventModelFilters(timeRange)
      .then((response) => {
        if (cancelled) return;
        const payload = response as unknown as { models?: string[]; Models?: string[] };
        setModelNames(payload.models || payload.Models || []);
      })
      .catch(() => {
        if (!cancelled) setModelNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventSource, timeRange]);

  useEffect(() => {
    let cancelled = false;
    usageApi
      .getUsageEvents(
        timeRange,
        undefined,
        undefined,
        {
          page,
          pageSize: PAGE_SIZE,
          model: modelFilter === ALL_FILTER ? undefined : modelFilter,
          source: sourceFilter === ALL_FILTER ? undefined : sourceFilter,
          authIndex: authIndexFilter === ALL_FILTER ? undefined : authIndexFilter,
        },
        eventSource
      )
      .then((response) => {
        if (cancelled) return;
        const nextTotalPages = Math.max(1, Number(response.total_pages) || 1);
        setTotalCount(Number(response.total_count) || 0);
        setTotalPages(nextTotalPages);
        if (eventSource === 'history' && Array.isArray(response.models)) {
          setModelNames(response.models);
        }
        if (page > nextTotalPages) {
          setPageState({ queryIdentity, page: nextTotalPages });
          return;
        }
        setEvents(Array.isArray(response.events) ? response.events : []);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setTotalCount(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoadedQueryKey(queryKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    authIndexFilter,
    eventSource,
    modelFilter,
    page,
    queryIdentity,
    queryKey,
    sourceFilter,
    timeRange,
  ]);

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

  const rows = useMemo<RequestEventRow[]>(
    () =>
      events.map((event, index) => {
        const sourceRaw = String(event.source_raw || event.source || '').trim();
        const authIndex = normalizeAuthIndex(event.auth_index) || '-';
        const sourceInfo = resolveSourceDisplay(
          sourceRaw,
          event.auth_index,
          sourceInfoMap,
          authFileMap
        );
        const date = new Date(event.timestamp);
        const tokens = event.tokens;
        return {
          id: String(event.id ?? `${event.timestamp}-${index}`),
          timestamp: event.timestamp,
          timestampLabel: Number.isNaN(date.getTime())
            ? event.timestamp || '-'
            : date.toLocaleString(i18n.language),
          model: event.model || '-',
          sourceRaw,
          source: sourceInfo.displayName,
          sourceType: sourceInfo.type,
          authIndex,
          failed: event.failed === true,
          latencyMs: Number.isFinite(Number(event.latency_ms)) ? Number(event.latency_ms) : null,
          inputTokens: Math.max(Number(tokens?.input_tokens ?? event.input_tokens) || 0, 0),
          outputTokens: Math.max(Number(tokens?.output_tokens ?? event.output_tokens) || 0, 0),
          reasoningTokens: Math.max(
            Number(tokens?.reasoning_tokens ?? event.reasoning_tokens) || 0,
            0
          ),
          cachedTokens: Math.max(Number(tokens?.cached_tokens ?? event.cached_tokens) || 0, 0),
          totalTokens: Math.max(Number(tokens?.total_tokens ?? event.total_tokens) || 0, 0),
        };
      }),
    [authFileMap, events, i18n.language, sourceInfoMap]
  );

  const hasLatencyData = useMemo(() => rows.some((row) => row.latencyMs !== null), [rows]);
  const modelOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...modelNames.map((model) => ({ value: model, label: model })),
    ],
    [modelNames, t]
  );
  const sourceOptions = useMemo(() => {
    const options = new Map<string, string>();
    rows.forEach((row) => {
      if (row.sourceRaw) options.set(row.sourceRaw, row.source);
    });
    if (sourceFilter !== ALL_FILTER && !options.has(sourceFilter)) {
      options.set(sourceFilter, sourceFilter);
    }
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(options, ([value, label]) => ({ value, label })),
    ];
  }, [rows, sourceFilter, t]);
  const authIndexOptions = useMemo(() => {
    const options = new Map<string, string>();
    authFileMap.forEach((info, authIndex) => options.set(authIndex, info.name || authIndex));
    rows.forEach((row) => {
      if (row.authIndex !== '-') options.set(row.authIndex, row.authIndex);
    });
    if (authIndexFilter !== ALL_FILTER && !options.has(authIndexFilter)) {
      options.set(authIndexFilter, authIndexFilter);
    }
    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(options, ([value, label]) => ({ value, label })),
    ];
  }, [authFileMap, authIndexFilter, rows, t]);

  const hasActiveFilters =
    modelFilter !== ALL_FILTER || sourceFilter !== ALL_FILTER || authIndexFilter !== ALL_FILTER;

  const handleClearFilters = () => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
  };

  const handleToggleEventSource = () => {
    setEventSource((current) => (current === 'memory' ? 'history' : 'memory'));
    setModelNames([]);
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
  };

  const handleExportCsv = () => {
    if (!rows.length) return;
    const csvHeader = [
      'timestamp',
      'model',
      'source',
      'source_raw',
      'auth_index',
      'result',
      ...(hasLatencyData ? ['latency_ms'] : []),
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'total_tokens',
    ];
    const csvRows = rows.map((row) =>
      [
        row.timestamp,
        row.model,
        row.source,
        row.sourceRaw,
        row.authIndex,
        row.failed ? 'failed' : 'success',
        ...(hasLatencyData ? [row.latencyMs ?? ''] : []),
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.totalTokens,
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([[csvHeader.join(','), ...csvRows].join('\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    });
  };

  const handleExportJson = () => {
    if (!rows.length) return;
    const payload = rows.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndex,
      failed: row.failed,
      ...(hasLatencyData && row.latencyMs !== null ? { latency_ms: row.latencyMs } : {}),
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens,
      },
    }));
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    });
  };

  return (
    <Card
      title={t('usage_stats.request_events_title')}
      extra={
        <div className={styles.requestEventsActions}>
          <Button variant="secondary" size="sm" onClick={handleToggleEventSource}>
            {eventSource === 'history'
              ? t('usage_stats.request_events_recent')
              : t('usage_stats.request_events_history')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            disabled={!hasActiveFilters}
          >
            {t('usage_stats.clear_filters')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!rows.length}>
            {t('usage_stats.export_csv')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportJson} disabled={!rows.length}>
            {t('usage_stats.export_json')}
          </Button>
        </div>
      }
    >
      <div className={styles.requestEventsToolbar}>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_model')}
          </span>
          <Select
            value={modelFilter}
            options={modelOptions}
            onChange={setModelFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_model')}
            fullWidth={false}
          />
        </div>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_source')}
          </span>
          <Select
            value={sourceFilter}
            options={sourceOptions}
            onChange={setSourceFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_source')}
            fullWidth={false}
          />
        </div>
        <div className={styles.requestEventsFilterItem}>
          <span className={styles.requestEventsFilterLabel}>
            {t('usage_stats.request_events_filter_auth_index')}
          </span>
          <Select
            value={authIndexFilter}
            options={authIndexOptions}
            onChange={setAuthIndexFilter}
            className={styles.requestEventsSelect}
            ariaLabel={t('usage_stats.request_events_filter_auth_index')}
            fullWidth={false}
          />
        </div>
      </div>

      {/* {eventSource === 'history' ? (
        <div className={styles.hint}>{t('usage_stats.request_events_history_hint')}</div>
      ) : cacheInfo ? (
        <div className={styles.hint}>
          {t('usage_stats.request_events_cache_hint', {
            count: cacheInfo.retained_count,
            max: cacheInfo.max_events,
          })}
        </div>
      ) : null} */}

      {eventsLoading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            hasActiveFilters
              ? t('usage_stats.request_events_no_result_title')
              : t('usage_stats.request_events_empty_title')
          }
          description={
            hasActiveFilters
              ? t('usage_stats.request_events_no_result_desc')
              : t('usage_stats.request_events_empty_desc')
          }
        />
      ) : (
        <>
          <div className={styles.requestEventsMeta}>
            <span>{t('usage_stats.request_events_count', { count: totalCount })}</span>
            {hasLatencyData && <span className={styles.requestEventsLimitHint}>{latencyHint}</span>}
          </div>
          <div className={styles.requestEventsTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.request_events_timestamp')}</th>
                  <th>{t('usage_stats.model_name')}</th>
                  <th>{t('usage_stats.request_events_source')}</th>
                  <th>{t('usage_stats.request_events_auth_index')}</th>
                  <th>{t('usage_stats.request_events_result')}</th>
                  {hasLatencyData && <th title={latencyHint}>{t('usage_stats.time')}</th>}
                  <th>{t('usage_stats.input_tokens')}</th>
                  <th>{t('usage_stats.output_tokens')}</th>
                  <th>{t('usage_stats.reasoning_tokens')}</th>
                  <th>{t('usage_stats.cached_tokens')}</th>
                  <th>{t('usage_stats.total_tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                      {row.timestampLabel}
                    </td>
                    <td className={styles.modelCell}>{row.model}</td>
                    <td className={styles.requestEventsSourceCell} title={row.source}>
                      <span>{row.source}</span>
                      {row.sourceType && (
                        <span className={styles.credentialType}>{row.sourceType}</span>
                      )}
                    </td>
                    <td className={styles.requestEventsAuthIndex} title={row.authIndex}>
                      {row.authIndex}
                    </td>
                    <td>
                      <span
                        className={
                          row.failed
                            ? styles.requestEventsResultFailed
                            : styles.requestEventsResultSuccess
                        }
                      >
                        {row.failed ? t('stats.failure') : t('stats.success')}
                      </span>
                    </td>
                    {hasLatencyData && (
                      <td className={styles.durationCell}>{formatDurationMs(row.latencyMs)}</td>
                    )}
                    <td>{row.inputTokens.toLocaleString()}</td>
                    <td>{row.outputTokens.toLocaleString()}</td>
                    <td>{row.reasoningTokens.toLocaleString()}</td>
                    <td>{row.cachedTokens.toLocaleString()}</td>
                    <td>{row.totalTokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination
            currentPage={page}
            totalPages={totalPages}
            totalCount={totalCount}
            disabled={eventsLoading}
            onPageChange={setPage}
            className={styles.usagePagination}
            pageInfo={`${page} / ${totalPages} · ${totalCount}`}
          />
        </>
      )}
    </Card>
  );
}
