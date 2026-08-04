import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconRefreshCw, IconTimer } from '@/components/ui/icons';
import { useAuthStore } from '@/stores';
import {
  authGuardApi,
  type AuthGuardEntry,
  type AuthGuardPolicy,
} from '@/services/api/authGuard';
import { formatDateTime } from '@/utils/format';
import styles from './AuthGuardPanel.module.scss';

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const formatRemaining = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatSeconds = (seconds: number, unit: string): string => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}${unit}`;
};

export function AuthGuardPanel() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [policy, setPolicy] = useState<AuthGuardPolicy | null>(null);
  const [entries, setEntries] = useState<AuthGuardEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (connectionStatus !== 'connected') {
        setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      setLoadError('');
      try {
        const data = await authGuardApi.fetchStatus();
        setPolicy(data.policy);
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setLoadError(
          message ? `${t('logs.auth_guard_load_error')}: ${message}` : t('logs.auth_guard_load_error')
        );
      } finally {
        setLoading(false);
      }
    },
    [connectionStatus, t]
  );

  useEffect(() => {
    if (connectionStatus === 'connected') {
      void load(false);
    }
  }, [connectionStatus, load]);

  useEffect(() => {
    if (!autoRefresh || connectionStatus !== 'connected') return;
    const id = window.setInterval(() => {
      void load(true);
    }, 8000);
    return () => window.clearInterval(id);
  }, [autoRefresh, connectionStatus, load]);

  return (
    <div className="stack">
      <div className="hint">{t('logs.auth_guard_description')}</div>

      {loadError && <div className="error-box">{loadError}</div>}

      {policy && (
        <div className={styles.policyPanel}>
          <div className={styles.policyTitle}>{t('logs.auth_guard_policy')}</div>
          <div className={styles.policyGrid}>
            <div className={styles.policyItem}>
              <span className={styles.policyLabel}>{t('logs.auth_guard_policy_threshold')}</span>
              <span className={styles.policyValue}>
                {t('logs.auth_guard_policy_threshold_value', { count: policy.max_failures })}
              </span>
            </div>
            <div className={styles.policyItem}>
              <span className={styles.policyLabel}>{t('logs.auth_guard_policy_ban_seconds')}</span>
              <span className={styles.policyValue}>
                {formatSeconds(policy.ban_seconds, t('logs.auth_guard_seconds_unit'))}
              </span>
            </div>
            <div className={styles.policyItem}>
              <span className={styles.policyLabel}>{t('logs.auth_guard_policy_window')}</span>
              <span className={styles.policyValue}>
                {formatSeconds(policy.window_seconds, t('logs.auth_guard_seconds_unit'))}
              </span>
            </div>
            <div className={styles.policyItem}>
              <span className={styles.policyLabel}>{t('logs.auth_guard_policy_escalation')}</span>
              <span className={styles.policyValue}>
                {policy.escalation_threshold > 0
                  ? t('logs.auth_guard_policy_escalation_enabled', {
                      count: policy.escalation_threshold,
                    })
                  : t('logs.auth_guard_policy_escalation_disabled')}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load(false)}
          disabled={disableControls}
          loading={loading}
        >
          <IconRefreshCw size={16} />
          {t('common.refresh')}
        </Button>
        <ToggleSwitch
          checked={autoRefresh}
          onChange={setAutoRefresh}
          disabled={disableControls}
          label={
            <span className={styles.switchLabel}>
              <IconTimer size={16} />
              {t('logs.auto_refresh')}
            </span>
          }
        />
      </div>

      <div className={styles.tableWrapper}>
        {loading ? (
          <div className="hint">{t('common.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="hint">{t('logs.auth_guard_empty')}</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('logs.auth_guard_ip')}</th>
                <th>{t('logs.auth_guard_status')}</th>
                <th>{t('logs.auth_guard_remaining')}</th>
                <th>{t('logs.auth_guard_failure_count')}</th>
                <th>{t('logs.auth_guard_ban_count')}</th>
                <th>{t('logs.auth_guard_last_failure')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.ip}>
                  <td className={styles.ipCell}>{entry.ip}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        entry.banned ? styles.statusBanned : styles.statusWatching
                      }`}
                    >
                      {entry.banned ? t('logs.auth_guard_banned') : t('logs.auth_guard_watching')}
                    </span>
                    {entry.escalated && (
                      <span
                        className={`${styles.statusBadge} ${styles.statusEscalated}`}
                        title={t('logs.auth_guard_escalated')}
                      >
                        {t('logs.auth_guard_escalated')}
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.banned
                      ? `${formatRemaining(entry.remaining_seconds ?? 0)} (${formatDateTime(entry.ban_expires_at ?? '')})`
                      : '-'}
                  </td>
                  <td>{entry.failure_count}</td>
                  <td>{entry.ban_count}</td>
                  <td>{entry.last_failure ? formatDateTime(entry.last_failure) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
