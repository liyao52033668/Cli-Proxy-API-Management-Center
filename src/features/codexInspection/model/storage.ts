import type { CodexInspectionSettings, CodexInspectionSnapshot } from './types';

const SETTINGS_KEY = 'codex-inspection.local.settings';
const SNAPSHOT_KEY = 'codex-inspection.local.snapshot';

function normalizeSettings(
  settings: CodexInspectionSettings,
  fallback: CodexInspectionSettings
): CodexInspectionSettings {
  const {
    usedPercentThreshold: legacyThreshold,
    schedule: legacySchedule,
    schedules,
    ...rest
  } = settings;
  const targetType = settings.targetType.trim().toLowerCase() || fallback.targetType;
  const normalizedSchedules = Object.fromEntries(
    Object.entries(schedules ?? {}).map(([provider, schedule]) => [
      provider.trim().toLowerCase(),
      schedule,
    ])
  );
  if (!normalizedSchedules[targetType]) {
    normalizedSchedules[targetType] = {
      ...(fallback.schedules[targetType] ?? fallback.schedules[fallback.targetType]),
      ...legacySchedule,
    };
  }

  return {
    ...fallback,
    ...rest,
    targetType,
    fiveHourUsedPercentThreshold:
      typeof settings.fiveHourUsedPercentThreshold === 'number'
        ? settings.fiveHourUsedPercentThreshold
        : (legacyThreshold ?? fallback.fiveHourUsedPercentThreshold),
    weeklyUsedPercentThreshold:
      typeof settings.weeklyUsedPercentThreshold === 'number'
        ? settings.weeklyUsedPercentThreshold
        : (legacyThreshold ?? fallback.weeklyUsedPercentThreshold),
    schedules: normalizedSchedules,
  };
}

export function loadLocalSettings(fallback: CodexInspectionSettings): CodexInspectionSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as CodexInspectionSettings, fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocalSettings(settings: CodexInspectionSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadLocalSnapshot(
  fallback?: CodexInspectionSettings
): CodexInspectionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }
    const snapshot = JSON.parse(raw) as CodexInspectionSnapshot;
    if (!fallback) {
      return snapshot;
    }
    return {
      ...snapshot,
      settings: normalizeSettings(snapshot.settings, fallback),
    };
  } catch {
    return null;
  }
}

export function saveLocalSnapshot(snapshot: CodexInspectionSnapshot) {
  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}
