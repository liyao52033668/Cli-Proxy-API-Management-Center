import type { CodexInspectionSettings, CodexInspectionSnapshot } from './types';

const SETTINGS_KEY = 'codex-inspection.local.settings';
const SNAPSHOT_KEY = 'codex-inspection.local.snapshot';

export function loadLocalSettings(fallback: CodexInspectionSettings): CodexInspectionSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalSettings(settings: CodexInspectionSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLocalSnapshot(): CodexInspectionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as CodexInspectionSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveLocalSnapshot(snapshot: CodexInspectionSnapshot) {
  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}
