import { AnalyticsService } from './analytics.service';

/**
 * The end-of-day report was opened to callers and closers so they could see
 * their own day. It was never scoped: teamPerformance, topWins and the
 * pipeline were built from workspace-wide queries, so a caller opening their
 * own report read every colleague's revenue and every won deal by name.
 */
function buildService(overrides: Partial<Record<string, any>> = {}) {
  const service = Object.create(AnalyticsService.prototype) as any;

  service.logger = { log: jest.fn(), warn: jest.fn() };
  service.getDailyKPIs = jest.fn().mockResolvedValue({
    date: '2026-10-18',
    newContacts: 1,
    newDeals: 1,
    dealsWon: 1,
    dealsLost: 0,
    revenue: 100,
    activitiesCompleted: 3,
    tasksCompleted: 1,
    callsMade: 4,
    emailsSent: 0,
    meetingsHeld: 1,
    conversionRate: 100,
    pipelineValue: 5000,
  });

  const emptyQb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  service.dealRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'd-1',
        title: 'Vanzare mare',
        value: '9000',
        stage: 'closed_won',
        owner: { id: 'colleague', firstName: 'Alt', lastName: 'Coleg' },
        ownerId: 'colleague',
      },
    ]),
    count: jest.fn().mockResolvedValue(3),
    createQueryBuilder: jest.fn(() => emptyQb),
  };
  service.activityRepository = {
    find: jest.fn().mockResolvedValue([
      { id: 'a-1', type: 'call', userId: 'colleague', user: { id: 'colleague', firstName: 'Alt', lastName: 'Coleg' } },
    ]),
    count: jest.fn().mockResolvedValue(1),
    createQueryBuilder: jest.fn(() => emptyQb),
  };
  service.contactRepository = {
    count: jest.fn().mockResolvedValue(2),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => emptyQb),
  };
  service.taskRepository = {
    count: jest.fn().mockResolvedValue(1),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => emptyQb),
  };

  Object.assign(service, overrides);
  return service;
}

describe('generateEODReport — what a caller may see', () => {
  it('gives a manager the whole team', async () => {
    const service = buildService();

    const report = await service.generateEODReport('ws-1', new Date('2026-10-18'));

    expect(report.teamPerformance).toBeDefined();
    expect(report.pipeline).toBeDefined();
  });

  // The leak: one caller's own report must not carry the team's numbers.
  it('shows a caller nobody but themselves', async () => {
    const service = buildService();

    const report = await service.generateEODReport('ws-1', new Date('2026-10-18'), 'me');

    const names = JSON.stringify(report.teamPerformance ?? []);
    expect(names).not.toContain('colleague');
    expect(names).not.toContain('Coleg');
  });

  it('keeps the workspace pipeline and the biggest wins away from a caller', async () => {
    const service = buildService();

    const report = await service.generateEODReport('ws-1', new Date('2026-10-18'), 'me');

    expect(report.pipeline).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain('Vanzare mare');
  });

  it('still gives the caller their own figures', async () => {
    const service = buildService();

    const report = await service.generateEODReport('ws-1', new Date('2026-10-18'), 'me');

    expect(report.summary).toBeDefined();
    expect(report.summary.callsMade).toBe(4);
  });
});
