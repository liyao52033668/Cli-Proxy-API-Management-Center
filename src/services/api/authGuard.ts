/**
 * 认证防护（撞库防护）相关 API
 */

import { apiClient } from './client';
import { LOGS_TIMEOUT_MS } from '@/utils/constants';

export interface AuthGuardEntry {
  ip: string;
  banned: boolean;
  ban_expires_at?: string;
  remaining_seconds?: number;
  failure_count: number;
  ban_count: number;
  escalated: boolean;
  last_failure?: string;
}

export interface AuthGuardPolicy {
  max_failures: number;
  ban_seconds: number;
  window_seconds: number;
  escalation_threshold: number;
}

export interface AuthGuardSnapshot {
  entries: AuthGuardEntry[] | null;
  policy: AuthGuardPolicy;
}

export const authGuardApi = {
  fetchStatus: (): Promise<AuthGuardSnapshot> =>
    apiClient.get('/auth-guard', { timeout: LOGS_TIMEOUT_MS }),
};
