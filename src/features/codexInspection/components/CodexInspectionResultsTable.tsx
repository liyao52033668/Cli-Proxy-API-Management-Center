import type { TFunction } from 'i18next';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type {
  CodexInspectionAction,
  CodexInspectionResultFilter,
  CodexInspectionResultItem,
} from '@/features/codexInspection/model/types';

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: 1040,
  tableLayout: 'fixed',
  borderCollapse: 'collapse',
};

const headerCellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
};

const bodyCellStyle: CSSProperties = {
  padding: '12px',
  verticalAlign: 'top',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  lineHeight: 1.5,
};

const compactCellStyle: CSSProperties = {
  ...bodyCellStyle,
  whiteSpace: 'nowrap',
};

const errorCellStyle: CSSProperties = {
  ...bodyCellStyle,
  maxWidth: 260,
};

function shortError(error: string): string {
  const trimmed = error.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const message = extractErrorMessage(parsed);
    if (message) return message;
  } catch {
    // Keep plain-text errors as-is.
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function extractErrorMessage(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const direct = record.message;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const error = record.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
  }
  return '';
}

function toRemainingPercent(value?: number) {
  if (value == null) return null;
  return Math.max(0, Math.min(100, 100 - value));
}

function renderQuota(item: CodexInspectionResultItem, t: TFunction) {
  const fiveHour = toRemainingPercent(item.fiveHourUsedPercent ?? item.usedPercent);
  const weekly = toRemainingPercent(item.weeklyUsedPercent);

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span>
        {t('codex_inspection.quota_five_hour', { defaultValue: '5h' })}：{fiveHour != null ? `${fiveHour}%` : '-'}
      </span>
      <span>
        {t('codex_inspection.quota_weekly', { defaultValue: 'Weekly' })}：{weekly != null ? `${weekly}%` : '-'}
      </span>
    </div>
  );
}

function renderInspectionStatus(action: CodexInspectionAction, t: TFunction) {
  switch (action) {
    case 'keep':
      return t('codex_inspection.action_keep', { defaultValue: 'Keep' });
    case 'disable':
      return t('codex_inspection.action_disable', { defaultValue: 'Disable' });
    case 'enable':
      return t('codex_inspection.action_enable', { defaultValue: 'Enable' });
    case 'delete':
      return t('codex_inspection.action_delete', { defaultValue: 'Delete' });
    case 'reauth':
      return t('codex_inspection.action_delete', { defaultValue: 'Delete' });
    default:
      return action;
  }
}

function renderReason(reason: string, t: TFunction) {
  if (reason === 'no issue detected') {
    return '';
  }
  if (reason === '401 response') {
    return t('codex_inspection.reason_unauthorized', { defaultValue: '401 response' });
  }

  const weeklyGreaterMatch = reason.match(/^weeklyUsedPercent >=\s*(\d+)$/);
  if (weeklyGreaterMatch) {
    return t('codex_inspection.reason_weekly_threshold_ge', {
      defaultValue: 'Weekly used percent >= {{threshold}}',
      threshold: weeklyGreaterMatch[1],
    });
  }

  const weeklyLowerMatch = reason.match(/^weeklyUsedPercent <\s*(\d+)$/);
  if (weeklyLowerMatch) {
    return t('codex_inspection.reason_weekly_threshold_lt', {
      defaultValue: 'Weekly used percent < {{threshold}}',
      threshold: weeklyLowerMatch[1],
    });
  }

  const fiveHourGreaterMatch = reason.match(/^fiveHourUsedPercent >=\s*(\d+)$/);
  if (fiveHourGreaterMatch) {
    return t('codex_inspection.reason_five_hour_threshold_ge', {
      defaultValue: '5h used percent >= {{threshold}}',
      threshold: fiveHourGreaterMatch[1],
    });
  }

  const fiveHourLowerMatch = reason.match(/^fiveHourUsedPercent <\s*(\d+)$/);
  if (fiveHourLowerMatch) {
    return t('codex_inspection.reason_five_hour_threshold_lt', {
      defaultValue: '5h used percent < {{threshold}}',
      threshold: fiveHourLowerMatch[1],
    });
  }

  return shortError(reason);
}

type Props = {
  items: CodexInspectionResultItem[];
  selected: string[];
  filter: CodexInspectionResultFilter;
  disabled?: boolean;
  onFilterChange: (filter: CodexInspectionResultFilter) => void;
  onSelectedChange: (fileNames: string[]) => void;
  onExecuteSingle?: (action: CodexInspectionAction, fileName: string) => Promise<void>;
};

export function CodexInspectionResultsTable({
  items,
  selected,
  filter,
  disabled = false,
  onFilterChange,
  onSelectedChange,
  onExecuteSingle,
}: Props) {
  const { t } = useTranslation();

  const toggle = (fileName: string, checked: boolean) => {
    if (checked) {
      onSelectedChange(Array.from(new Set([...selected, fileName])));
      return;
    }
    onSelectedChange(selected.filter((value) => value !== fileName));
  };

  const allSelected = items.length > 0 && selected.length === items.length;

  const toggleAll = (checked: boolean) => {
    onSelectedChange(checked ? items.map((item) => item.fileName) : []);
  };

  const filters: Array<{ key: CodexInspectionResultFilter; label: string }> = [
    { key: 'all', label: t('codex_inspection.filter_all', { defaultValue: 'All' }) },
    { key: 'keep', label: t('codex_inspection.action_keep', { defaultValue: 'Keep' }) },
    { key: 'disabled', label: t('codex_inspection.filter_disabled', { defaultValue: 'Disabled accounts' }) },
    { key: 'disable', label: t('codex_inspection.action_disable', { defaultValue: 'Disable' }) },
    { key: 'enable', label: t('codex_inspection.action_enable', { defaultValue: 'Enable' }) },
    { key: 'delete', label: t('codex_inspection.action_delete', { defaultValue: 'Delete' }) },
  ];

  return (
    <Card title={t('codex_inspection.results_title', { defaultValue: 'Inspection results' })}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {filters.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={filter === item.key ? 'primary' : 'secondary'}
            disabled={disabled}
            onClick={() => onFilterChange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: 60 }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={headerCellStyle}>
                <SelectionCheckbox
                  checked={allSelected}
                  disabled={disabled || items.length === 0}
                  onChange={toggleAll}
                  ariaLabel={t('codex_inspection.select_all', { defaultValue: 'Select all results' })}
                />
              </th>
              <th style={headerCellStyle}>{t('codex_inspection.account_header', { defaultValue: 'Account' })}</th>
              <th style={headerCellStyle}>{t('codex_inspection.quota_header', { defaultValue: 'Quota' })}</th>
              <th style={headerCellStyle}>{t('codex_inspection.inspection_status_header', { defaultValue: 'Status' })}</th>
              <th style={headerCellStyle}>{t('codex_inspection.reason_header', { defaultValue: 'Reason' })}</th>
              <th style={headerCellStyle}>{t('codex_inspection.row_actions', { defaultValue: 'Row actions' })}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...bodyCellStyle, color: 'var(--text-secondary, #8b8b8b)' }}>
                  {t('codex_inspection.no_results', { defaultValue: 'No inspection results yet.' })}
                </td>
              </tr>
            ) : null}
            {items.map((item) => {
              const checked = selected.includes(item.fileName);

              return (
                <tr key={item.fileName}>
                  <td style={bodyCellStyle}>
                    <SelectionCheckbox
                      checked={checked}
                      disabled={disabled}
                      onChange={(value) => toggle(item.fileName, value)}
                      ariaLabel={t('codex_inspection.select_file', {
                        defaultValue: 'Select {{fileName}}',
                        fileName: item.fileName,
                      })}
                    />
                  </td>
                  <td style={bodyCellStyle}>{item.displayName || item.accountId || item.fileName || '-'}</td>
                  <td style={errorCellStyle}>{renderQuota(item, t)}</td>
                  <td style={compactCellStyle}>{renderInspectionStatus(item.action, t)}</td>
                  <td style={errorCellStyle} title={item.actionReason || undefined}>
                    {renderReason(item.actionReason, t)}
                  </td>
                  <td style={bodyCellStyle}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => void onExecuteSingle?.(item.disabled ? 'enable' : 'disable', item.fileName)}
                      >
                        {item.disabled
                          ? t('codex_inspection.enable_row', { defaultValue: 'Enable' })
                          : t('codex_inspection.disable_row', { defaultValue: 'Disable' })}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={disabled}
                        onClick={() => void onExecuteSingle?.('delete', item.fileName)}
                      >
                        {t('codex_inspection.delete_row', { defaultValue: 'Delete' })}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
