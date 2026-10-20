/**
 * The period a report covers, in the phone's own clock: a day, a week
 * (Monday to Sunday, as Romanians count it), a month, or dates typed in.
 * Kept free of React so the edges — month ends, week starts, a typo in a
 * custom date — can be tested.
 */

export type PeriodKind = 'day' | 'week' | 'month' | 'custom';

export interface Period {
  kind: PeriodKind;
  from: Date;
  to: Date;
}

const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_LONG = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** The period of a kind that contains `ref`. */
export function periodFor(kind: Exclude<PeriodKind, 'custom'>, ref: Date = new Date()): Period {
  if (kind === 'day') return { kind, from: startOfDay(ref), to: endOfDay(ref) };
  if (kind === 'week') {
    // getDay(): Sunday is 0; the week starts Monday.
    const offset = (ref.getDay() + 6) % 7;
    const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - offset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { kind, from: startOfDay(monday), to: endOfDay(sunday) };
  }
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { kind, from: startOfDay(first), to: endOfDay(last) };
}

/** One step back (-1) or forward (+1). A custom period moves by its own length. */
export function shiftPeriod(period: Period, step: -1 | 1): Period {
  if (period.kind === 'day') return periodFor('day', new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + step));
  if (period.kind === 'week') return periodFor('week', new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + 7 * step));
  if (period.kind === 'month') return periodFor('month', new Date(period.from.getFullYear(), period.from.getMonth() + step, 1));
  const days = Math.round((startOfDay(period.to).getTime() - startOfDay(period.from).getTime()) / 86_400_000) + 1;
  const from = new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate() + days * step);
  const to = new Date(period.to.getFullYear(), period.to.getMonth(), period.to.getDate() + days * step);
  return { kind: 'custom', from: startOfDay(from), to: endOfDay(to) };
}

/**
 * A date as typed on a phone: "20.10.2026", "20/10/2026" or "2026-10-20".
 * Returns null for anything that is not a real calendar day (31.02 is not).
 */
export function parseTypedDate(input: string): Date | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const ro = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (ro) [d, m, y] = [Number(ro[1]), Number(ro[2]), Number(ro[3])];
  else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function customPeriod(fromText: string, toText: string): Period | { error: string } {
  const from = parseTypedDate(fromText);
  const to = parseTypedDate(toText);
  if (!from || !to) return { error: 'Scrie datele ca 20.10.2026.' };
  if (from.getTime() > to.getTime()) return { error: 'Data de început e după data de sfârșit.' };
  return { kind: 'custom', from: startOfDay(from), to: endOfDay(to) };
}

export function formatTypedDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** What the header says: "Azi", "13–19 oct.", "Octombrie 2026", "01.10–15.10.2026". */
export function periodLabel(period: Period, now: Date = new Date()): string {
  const { from, to } = period;
  if (period.kind === 'day') {
    if (startOfDay(from).getTime() === startOfDay(now).getTime()) return 'Azi';
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (startOfDay(from).getTime() === yesterday.getTime()) return 'Ieri';
    return `${from.getDate()} ${MONTHS[from.getMonth()]}. ${from.getFullYear()}`;
  }
  if (period.kind === 'week') {
    const sameMonth = from.getMonth() === to.getMonth();
    return sameMonth
      ? `${from.getDate()}–${to.getDate()} ${MONTHS[to.getMonth()]}.`
      : `${from.getDate()} ${MONTHS[from.getMonth()]}. – ${to.getDate()} ${MONTHS[to.getMonth()]}.`;
  }
  if (period.kind === 'month') return `${MONTHS_LONG[from.getMonth()]} ${from.getFullYear()}`;
  return `${formatTypedDate(from)} – ${formatTypedDate(to)}`;
}

/** "45%", or a dash when there was nothing to measure. */
export function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

/** "2.000 RON · 500 EUR" — currencies are never added together. */
export function formatRevenue(byCurrency: Record<string, number> | undefined): string {
  const entries = Object.entries(byCurrency || {}).filter(([, v]) => v);
  if (!entries.length) return '0';
  return entries
    .map(([cur, v]) => `${Math.round(v).toLocaleString('ro-RO')} ${cur}`)
    .join(' · ');
}
