/**
 * Quota cache that survives route switches.
 */

import type { AntigravityQuotaState, ClaudeQuotaState, CodexQuotaState, CopilotQuotaState, GeminiCliQuotaState, KimiQuotaState, KiroQuotaState } from '@/types';
import { create } from 'zustand';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  copilotQuota: Record<string, CopilotQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  kiroQuota: Record<string, KiroQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setCopilotQuota: (updater: QuotaUpdater<Record<string, CopilotQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, KiroQuotaState>>) => void;
  clearQuotaCache: () => void;
}

const resolveUpdater = <T,>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

export const useQuotaStore = create<QuotaStoreState>((set) => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  copilotQuota: {},
  geminiCliQuota: {},
  kimiQuota: {},
  kiroQuota: {},
  setAntigravityQuota: (updater) =>
    set((state) => ({
      antigravityQuota: resolveUpdater(updater, state.antigravityQuota)
    })),
  setClaudeQuota: (updater) =>
    set((state) => ({
      claudeQuota: resolveUpdater(updater, state.claudeQuota)
    })),
  setCodexQuota: (updater) =>
    set((state) => ({
      codexQuota: resolveUpdater(updater, state.codexQuota)
    })),
  setCopilotQuota: (updater) =>
    set((state) => ({
      copilotQuota: resolveUpdater(updater, state.copilotQuota)
    })),
  setGeminiCliQuota: (updater) =>
    set((state) => ({
      geminiCliQuota: resolveUpdater(updater, state.geminiCliQuota)
    })),
  setKimiQuota: (updater) =>
    set((state) => ({
      kimiQuota: resolveUpdater(updater, state.kimiQuota)
    })),
  setKiroQuota: (updater) =>
    set((state) => ({
      kiroQuota: resolveUpdater(updater, state.kiroQuota)
    })),
  clearQuotaCache: () =>
    set({
      antigravityQuota: {},
      claudeQuota: {},
      codexQuota: {},
      copilotQuota: {},
      geminiCliQuota: {},
      kimiQuota: {},
      kiroQuota: {}
    })
}));
