/**
 * The team report sliced and sent: by role, day by day, and as text to paste
 * into WhatsApp or an email. Kept free of React so the numbers can be tested.
 */
import { formatRate, formatRevenue, periodFor, type Period } from './report-period';

export type ReportRow = {
  userId: string;
  name: string;
  role: string | null;
  calls: { total: number; answered: number; notAnswered: number; refused: number; booked: number };
  bookings: { set: number; received: number; held: number; noShow: number; cancelled: number };
  sales: { won: number; lost: number; revenue: number; revenueByCurrency: Record<string, number> };
  followUps: { created: number; done: number; overdue: number };
  rates: { answer: number | null; booking: number | null; show: number | null; close: number | null };
};

export type RoleFilter = '' | 'closer' | 'setter' | 'caller';

export const ROLE_FILTERS: Array<{ id: RoleFilter; label: string }> = [
  { id: '', label: 'Toți' },
  { id: 'closer', label: 'Closeri' },
  { id: 'setter', label: 'Setteri' },
  { id: 'caller', label: 'Calleri' },
];

/** The people in one role; everyone when no role is picked. */
export function filterByRole(rows: ReportRow[], role: RoleFilter): ReportRow[] {
  if (!role) return rows;
  return rows.filter((r) => String(r.role || '').toLowerCase() === role);
}

/** Each day of a period, as a one-day period — for the day-by-day list. Capped at 31. */
export function daysOf(period: Period): Period[] {
  const days: Period[] = [];
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), period.from.getDate());
  while (cursor <= period.to && days.length < 31) {
    days.push(periodFor('day', cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const DAY_NAMES = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

/** "Lun 20.10" */
export function dayLabel(day: Date): string {
  return `${DAY_NAMES[day.getDay()]} ${String(day.getDate()).padStart(2, '0')}.${String(day.getMonth() + 1).padStart(2, '0')}`;
}

/** Whether a row did anything at all — empty days are left out of the list. */
export function hasActivity(row: ReportRow | null | undefined): boolean {
  if (!row) return false;
  return (
    row.calls.total + row.bookings.set + row.bookings.received + row.bookings.held +
      row.sales.won + row.sales.lost + row.followUps.created + row.followUps.done >
    0
  );
}

const ROLE_LABEL: Record<string, string> = { closer: 'Closer', setter: 'Setter', caller: 'Caller', admin: 'Admin', manager: 'Manager' };

function rowLines(row: ReportRow): string[] {
  return [
    `Apeluri: ${row.calls.total} (au răspuns ${row.calls.answered}, n-au răspuns ${row.calls.notAnswered}, refuz ${row.calls.refused})`,
    `Programat din apel: ${row.calls.booked} · programări făcute ${row.bookings.set} · primite ${row.bookings.received}`,
    `Întâlniri ținute: ${row.bookings.held} · no-show ${row.bookings.noShow} · anulate ${row.bookings.cancelled}`,
    `Vândut: ${row.sales.won} · pierdut ${row.sales.lost + row.calls.refused} · încasări ${formatRevenue(row.sales.revenueByCurrency)}`,
    `Follow-up: create ${row.followUps.created} · făcute ${row.followUps.done} · întârziate ${row.followUps.overdue}`,
    `Rate: răspuns ${formatRate(row.rates.answer)} · programare ${formatRate(row.rates.booking)} · prezență ${formatRate(row.rates.show)} · închidere ${formatRate(row.rates.close)}`,
  ];
}

/** The report as plain text, ready for WhatsApp, an email or Notes. */
export function reportAsText(title: string, totals: ReportRow | null, rows: ReportRow[]): string {
  const parts = [`📊 Raport ${title}`];
  if (totals) parts.push('', '*Toată echipa*', ...rowLines(totals));
  for (const row of rows) {
    const role = row.role ? ` (${ROLE_LABEL[row.role] || row.role})` : '';
    parts.push('', `*${row.name}${role}*`, ...rowLines(row));
  }
  return parts.join('\n');
}
