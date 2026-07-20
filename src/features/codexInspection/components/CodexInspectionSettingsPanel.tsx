import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type {
  CodexInspectionAction,
  CodexInspectionSettings,
} from '@/features/codexInspection/model/types';

type Props = {
  settings: CodexInspectionSettings;
  providers: string[];
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

const statusCodeActionOptions: CodexInspectionAction[] = [
  'keep',
  'disable',
  'enable',
  'reauth',
  'failed',
  'delete',
];

const defaultSchedule = {
  enabled: false,
  mode: 'interval' as const,
  intervalMinutes: 60,
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

/** Backend stores used%; UI edits remaining%. */
function toRemainingThreshold(usedThreshold: number) {
  return clampPercent(100 - usedThreshold);
}

function toUsedThreshold(remainingThreshold: number) {
  return clampPercent(100 - remainingThreshold);
}

function resolveNextTriggerAtMs(nextTriggerAtMs: number, intervalMinutes: number, nowMs: number) {
  const intervalMs = intervalMinutes * 60 * 1000;
  if (intervalMs <= 0 || nextTriggerAtMs > nowMs) {
    return nextTriggerAtMs;
  }

  const elapsedIntervals = Math.floor((nowMs - nextTriggerAtMs) / intervalMs) + 1;
  return nextTriggerAtMs + elapsedIntervals * intervalMs;
}

export function CodexInspectionSettingsPanel({
  settings,
  providers,
  showSchedule,
  nextTriggerAtMs,
  disabled,
  loading = false,
  onChange,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const newStatusCodeInputRef = useRef<HTMLInputElement>(null);
  const [newStatusCodes, setNewStatusCodes] = useState<Record<string, string>>({});
  const [newStatusActions, setNewStatusActions] = useState<Record<string, CodexInspectionAction>>(
    {}
  );
  const provider = settings.targetType.trim().toLowerCase();
  const providerSchedule = settings.schedules[provider] ?? defaultSchedule;
  const newStatusCode = newStatusCodes[provider] ?? '';
  const newStatusAction = newStatusActions[provider] ?? 'reauth';
  const providerStatusCodeActions = settings.statusCodeActions?.[provider] ?? {};
  const statusCodeEntries = Object.entries(providerStatusCodeActions).sort(
    ([left], [right]) => Number(left) - Number(right)
  );
  const parsedNewStatusCode = Number(newStatusCode);
  const canAddStatusCode =
    Number.isInteger(parsedNewStatusCode) &&
    parsedNewStatusCode >= 400 &&
    parsedNewStatusCode <= 599;
  const actionLabels: Record<CodexInspectionAction, string> = {
    keep: t('codex_inspection.action_keep', { defaultValue: 'Normal' }),
    disable: t('codex_inspection.action_disable', { defaultValue: 'Suggest disable' }),
    enable: t('codex_inspection.action_enable', { defaultValue: 'Suggest enable' }),
    reauth: t('codex_inspection.action_reauth', { defaultValue: 'Reauth required' }),
    failed: t('codex_inspection.action_failed', { defaultValue: 'Inspection failed' }),
    delete: t('codex_inspection.action_delete', { defaultValue: 'Suggest delete' }),
  };

  useEffect(() => {
    if (!showSchedule || !providerSchedule.enabled || !nextTriggerAtMs || nextTriggerAtMs <= 0) {
      return undefined;
    }

    const upcomingTriggerAtMs = resolveNextTriggerAtMs(
      nextTriggerAtMs,
      providerSchedule.intervalMinutes,
      nowMs
    );
    const delay = Math.max(1000, upcomingTriggerAtMs - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    nextTriggerAtMs,
    nowMs,
    providerSchedule.enabled,
    providerSchedule.intervalMinutes,
    showSchedule,
  ]);

  const updateProviderStatusCodeActions = (
    nextProviderActions: Record<string, CodexInspectionAction>
  ) => {
    const nextStatusCodeActions = { ...(settings.statusCodeActions ?? {}) };
    if (Object.keys(nextProviderActions).length > 0) {
      nextStatusCodeActions[provider] = nextProviderActions;
    } else {
      delete nextStatusCodeActions[provider];
    }
    onChange({ ...settings, statusCodeActions: nextStatusCodeActions });
  };

  const addStatusCodeAction = () => {
    if (!canAddStatusCode) {
      return;
    }
    updateProviderStatusCodeActions({
      ...providerStatusCodeActions,
      [String(parsedNewStatusCode)]: newStatusAction,
    });
    setNewStatusCodes((current) => ({ ...current, [provider]: '' }));
    window.requestAnimationFrame(() => newStatusCodeInputRef.current?.focus());
  };

  const updateProviderSchedule = (nextSchedule: typeof providerSchedule) => {
    onChange({
      ...settings,
      schedules: {
        ...settings.schedules,
        [provider]: nextSchedule,
      },
    });
  };

  const commitIntervalMinutes = (rawValue: string) => {
    updateProviderSchedule({
      ...providerSchedule,
      intervalMinutes: Math.max(1, Number(rawValue) || 1),
    });
  };

  const formattedNextTrigger =
    nextTriggerAtMs && nextTriggerAtMs > 0
      ? (() => {
          const displayedTriggerAtMs = providerSchedule.enabled
            ? resolveNextTriggerAtMs(nextTriggerAtMs, providerSchedule.intervalMinutes, nowMs)
            : nextTriggerAtMs;
          const date = new Date(displayedTriggerAtMs);
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
        <Button
          variant="primary"
          size="sm"
          disabled={disabled}
          loading={loading}
          onClick={() => void onSave()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          <span>{t('codex_inspection.provider', { defaultValue: 'Provider' })}</span>
          <select
            style={inputStyle}
            value={settings.targetType}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...settings, targetType: event.target.value.trim().toLowerCase() })
            }
          >
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
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
        {settings.targetType === 'codex' ? (
          <>
            <label style={fieldStyle}>
              <span>
                {t('codex_inspection.five_hour_remaining_percent_threshold', {
                  defaultValue: '5h remaining % threshold',
                })}
              </span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                value={toRemainingThreshold(settings.fiveHourUsedPercentThreshold)}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    fiveHourUsedPercentThreshold: toUsedThreshold(Number(event.target.value) || 0),
                  })
                }
              />
            </label>
            <label style={fieldStyle}>
              <span>
                {t('codex_inspection.weekly_remaining_percent_threshold', {
                  defaultValue: 'Weekly remaining % threshold',
                })}
              </span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                value={toRemainingThreshold(settings.weeklyUsedPercentThreshold)}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    weeklyUsedPercentThreshold: toUsedThreshold(Number(event.target.value) || 0),
                  })
                }
              />
            </label>
          </>
        ) : null}
        {provider === 'xai' ? (
          <div
            style={{
              width: '100%',
              display: 'grid',
              gap: 6,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-primary, #d0d0d0)',
              background: 'var(--bg-tertiary, #f7f7f7)',
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {t('codex_inspection.xai_probe_title', {
                defaultValue: 'Grok OAuth inspection',
              })}
            </div>
            <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
              {t('codex_inspection.xai_probe_hint', {
                defaultValue:
                  'Uses grok-4.5 to verify actual Grok chat access. Healthy disabled accounts are enabled automatically. Official pay-as-you-go API keys are not probed.',
              })}
            </div>
            <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
              {t('codex_inspection.xai_status_override_hint', {
                defaultValue:
                  'Bare HTTP 402, 403, and 429 responses are kept for review by default. Custom status code rules still take priority and scheduled inspections may execute disable or delete rules automatically.',
              })}
            </div>
          </div>
        ) : null}
        <div
          style={{
            width: '100%',
            display: 'grid',
            gap: 10,
            paddingTop: 16,
            borderTop: '1px solid var(--border-primary, #e0e0e0)',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {t('codex_inspection.status_code_rules_title', {
              defaultValue: 'Status code classifications',
            })}
          </div>
          <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
            {t('codex_inspection.status_code_rules_description', {
              defaultValue:
                'Configure how HTTP error status codes are classified for {{provider}}. Configured rules override the default classification.',
              provider,
            })}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'end',
            }}
          >
            <label style={{ ...fieldStyle, flex: '1 1 180px' }}>
              <span>{t('codex_inspection.status_code', { defaultValue: 'HTTP status code' })}</span>
              <input
                ref={newStatusCodeInputRef}
                style={inputStyle}
                type="number"
                min={400}
                max={599}
                value={newStatusCode}
                disabled={disabled}
                placeholder="请输入400–599的http状态码"
                onChange={(event) =>
                  setNewStatusCodes((current) => ({
                    ...current,
                    [provider]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canAddStatusCode) {
                    event.preventDefault();
                    addStatusCodeAction();
                  }
                }}
              />
            </label>
            <label style={{ ...fieldStyle, flex: '2 1 240px' }}>
              <span>
                {t('codex_inspection.classification', { defaultValue: 'Classification' })}
              </span>
              <select
                style={inputStyle}
                value={newStatusAction}
                disabled={disabled}
                onChange={(event) =>
                  setNewStatusActions((current) => ({
                    ...current,
                    [provider]: event.target.value as CodexInspectionAction,
                  }))
                }
              >
                {statusCodeActionOptions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabels[action]}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              style={{ minWidth: 120, flex: '0 0 auto' }}
              disabled={disabled || !canAddStatusCode}
              onClick={addStatusCodeAction}
            >
              {t('codex_inspection.add_rule', { defaultValue: 'Add rule' })}
            </Button>
          </div>
          {statusCodeEntries.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {statusCodeEntries.map(([statusCode, action]) => (
                <div
                  key={statusCode}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-primary, #d0d0d0)',
                    background: 'var(--bg-tertiary, #f7f7f7)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      minWidth: 140,
                      flex: '0 1 180px',
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 7px',
                        borderRadius: 6,
                        background: 'var(--bg-secondary, #fff)',
                        color: 'var(--text-secondary, #666)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      HTTP
                    </span>
                    <code style={{ fontSize: 16, fontWeight: 700 }}>{statusCode}</code>
                  </div>
                  <select
                    style={{ ...inputStyle, minWidth: 200, flex: '1 1 240px' }}
                    value={action}
                    disabled={disabled}
                    onChange={(event) =>
                      updateProviderStatusCodeActions({
                        ...providerStatusCodeActions,
                        [statusCode]: event.target.value as CodexInspectionAction,
                      })
                    }
                  >
                    {statusCodeActionOptions.map((option) => (
                      <option key={option} value={option}>
                        {actionLabels[option]}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="danger"
                    style={{ minWidth: 88, flex: '0 0 auto' }}
                    disabled={disabled}
                    onClick={() => {
                      const nextProviderActions = { ...providerStatusCodeActions };
                      delete nextProviderActions[statusCode];
                      updateProviderStatusCodeActions(nextProviderActions);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
              {t('codex_inspection.no_status_code_rules', {
                defaultValue: 'No custom status code classifications.',
              })}
            </div>
          )}
          <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
            {t('codex_inspection.scheduled_actions_hint', {
              defaultValue:
                'Scheduled inspections automatically apply disable, enable, and delete classifications.',
            })}
          </div>
        </div>
        {showSchedule ? (
          <div style={{ ...scheduleRowStyle, flexDirection: 'column', gap: 8 }}>
            <div style={scheduleRowStyle}>
              <label style={checkboxFieldStyle}>
                <span>
                  {t('codex_inspection.schedule_enabled', { defaultValue: 'Schedule enabled' })}
                </span>
                <input
                  style={checkboxStyle}
                  type="checkbox"
                  checked={providerSchedule.enabled}
                  disabled={disabled}
                  onChange={(event) =>
                    updateProviderSchedule({
                      ...providerSchedule,
                      enabled: event.target.checked,
                    })
                  }
                />
              </label>
              <label style={{ ...fieldStyle, minWidth: 220, flex: '1 1 240px' }}>
                <span>
                  {t('codex_inspection.interval_minutes', { defaultValue: 'Interval minutes' })}
                </span>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  value={
                    providerSchedule.intervalMinutes > 0 ? providerSchedule.intervalMinutes : ''
                  }
                  disabled={disabled}
                  onChange={(event) => {
                    const { value } = event.target;
                    if (value === '') {
                      updateProviderSchedule({
                        ...providerSchedule,
                        intervalMinutes: 0,
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
            {providerSchedule.enabled ? (
              <div style={{ color: 'var(--text-secondary, #666)', fontSize: 13 }}>
                {t('codex_inspection.next_trigger_at', { defaultValue: 'Next trigger at' })}:{' '}
                {formattedNextTrigger}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
