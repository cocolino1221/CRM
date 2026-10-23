/**
 * Hours for one calendar date — "next Friday I work 10:00–14:00" — on top of
 * the weekly hours. A date with its own hours uses them instead of its
 * weekday's; an empty list is a day with no hours. Stored per host in
 * `user.preferences.dayHours`, typed in `user.preferences.dayHoursZone`.
 */
import { isValidYmd } from './blocked-days';

export interface DayInterval {
  startTime: string;
  endTime: string;
}

export type DayHours = Record<string, DayInterval[]>;

export const MAX_DAY_HOURS_DATES = 400;
const MAX_INTERVALS = 24;
const HM = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

const minutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/** Real "HH:MM"–"HH:MM" windows, start before end, sorted, at most a day's worth. */
export function cleanIntervals(raw: unknown): DayInterval[] {
  if (!Array.isArray(raw)) return [];
  const out: DayInterval[] = [];
  for (const item of raw) {
    const start = String((item as any)?.startTime ?? '').slice(0, 5);
    const end = String((item as any)?.endTime ?? '').slice(0, 5);
    if (!HM.test(start) || !HM.test(end) || minutes(end) <= minutes(start)) continue;
    out.push({ startTime: start, endTime: end });
  }
  return out.sort((a, b) => minutes(a.startTime) - minutes(b.startTime)).slice(0, MAX_INTERVALS);
}

/** The per-date hours saved on a user, ignoring anything malformed. */
export function dayHoursOf(user: { preferences?: Record<string, any> | null } | null | undefined): DayHours {
  const raw = user?.preferences?.dayHours;
  if (!raw || typeof raw !== 'object') return {};
  const out: DayHours = {};
  for (const [date, intervals] of Object.entries(raw)) {
    if (isValidYmd(date) && Array.isArray(intervals)) out[date] = cleanIntervals(intervals);
  }
  return out;
}

/**
 * Applies `[{ date, intervals }]`: a list sets that date's hours (empty = no
 * hours that day), null removes them so the weekday's hours apply again.
 * Past dates are dropped (a day of slack for time zones).
 */
export function applyDayHoursChanges(current: DayHours, changes: unknown, now: Date = new Date()): DayHours {
  const next: DayHours = { ...current };
  if (Array.isArray(changes)) {
    for (const change of changes) {
      const date = String((change as any)?.date ?? '').slice(0, 10);
      if (!isValidYmd(date)) continue;
      const intervals = (change as any)?.intervals;
      if (intervals === null || intervals === undefined) delete next[date];
      else next[date] = cleanIntervals(intervals);
    }
  }
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const kept = Object.keys(next)
    .filter((d) => d >= yesterday)
    .sort()
    .slice(0, MAX_DAY_HOURS_DATES);
  return Object.fromEntries(kept.map((d) => [d, next[d]]));
}

/**
 * The windows to offer on `ymd` when that date has its own hours, shaped like
 * weekly availability rows; null when the weekday's hours apply.
 */
export function overrideRowsFor(
  user: { preferences?: Record<string, any> | null } | null | undefined,
  ymd: string,
  fallbackZone = 'Europe/Bucharest',
): Array<{ startTime: string; endTime: string; timezone: string }> | null {
  const hours = dayHoursOf(user);
  if (!(ymd in hours)) return null;
  const zone = String(user?.preferences?.dayHoursZone || fallbackZone);
  return hours[ymd].map((i) => ({ ...i, timezone: zone }));
}

/** True when [startMin, endMin) sits inside one of the windows. */
export function withinIntervals(intervals: DayInterval[], startMin: number, endMin: number): boolean {
  return intervals.some((i) => startMin >= minutes(i.startTime) && endMin <= minutes(i.endTime));
}
