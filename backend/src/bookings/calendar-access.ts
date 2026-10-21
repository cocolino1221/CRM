/**
 * Who belongs in the calendar, and what counts as an hour.
 *
 * A booking is only worth anything if the host is someone who actually takes
 * meetings. Until now any user in the workspace could be named as host, and
 * a host booking themselves skipped the availability check — so a super_admin
 * test account with no declared hours at all ended up holding a lead's
 * appointment at three in the morning.
 */

/** The roles that work the calendar: they book, they are booked, they show up. */
export const CALENDAR_ROLES = ['closer', 'caller', 'setter'] as const;

export function canHostMeetings(user: { role?: string } | null | undefined): boolean {
  const role = String(user?.role || '').toLowerCase();
  return (CALENDAR_ROLES as readonly string[]).includes(role);
}

/**
 * Whether a start time carries an hour.
 *
 * "2026-10-24" is a valid ISO date, so a date-only value passes every date
 * check and lands in Postgres as midnight UTC — which the app then shows in
 * Bucharest as 03:00. An appointment nobody chose looks exactly like one
 * somebody did, which is why this is refused rather than rounded.
 */
export function hasTimeOfDay(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/\d{2}:\d{2}/.test(text)) return false;
  return !Number.isNaN(new Date(text).getTime());
}
