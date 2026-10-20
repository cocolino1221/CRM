/**
 * The per-person report: what each caller and closer did in a period.
 *
 * The SQL lives in UserReportService; this file is the arithmetic, kept pure
 * so the rates can be tested without a database. A rate with nothing under it
 * is null, not 0 — "0% show rate" over zero meetings reads as a disaster.
 */

export interface UserReportRow {
  userId: string;
  name: string;
  role: string | null;
  calls: { total: number; answered: number; notAnswered: number; refused: number; booked: number };
  bookings: {
    /** Bookings made for leads this person calls/sets (caller/setter work). */
    set: number;
    /** Bookings placed in this person's diary (closer work). */
    received: number;
    held: number;
    noShow: number;
    cancelled: number;
  };
  sales: { won: number; lost: number; revenue: number; revenueByCurrency: Record<string, number> };
  followUps: { created: number; done: number; overdue: number };
  rates: {
    /** Answered calls out of all calls. */
    answer: number | null;
    /** Calls that ended in a booking, out of answered calls. */
    booking: number | null;
    /** Meetings that happened, out of those that were due (held + no-show). */
    show: number | null;
    /** Sales out of meetings held; with no meetings, out of won + lost. */
    close: number | null;
  };
}

export type ReportCounts = Omit<UserReportRow, 'userId' | 'name' | 'role' | 'rates'>;

export function emptyCounts(): ReportCounts {
  return {
    calls: { total: 0, answered: 0, notAnswered: 0, refused: 0, booked: 0 },
    bookings: { set: 0, received: 0, held: 0, noShow: 0, cancelled: 0 },
    sales: { won: 0, lost: 0, revenue: 0, revenueByCurrency: {} },
    followUps: { created: 0, done: 0, overdue: 0 },
  };
}

function ratio(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function computeRates(c: ReportCounts): UserReportRow['rates'] {
  const closeBase = c.bookings.held || c.sales.won + c.sales.lost;
  return {
    answer: ratio(c.calls.answered, c.calls.total),
    booking: ratio(c.calls.booked, c.calls.answered),
    show: ratio(c.bookings.held, c.bookings.held + c.bookings.noShow),
    close: ratio(c.sales.won, closeBase),
  };
}

/** Sum of every person's counts, for the "Total echipă" row. */
export function sumCounts(rows: ReportCounts[]): ReportCounts {
  const total = emptyCounts();
  for (const r of rows) {
    for (const group of ['calls', 'bookings', 'followUps'] as const) {
      for (const [k, v] of Object.entries(r[group])) (total[group] as any)[k] += Number(v) || 0;
    }
    total.sales.won += r.sales.won;
    total.sales.lost += r.sales.lost;
    total.sales.revenue += r.sales.revenue;
    for (const [cur, v] of Object.entries(r.sales.revenueByCurrency)) {
      total.sales.revenueByCurrency[cur] = (total.sales.revenueByCurrency[cur] || 0) + v;
    }
  }
  return total;
}

/** Nobody with zero everything clutters the list. */
export function hasActivity(c: ReportCounts): boolean {
  return (
    c.calls.total > 0 ||
    Object.values(c.bookings).some((v) => v > 0) ||
    c.sales.won + c.sales.lost > 0 ||
    Object.values(c.followUps).some((v) => v > 0)
  );
}

export const MAX_REPORT_DAYS = 400;
