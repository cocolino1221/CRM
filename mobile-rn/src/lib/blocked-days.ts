/**
 * Whole days off a closer blocks on their calendar: no booking lands on them,
 * whatever the weekly hours say. Dates are local YYYY-MM-DD strings, the same
 * shape the server stores.
 */

export const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];
export const WEEKDAYS_SHORT_RO = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const DAY_NAMES_RO = ['dum.', 'lun.', 'mar.', 'mie.', 'joi', 'vin.', 'sâm.'];
const MONTHS_SHORT_RO = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date as YYYY-MM-DD (not toISOString, which would shift it to UTC). */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The month as weeks starting Monday; days outside the month are null so the
 * grid lines up.
 */
export function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(toYmd(new Date(year, month, day)));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Adds the day if missing, removes it if there; always sorted. */
export function toggleDay(days: string[], ymd: string): string[] {
  const set = new Set(days);
  if (set.has(ymd)) set.delete(ymd);
  else set.add(ymd);
  return [...set].sort();
}

/** The coming Saturday and Sunday; on a Sunday, just today. */
export function nextWeekend(now: Date = new Date()): string[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  if (dow === 0) return [toYmd(today)];
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + (6 - dow));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  return [toYmd(saturday), toYmd(sunday)];
}

/** Adds every day in `extra` that is not already blocked. */
export function addDays(days: string[], extra: string[]): string[] {
  return [...new Set([...days, ...extra])].sort();
}

export function isPastDay(ymd: string, now: Date = new Date()): boolean {
  return ymd < toYmd(now);
}

/** "sâm. 24 oct." */
export function formatBlockedDay(ymd: string): string {
  const d = fromYmd(ymd);
  return `${DAY_NAMES_RO[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT_RO[d.getMonth()]}`;
}

/** The days still ahead, for the list under the calendar. */
export function upcomingDays(days: string[], now: Date = new Date()): string[] {
  return days.filter((d) => !isPastDay(d, now)).sort();
}
