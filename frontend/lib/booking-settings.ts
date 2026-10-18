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

export interface DayRow {
  /** Present once the row exists on the server. */
  id?: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(String(value || '').trim());
}

/** Minutes since midnight, for comparing two HH:MM strings. */
function minutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The reason a day cannot be saved, or null when it is fine. A disabled day is
 * never wrong — it is simply not worked.
 */
export function dayError(row: DayRow): string | null {
  if (!row.enabled) return null;
  if (!isValidTime(row.startTime) || !isValidTime(row.endTime)) {
    return 'Ora trebuie scrisă ca HH:MM.';
  }
  if (minutes(row.endTime) <= minutes(row.startTime)) {
    return 'Ora de final trebuie să fie după cea de început.';
  }
  return null;
}

export interface AvailabilityChange {
  create: Array<{ dayOfWeek: Weekday; startTime: string; endTime: string; isActive: true }>;
  update: Array<{ id: string; startTime: string; endTime: string; isActive: true }>;
  remove: string[];
}

/**
 * What to send so the server ends up matching the form.
 *
 * A day the closer switched off is deleted rather than left inactive: the
 * public booking page reads availability rows, and a stale row nobody can see
 * in the form is the kind of thing that puts a caller on a Sunday call.
 */
export function planAvailabilityChanges(
  existing: Array<{ id: string; dayOfWeek: Weekday; startTime: string; endTime: string }>,
  desired: DayRow[],
): AvailabilityChange {
  const byDay = new Map(existing.map((row) => [row.dayOfWeek, row]));
  const change: AvailabilityChange = { create: [], update: [], remove: [] };

  for (const row of desired) {
    const current = byDay.get(row.dayOfWeek);

    if (!row.enabled) {
      if (current) change.remove.push(current.id);
      continue;
    }

    if (!current) {
      change.create.push({
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        isActive: true,
      });
    } else if (current.startTime !== row.startTime || current.endTime !== row.endTime) {
      change.update.push({
        id: current.id,
        startTime: row.startTime,
        endTime: row.endTime,
        isActive: true,
      });
    }
  }

  // A row for a weekday the form does not know about would never be editable.
  const known = new Set(desired.map((r) => r.dayOfWeek));
  for (const row of existing) {
    if (!known.has(row.dayOfWeek)) change.remove.push(row.id);
  }

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
