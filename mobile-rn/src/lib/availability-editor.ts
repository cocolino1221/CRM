/**
 * The hours screen as a phone can hold it.
 *
 * The web grid is painted with a dragging pointer across all seven days at
 * once. A phone has room for one day and a thumb, so the same week is edited
 * by tapping single cells and copying a day over the others — and the day a
 * closer is not looking at has to be readable as one line of text.
 *
 * Every function here returns a new week: a Set mutated in place is a state
 * change React never renders, which on this screen looks like a tap that did
 * nothing.
 */

import {
  UNIT,
  WEEKDAYS,
  cellState,
  rangeUnits,
  toTime,
  unitsToIntervals,
  type WeekUnits,
  type Weekday,
} from './booking-settings';

/** Monday to Friday, the days "copiază" fills. */
export const WORKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const clone = (week: WeekUnits): WeekUnits =>
  Object.fromEntries(WEEKDAYS.map(({ value }) => [value, new Set(week[value] ?? [])])) as WeekUnits;

/**
 * One tap on one cell. A full cell clears; anything else fills.
 *
 * Filling a half-selected cell is the deliberate choice: the half comes from
 * hours saved off the grid (an old 09:10 start) or from a finer step, and a
 * tap that cleared it would throw away the part the closer cannot see at this
 * step without ever showing it to them.
 */
export function toggleCell(week: WeekUnits, day: Weekday, start: number, step: number): WeekUnits {
  const next = clone(week);
  const fill = cellState(week[day] ?? new Set(), start, step) !== 'all';
  for (const m of rangeUnits(start, start + step)) {
    if (fill) next[day].add(m);
    else next[day].delete(m);
  }
  return next;
}

/** One day's hours onto Monday–Friday. An empty source clears the week. */
export function copyDayToWorkdays(week: WeekUnits, from: Weekday): WeekUnits {
  const next = clone(week);
  for (const day of WORKDAYS) next[day] = new Set(week[from] ?? []);
  return next;
}

export function clearDay(week: WeekUnits, day: Weekday): WeekUnits {
  const next = clone(week);
  next[day] = new Set();
  return next;
}

/**
 * A day as one line: "09:00–12:00 · 14:00–17:00", or "Liber".
 *
 * This is the only thing shown for the six days not on screen, so it reads
 * midnight as 24:00 — the 23:59 the hours column actually stores is read back
 * as midnight everywhere else, and printing it here would look like a mistake.
 */
export function daySummary(units: Set<number>): string {
  const intervals = unitsToIntervals(units);
  if (intervals.length === 0) return 'Liber';
  return intervals
    .map(({ startTime, endTime }) => `${startTime}–${endTime === '23:59' ? '24:00' : endTime}`)
    .join(' · ');
}

/** Hours selected across the week, quarter hours included. */
export function weekHours(week: WeekUnits): number {
  const units = WEEKDAYS.reduce((n, { value }) => n + (week[value]?.size ?? 0), 0);
  return (units * UNIT) / 60;
}

/**
 * The hours the day grid shows unless the whole day is asked for. The web
 * grid uses the same window, so a week typed there reads back the same here.
 */
export const DAY_START = 7 * 60;
export const DAY_END = 22 * 60;

/**
 * Whether the week holds an hour outside that window.
 *
 * Saving replaces every row the grid does not account for, so an hour the
 * grid cannot show is an hour the next save deletes. The screen opens on the
 * full day rather than quietly dropping someone's 06:00 start.
 */
export function needsFullDay(week: WeekUnits): boolean {
  return WEEKDAYS.some(({ value }) =>
    [...(week[value] ?? [])].some((m) => m < DAY_START || m >= DAY_END),
  );
}

/** The start times of the cells one day is drawn with. */
export function cellStarts(step: number, dayStart: number, dayEnd: number): number[] {
  const out: number[] = [];
  for (let m = dayStart; m < dayEnd; m += step) out.push(m);
  return out;
}

export const cellLabel = (start: number): string => toTime(start);

/**
 * What the server would refuse, said before the round trip: a nameless
 * meeting type or a duration outside the column's range, which on this screen
 * would otherwise come back as a validation array nobody can read.
 */
export function validateMeeting(name: string, duration: number): string | null {
  if (!String(name || '').trim()) return 'Pune un nume întâlnirii.';
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return 'Durata trebuie între 5 și 480 de minute.';
  }
  return null;
}
