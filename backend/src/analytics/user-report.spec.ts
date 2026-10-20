import { AnalyticsController } from './analytics.controller';
import { computeRates, emptyCounts, hasActivity, sumCounts } from './user-report';
import { UserReportService } from './user-report.service';

describe('user report arithmetic', () => {
  it('computes answer, booking, show and close rates', () => {
    const c = emptyCounts();
    Object.assign(c.calls, { total: 10, answered: 6, booked: 3 });
    Object.assign(c.bookings, { held: 4, noShow: 1 });
    c.sales.won = 2;
    expect(computeRates(c)).toEqual({ answer: 60, booking: 50, show: 80, close: 50 });
  });

  it('leaves a rate empty when there is nothing under it, rather than 0%', () => {
    expect(computeRates(emptyCounts())).toEqual({ answer: null, booking: null, show: null, close: null });
  });

  it('closes against won + lost when no meeting was held', () => {
    const c = emptyCounts();
    c.sales.won = 1;
    c.sales.lost = 3;
    expect(computeRates(c).close).toBe(25);
  });

  it('adds people up, keeping currencies apart', () => {
    const a = emptyCounts();
    a.calls.total = 2;
    a.sales.revenueByCurrency = { RON: 100 };
    const b = emptyCounts();
    b.calls.total = 3;
    b.sales.revenueByCurrency = { RON: 50, EUR: 10 };
    const total = sumCounts([a, b]);
    expect(total.calls.total).toBe(5);
    expect(total.sales.revenueByCurrency).toEqual({ RON: 150, EUR: 10 });
  });

  it('knows an idle person', () => {
    expect(hasActivity(emptyCounts())).toBe(false);
    const c = emptyCounts();
    c.followUps.overdue = 1;
    expect(hasActivity(c)).toBe(true);
  });
});

describe('UserReportService', () => {
  const rowsFor = (sql: string) => {
    if (sql.includes('FROM users')) {
      return [
        { id: 'u1', firstName: 'Maria', lastName: 'T', role: 'closer' },
        { id: 'u2', firstName: 'Ion', lastName: 'C', role: 'caller' },
        { id: 'u3', firstName: 'Idle', lastName: '', role: 'caller' },
      ];
    }
    if (sql.includes(`type = 'call'`)) return [{ uid: 'u2', total: 4, answered: 2, notAnswered: 2, refused: 1, booked: 1 }];
    if (sql.includes('"hostId" AS uid')) return [{ uid: 'u1', received: 1, held: 1, noShow: 0, cancelled: 0 }];
    if (sql.includes('CROSS JOIN LATERAL')) return [{ uid: 'u2', set: 1 }];
    if (sql.includes('FROM deals')) {
      return [
        { uid: 'u1', stage: 'closed_won', currency: 'RON', n: 1, value: 2000 },
        { uid: 'u1', stage: 'closed_lost', currency: 'RON', n: 1, value: 500 },
      ];
    }
    return [];
  };

  function build() {
    const query = jest.fn(async (sql: string) => rowsFor(sql));
    return new UserReportService({ manager: { query } } as any);
  }

  it('builds a row per active person and a team total', async () => {
    const report = await build().getReport('ws', new Date('2026-10-01'), new Date('2026-10-31'));
    expect(report.users.map((u) => u.name)).toEqual(['Maria T', 'Ion C']);
    const maria = report.users[0];
    expect(maria.sales).toMatchObject({ won: 1, lost: 1, revenueByCurrency: { RON: 2000 } });
    expect(maria.rates.close).toBe(100);
    const ion = report.users[1];
    expect(ion.calls).toMatchObject({ total: 4, answered: 2, booked: 1 });
    expect(ion.bookings.set).toBe(1);
    expect(report.totals.calls.total).toBe(4);
  });

  it('shows one person even with nothing done', async () => {
    const report = await build().getReport('ws', new Date('2026-10-01'), new Date('2026-10-31'), 'u3');
    expect(report.users.map((u) => u.userId)).toEqual(['u3']);
  });
});

describe('GET /analytics/user-report scope', () => {
  function build() {
    const userReportService = { getReport: jest.fn().mockResolvedValue({}) };
    const controller = new AnalyticsController({} as any, userReportService as any);
    return { controller, userReportService };
  }
  const from = '2026-10-01T00:00:00.000Z';
  const to = '2026-10-31T23:59:59.999Z';

  it('a caller only ever gets their own numbers', async () => {
    const { controller, userReportService } = build();
    await controller.getUserReport('ws', { id: 'me', role: 'caller' }, from, to, 'someone-else');
    expect(userReportService.getReport.mock.calls[0][3]).toBe('me');
  });

  it('a manager can see the team or pick one person', async () => {
    const { controller, userReportService } = build();
    await controller.getUserReport('ws', { id: 'm', role: 'manager' }, from, to);
    await controller.getUserReport('ws', { id: 'm', role: 'manager' }, from, to, 'u2');
    expect(userReportService.getReport.mock.calls[0][3]).toBeUndefined();
    expect(userReportService.getReport.mock.calls[1][3]).toBe('u2');
  });

  it('rejects a backwards or oversized period', async () => {
    const { controller } = build();
    await expect(controller.getUserReport('ws', { role: 'admin' }, to, from)).rejects.toThrow();
    await expect(controller.getUserReport('ws', { role: 'admin' }, '2020-01-01', '2026-01-01')).rejects.toThrow();
  });
});
