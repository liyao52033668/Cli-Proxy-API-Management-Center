/**
 * Raw reset instants, in epoch milliseconds.
 *
 * Providers' payloads carry a real reset timestamp, but each builder formatted
 * it straight to a display string and dropped the original. That is fine for a
 * card row and useless for anything that has to *compute* with the value —
 * comparing "MM/DD, HH:MM" strings gets the order wrong across a year boundary.
 *
 * These helpers keep the instant alongside the label rather than replacing it,
 * so nothing about the existing rendering changes.
 */

/** Milliseconds in an hour — window periods are expressed in hours throughout. */
const HOUR_MS = 3_600_000;

/**
 * Parse an ISO-8601 timestamp to epoch ms.
 *
 * Tolerates the over-precise fractional seconds some providers emit
 * (`.123456789`), which `new Date()` rejects on some engines.
 */
export function parseIsoToMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/(\.\d{6})\d+/, '$1');
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Parse a Unix timestamp to epoch ms, accepting seconds or milliseconds.
 *
 * Disambiguated by magnitude: seconds-since-epoch stays ~1e9 well past the year
 * 2200, while a millisecond value is ~1e12 today, so the gap is unambiguous for
 * any timestamp this application will encounter.
 */
export function parseUnixToMs(value: unknown): number | null {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 1e11 ? numeric * 1000 : numeric;
}

/**
 * First reset instant found among `candidates`, trying ISO then Unix.
 *
 * Providers disagree about both key names and encodings, and some send several
 * of them; taking the first parseable one keeps that mess in one place.
 */
export function resolveResetMs(candidates: readonly unknown[]): number | null {
  for (const candidate of candidates) {
    const iso = parseIsoToMs(candidate);
    if (iso !== null) return iso;
    const unix = parseUnixToMs(candidate);
    if (unix !== null) return unix;
  }
  return null;
}

/** Window length in hours from a seconds value, or null when absent/invalid. */
export function periodHoursFromSeconds(value: unknown): number | null {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return (numeric * 1000) / HOUR_MS;
}
