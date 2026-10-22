import { describe, expect, it } from 'vitest';
import { periodFor } from './report-period';
import { dayLabel, daysOf, filterByRole, hasActivity, reportAsText, type ReportRow } from './report-export';

const row = (over: Partial<ReportRow> & { name: string; role: string | null }): ReportRow => ({
  userId: over.name,
  calls: { total: 0, answered: 0, notAnswered: 0, refused: 0, booked: 0 },
  bookings: { set: 0, received: 0, held: 0, noShow: 0, cancelled: 0 },
  sales: { won: 0, lost: 0, revenue: 0, revenueByCurrency: {} },
  followUps: { created: 0, done: 0, overdue: 0 },
  rates: { answer: null, booking: null, show: null, close: null },
  ...over,
});

describe('report export', () => {
  const team = [row({ name: 'Maria', role: 'closer' }), row({ name: 'Ion', role: 'caller' }), row({ name: 'Dan', role: 'SETTER' })];

  it('filters by role, case and all', () => {
    expect(filterByRole(team, 'closer').map((r) => r.name)).toEqual(['Maria']);
    expect(filterByRole(team, 'setter').map((r) => r.name)).toEqual(['Dan']);
    expect(filterByRole(team, '')).toHaveLength(3);
  });

  it('splits a week into its seven days, Monday first', () => {
    const days = daysOf(periodFor('week', new Date(2026, 9, 21)));
    expect(days).toHaveLength(7);
    expect(dayLabel(days[0].from)).toBe('Lun 19.10');
    expect(dayLabel(days[6].from)).toBe('Dum 25.10');
    expect(days[0].to.getHours()).toBe(23);
  });

  it('never splits into more than a month of days', () => {
    expect(daysOf({ kind: 'custom', from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) })).toHaveLength(31);
  });

  it('tells an empty day from a busy one', () => {
    expect(hasActivity(row({ name: 'x', role: null }))).toBe(false);
    expect(hasActivity(row({ name: 'x', role: null, calls: { total: 3, answered: 1, notAnswered: 2, refused: 0, booked: 0 } }))).toBe(true);
  });

  it('writes the report as text with every person', () => {
    const text = reportAsText(
      'Săptămâna 19–25 oct.',
      row({ name: 'Total', role: null, sales: { won: 2, lost: 1, revenue: 400, revenueByCurrency: { RON: 400 } } }),
      [row({ name: 'Maria', role: 'closer' })],
    );
    expect(text).toContain('📊 Raport Săptămâna 19–25 oct.');
    expect(text).toContain('*Toată echipa*');
    expect(text).toContain('Vândut: 2 · pierdut 1 · încasări 400 RON');
    expect(text).toContain('*Maria (Closer)*');
  });
});
