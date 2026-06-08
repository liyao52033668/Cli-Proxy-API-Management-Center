import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { CodexInspectionSettings } from '@/features/codexInspection/model/types';

type Props = {
  settings: CodexInspectionSettings;
  showSchedule: boolean;
  nextTriggerAtMs?: number;
  disabled: boolean;
  loading?: boolean;
  onChange: (next: CodexInspectionSettings) => void;
  onSave: () => Promise<void>;
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 160,
  flex: '1 1 160px',
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--border-primary, #d0d0d0)',
  background: 'var(--bg-secondary, #fff)',
};

const scheduleRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  width: '100%',
};

const checkboxFieldStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 160,
  paddingTop: 30,
};

const checkboxStyle: CSSProperties = {
  width: 16,
  height: 16,
  margin: 0,
  flex: '0 0 auto',
};

export function CodexInspectionSettingsPanel({
  settings,
  showSchedule,
  nextTriggerAtMs,
  disabled,
  loading = false,
  onChange,
  onSave,
}: Props) {
  const { t } = useTranslation();

  const commitIntervalMinutes = (rawValue: string) => {
    onChange({
      ...settings,
      schedule: {
        ...settings.schedule,
        intervalMinutes: Math.max(1, Number(rawValue) || 1),
      },
    });
  };

  const formattedNextTrigger =
    nextTriggerAtMs && nextTriggerAtMs > 0
      ? (() => {
          const date = new Date(nextTriggerAtMs);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}`;
        })()
      : t('codex_inspection.next_trigger_none', { defaultValue: '—' });

  return (
    <Card
      title={t('codex_inspection.settings_title', { defaultValue: 'Inspection settings' })}
      extra={
        <Button variant="primary" size="sm" disabled={disabled} loading={loading} onClick={() => void onSave()}>
          {t('common.save')}
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.workers', { defaultValue: 'Workers' })}</span>
          <input
            style={inputStyle}
            type="number"
            min={1}
            value={settings.workers}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, workers: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </label>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.timeout_seconds', { defaultValue: 'Timeout seconds' })}</span>
          <input
            style={inputStyle}
            type="number"
            min={1}
            value={settings.timeoutSeconds}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...settings,
                timeoutSeconds: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </label>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.retries', { defaultValue: 'Retries' })}</span>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={settings.retries}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, retries: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </label>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.sample_size', { defaultValue: 'Sample size' })}</span>
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={settings.sampleSize}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, sampleSize: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </label>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.used_percent_threshold', { defaultValue: 'Used % threshold' })}</span>
          <input
            style={inputStyle}
            type="number"
            min={0}
            max={100}
            value={settings.usedPercentThreshold}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...settings,
                usedPercentThreshold: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
              })
            }
          />
        </label>
        {showSchedule ? (
          <div style={{ ...scheduleRowStyle, flexDirection: 'column', gap: 8 }}>
            <div style={scheduleRowStyle}>
              <label style={checkboxFieldStyle}>
                <span>{t('codex_inspection.schedule_enabled', { defaultValue: 'Schedule enabled' })}</span>
                <input
                  style={checkboxStyle}
                  type="checkbox"
                  checked={settings.schedule.enabled}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...settings,
                      schedule: { ...settings.schedule, enabled: event.target.checked },
                    })
                  }
                />
              </label>
              <label style={{ ...fieldStyle, minWidth: 220, flex: '1 1 240px' }}>
                <span>{t('codex_inspection.interval_minutes', { defaultValue: 'Interval minutes' })}</span>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={settings.schedule.intervalMinutes > 0 ? settings.schedule.intervalMinutes : ''}
                  disabled={disabled}
                  onChange={(event) => {
                    const { value } = event.target;
                    if (value === '') {
                      onChange({
                        ...settings,
                        schedule: {
                          ...settings.schedule,
                          intervalMinutes: 0,
                        },
                      });
                      return;
                    }
                    commitIntervalMinutes(value);
                  }}
                  onBlur={(event) => {
                    if (event.target.value === '') {
                      commitIntervalMinutes('1');
                    }
                  }}
                />
              </label>
            </div>
            {settings.schedule.enabled ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
                {t('codex_inspection.next_trigger_at', { defaultValue: 'Next trigger at' })}: {formattedNextTrigger}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
