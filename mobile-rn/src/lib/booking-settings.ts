/**
 * The rules behind the booking settings screen.
 *
 * Kept out of the component so the part that decides what gets written to the
 * server can be tested without a DOM — this is the piece whose mistakes are
 * invisible until a closer's week is silently wrong.
 */

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/** Monday first: nobody in this workspace plans a week starting Sunday. */
export const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 'monday', label: 'Luni' },
  { value: 'tuesday', label: 'Marți' },
  { value: 'wednesday', label: 'Miercuri' },
  { value: 'thursday', label: 'Joi' },
  { value: 'friday', label: 'Vineri' },
  { value: 'saturday', label: 'Sâmbătă' },
  { value: 'sunday', label: 'Duminică' },
];

/** The same shape the backend's CreateAvailabilityDto validates. */
export const TIME_PATTERN = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

/** The finest grain the grid stores; coarser views are made of these. */
export const UNIT = 15;

/** Start times a lead can be offered, in minutes between them. */
export const SLOT_INTERVALS = [15, 30, 60] as const;
export type SlotInterval = (typeof SLOT_INTERVALS)[number];

/**
 * A closer's week as the starts (minutes since midnight) of every 15-minute
 * unit they are free in. Stored at the finest grain so switching the grid
 * from 15 to 30 minutes and back never loses a selection.
 */
export type WeekUnits = Record<Weekday, Set<number>>;

export interface Interval {
  startTime: string;
  endTime: string;
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(String(value || '').trim());
}

/** Minutes since midnight for an HH:MM (or HH:MM:SS) string. */
export function toMinutes(value: string): number {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

/** HH:MM for minutes since midnight; 1440 is written as 24:00 for display only. */
export function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function emptyWeek(): WeekUnits {
  return Object.fromEntries(WEEKDAYS.map(({ value }) => [value, new Set<number>()])) as WeekUnits;
}

/** Every unit in [start, end). */
export function rangeUnits(start: number, end: number): number[] {
  const out: number[] = [];
  for (let m = start; m < end; m += UNIT) out.push(m);
  return out;
}

/** A week nobody has touched yet: weekdays nine to five, weekend off. */
export function defaultWeek(): WeekUnits {
  const week = emptyWeek();
  for (const { value } of WEEKDAYS) {
    if (value === 'saturday' || value === 'sunday') continue;
    week[value] = new Set(rangeUnits(9 * 60, 17 * 60));
  }
  return week;
}

/**
 * The units a saved interval covers. A unit only counts when it sits wholly
 * inside — an old 09:10 start is shown from 09:15, never widened to 09:00.
 */
export function intervalToUnits(interval: Interval): number[] {
  const start = Math.ceil(toMinutes(interval.startTime) / UNIT) * UNIT;
  // The time column cannot hold 24:00, so a day ending 23:59 means midnight.
  const rawEnd = toMinutes(interval.endTime);
  const end = rawEnd === 23 * 60 + 59 ? 24 * 60 : Math.floor(rawEnd / UNIT) * UNIT;
  return rangeUnits(start, end);
}

/**
 * Contiguous units merged into the fewest intervals. Adjacent rows must never
 * be saved: a booking that straddles them would be refused by the server,
 * which checks each row on its own.
 */
export function unitsToIntervals(units: Iterable<number>): Interval[] {
  const sorted = [...new Set(units)].sort((a, b) => a - b);
  const out: Interval[] = [];
  let start: number | null = null;
  let prev = -UNIT;
  for (const m of sorted) {
    if (start === null) start = m;
    else if (m !== prev + UNIT) {
      out.push({ startTime: toTime(start), endTime: endTime(prev + UNIT) });
      start = m;
    }
    prev = m;
  }
  if (start !== null) out.push({ startTime: toTime(start), endTime: endTime(prev + UNIT) });
  return out;
}

/** The backend only accepts 00:00–23:59, so midnight is stored as 23:59. */
function endTime(minutes: number): string {
  return minutes >= 24 * 60 ? '23:59' : toTime(minutes);
}

export function weekFromRows(
  rows: Array<{ dayOfWeek: Weekday; startTime: string; endTime: string; isActive?: boolean }>,
): WeekUnits {
  const week = emptyWeek();
  for (const row of rows) {
    // A switched-off row is the "closed all week" marker, not hours.
    if (row.isActive === false) continue;
    if (!week[row.dayOfWeek]) continue;
    for (const m of intervalToUnits(row)) week[row.dayOfWeek].add(m);
  }
  return week;
}

/** How much of a grid cell [start, start+step) is selected: 'all', 'some' or 'none'. */
export function cellState(units: Set<number>, start: number, step: number): 'all' | 'some' | 'none' {
  const inside = rangeUnits(start, start + step);
  const on = inside.filter((m) => units.has(m)).length;
  return on === 0 ? 'none' : on === inside.length ? 'all' : 'some';
}

export interface AvailabilityChange {
  create: Array<{ dayOfWeek: Weekday; startTime: string; endTime: string; isActive: boolean }>;
  remove: string[];
}

/**
 * Saved when a closer clears the whole week. Without it no rows are left,
 * which reads back as "never set up" and the screen fills the default week
 * again — the closer's "I am off" was lost on every save.
 */
export const CLOSED_WEEK_MARKER = { dayOfWeek: 'monday' as Weekday, startTime: '00:00', endTime: '00:15', isActive: false };

/**
 * What to send so the server ends up matching the grid.
 *
 * A row that already says exactly what the grid says is left alone; every
 * other row is deleted and the missing windows created. Deleting rather than
 * deactivating matters: the public page reads these rows, and a stale one
 * nobody can see in the grid is what puts a lead on a Sunday call.
 */
export function planAvailabilityChanges(
  existing: Array<{ id: string; dayOfWeek: Weekday; startTime: string; endTime: string; isActive?: boolean }>,
  week: WeekUnits,
): AvailabilityChange {
  const key = (day: string, start: string, end: string) => `${day}|${start.slice(0, 5)}|${end.slice(0, 5)}`;
  const wanted = new Map<string, { dayOfWeek: Weekday; startTime: string; endTime: string }>();
  for (const { value } of WEEKDAYS) {
    for (const interval of unitsToIntervals(week[value] ?? [])) {
      wanted.set(key(value, interval.startTime, interval.endTime), { dayOfWeek: value, ...interval });
    }
  }

  const change: AvailabilityChange = { create: [], remove: [] };
  const closed = wanted.size === 0;
  let markerKept = false;
  for (const row of existing) {
    if (row.isActive === false) {
      // Keep one marker while the week is closed; drop it once hours return.
      if (closed && !markerKept) markerKept = true;
      else change.remove.push(row.id);
      continue;
    }
    const k = key(row.dayOfWeek, row.startTime, row.endTime);
    // A second identical row is a duplicate: keep the first, drop the rest.
    if (wanted.has(k)) wanted.delete(k);
    else change.remove.push(row.id);
  }
  for (const row of wanted.values()) change.create.push({ ...row, isActive: true });
  if (closed && !markerKept) change.create.push({ ...CLOSED_WEEK_MARKER });
  return change;
}

/** Strips diacritics so "Consultație" becomes "consultatie", not "consulta-ie". */
export function slugify(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * The slug column is unique across every workspace, not per workspace, so a
 * plain "consultatie" belongs to whoever saved it first. The suffix is what
 * keeps a second workspace from being refused.
 */
export function buildMeetingSlug(name: string, suffix: string): string {
  const base = slugify(name) || 'consultatie';
  return `${base}-${suffix}`;
}

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
