import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from '@/pages/UsagePage.module.scss';
import {
  buildDailyTokenBreakdown,
  buildHourlyTokenBreakdown,
  type TokenCategory
} from '@/utils/usage';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import type { UsageOverviewPayload, UsagePayload } from './hooks/useUsageData';

const TOKEN_COLORS: Record<TokenCategory, { border: string; bg: string }> = {
  input: { border: '#8b8680', bg: 'rgba(139, 134, 128, 0.25)' },
  output: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.25)' },
  cached: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)' },
  reasoning: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.25)' }
};

const CATEGORIES: TokenCategory[] = ['input', 'output', 'cached', 'reasoning'];

export interface TokenBreakdownChartProps {
  usage: UsagePayload | null;
  hourlySeries?: UsageOverviewPayload['hourly_series'];
  dailySeries?: UsageOverviewPayload['daily_series'];
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
}

export function TokenBreakdownChart({
  usage,
  hourlySeries,
  dailySeries,
  loading,
  isDark,
  isMobile,
  hourWindowHours
}: TokenBreakdownChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'hour' | 'day'>('hour');

  const { chartData, chartOptions } = useMemo(() => {
    const dataWithSeries = usage
      ? { ...usage, series: period === 'hour' ? hourlySeries : dailySeries }
      : null;
    const tokenBreakdown =
      period === 'hour'
        ? buildHourlyTokenBreakdown(dataWithSeries, hourWindowHours)
        : buildDailyTokenBreakdown(dataWithSeries);
    const categoryLabels: Record<TokenCategory, string> = {
      input: t('usage_stats.input_tokens'),
      output: t('usage_stats.output_tokens'),
      cached: t('usage_stats.cached_tokens'),
      reasoning: t('usage_stats.reasoning_tokens')
    };

    const data = {
      labels: tokenBreakdown.labels,
      datasets: CATEGORIES.map((cat) => ({
        label: categoryLabels[cat],
        data: tokenBreakdown.dataByCategory[cat],
        borderColor: TOKEN_COLORS[cat].border,
        backgroundColor: TOKEN_COLORS[cat].bg,
        pointBackgroundColor: TOKEN_COLORS[cat].border,
        pointBorderColor: TOKEN_COLORS[cat].border,
        fill: true,
        tension: 0.35
      }))
    };

    const baseOptions = buildChartOptions({ period, labels: tokenBreakdown.labels, isDark, isMobile });
    const options = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales?.y,
          stacked: true
        },
        x: {
          ...baseOptions.scales?.x,
          stacked: true
        }
      }
    };

    return { chartData: data, chartOptions: options };
  }, [usage, hourlySeries, dailySeries, period, isDark, isMobile, hourWindowHours, t]);

  return (
    <Card
      title={t('usage_stats.token_breakdown')}
      extra={
        <div className={styles.periodButtons}>
          <Button
            variant={period === 'hour' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPeriod('hour')}
          >
            {t('usage_stats.by_hour')}
          </Button>
          <Button
            variant={period === 'day' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPeriod('day')}
          >
            {t('usage_stats.by_day')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : chartData.labels.length > 0 ? (
        <div className={styles.chartWrapper}>
          <div className={styles.chartLegend} aria-label="Chart legend">
            {chartData.datasets.map((dataset, index) => (
              <div
                key={`${dataset.label}-${index}`}
                className={styles.legendItem}
                title={dataset.label}
              >
                <span className={styles.legendDot} style={{ backgroundColor: dataset.borderColor }} />
                <span className={styles.legendLabel}>{dataset.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.chartArea}>
            <div className={styles.chartScroller}>
              <div
                className={styles.chartCanvas}
                style={
                  period === 'hour'
                    ? { minWidth: getHourChartMinWidth(chartData.labels.length, isMobile) }
                    : undefined
                }
              >
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}
