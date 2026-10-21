/**
 * Whole days a host has taken off ("blocked"), on top of the weekly hours: a
 * Saturday they would normally work, a holiday, a day at the dentist. Stored
 * as closer-local dates (YYYY-MM-DD) in `user.preferences.blockedDays`.
 */

export const MAX_BLOCKED_DAYS = 366;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !YMD.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The calendar date `at` falls on in `zone` (YYYY-MM-DD). */
export function ymdInZone(at: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/**
 * What a host sent, cleaned: real dates only, no duplicates, sorted, nothing
 * already past (a day of slack for time zones), capped at a year's worth.
 */
export function normalizeBlockedDays(input: unknown, now: Date = new Date()): string[] {
  if (!Array.isArray(input)) return [];
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const days = new Set<string>();
  for (const value of input) {
    const day = typeof value === 'string' ? value.trim().slice(0, 10) : value;
    if (isValidYmd(day) && day >= yesterday) days.add(day);
  }
  return [...days].sort().slice(0, MAX_BLOCKED_DAYS);
}

/** The blocked days saved on a user, ignoring anything malformed. */
export function blockedDaysOf(user: { preferences?: Record<string, any> | null } | null | undefined): string[] {
  const raw = user?.preferences?.blockedDays;
  return Array.isArray(raw) ? raw.filter(isValidYmd) : [];
}

/** True when the moment `at` lands on one of the host's days off, in their zone. */
export function isBlockedAt(days: string[], at: Date, zone: string): boolean {
  return days.length > 0 && days.includes(ymdInZone(at, zone));
}

/** The zone a host's hours were typed in: their first weekly row's, else UTC. */
export function hostZoneOf(rows: Array<{ timezone?: string | null }>): string {
  return rows.find((r) => r.timezone)?.timezone || 'UTC';
}
