/**
 * Hours for one calendar date ("next Friday 10:00–14:00") on top of the
 * weekly hours. A date with its own hours uses them; every other date uses its
 * weekday's. The server stores them as `{ "YYYY-MM-DD": [{ startTime, endTime }] }`.
 */
import { WEEKDAYS, intervalToUnits, rangeUnits, unitsToIntervals, cellState, type Weekday, type WeekUnits } from './booking-settings';

export type DayHours = Record<string, Array<{ startTime: string; endTime: string }>>;
export type DateUnits = Record<string, Set<number>>;

function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The weekday of a date, as the weekly hours name it. */
export function weekdayOf(ymd: string): Weekday {
  return WEEKDAYS[(fromYmd(ymd).getDay() + 6) % 7].value;
}

const SHORT = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

/** "Vin" and "24" for a date chip. */
export function dateChip(ymd: string): { day: string; date: string } {
  const d = fromYmd(ymd);
  return { day: SHORT[d.getDay()], date: String(d.getDate()) };
}

/** "Vineri, 24 oct." */
export function dateTitle(ymd: string): string {
  const d = fromYmd(ymd);
  const months = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
  return `${WEEKDAYS[(d.getDay() + 6) % 7].label}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export function dateUnitsFrom(dayHours: DayHours | null | undefined): DateUnits {
  const out: DateUnits = {};
  for (const [date, intervals] of Object.entries(dayHours ?? {})) {
    out[date] = new Set((intervals ?? []).flatMap((i) => intervalToUnits(i)));
  }
  return out;
}

/** The date's own hours, else its weekday's. */
export function unitsForDate(ymd: string, week: WeekUnits, dated: DateUnits): Set<number> {
  return dated[ymd] ?? week[weekdayOf(ymd)] ?? new Set();
}

/** One tap on one cell of a date: the date gets its own hours, starting from what it showed. */
export function toggleDateCell(dated: DateUnits, ymd: string, week: WeekUnits, start: number, step: number): DateUnits {
  const current = new Set(unitsForDate(ymd, week, dated));
  const fill = cellState(current, start, step) !== 'all';
  for (const m of rangeUnits(start, start + step)) {
    if (fill) current.add(m);
    else current.delete(m);
  }
  return { ...dated, [ymd]: current };
}

/** A date with no hours at all — kept as its own (empty) hours, not the weekday's. */
export function clearDate(dated: DateUnits, ymd: string): DateUnits {
  return { ...dated, [ymd]: new Set() };
}

/** Back to the weekday's hours for this date. */
export function resetDate(dated: DateUnits, ymd: string): DateUnits {
  const next = { ...dated };
  delete next[ymd];
  return next;
}

/** One date's hours onto other dates (the rest of the week, say). */
export function copyDateTo(dated: DateUnits, from: string, week: WeekUnits, targets: string[]): DateUnits {
  const source = unitsForDate(from, week, dated);
  const next = { ...dated };
  for (const t of targets) if (t !== from) next[t] = new Set(source);
  return next;
}

const key = (units: Set<number> | undefined) =>
  units ? unitsToIntervals(units).map((i) => `${i.startTime}-${i.endTime}`).join(',') : null;

/** What to send: changed dates with their hours, dropped dates as null. */
export function dayHoursChanges(saved: DateUnits, edited: DateUnits): Array<{ date: string; intervals: Array<{ startTime: string; endTime: string }> | null }> {
  const dates = [...new Set([...Object.keys(saved), ...Object.keys(edited)])].sort();
  const out: Array<{ date: string; intervals: Array<{ startTime: string; endTime: string }> | null }> = [];
  for (const date of dates) {
    if (key(saved[date]) === key(edited[date])) continue;
    out.push({ date, intervals: edited[date] ? unitsToIntervals(edited[date]) : null });
  }
  return out;
}
