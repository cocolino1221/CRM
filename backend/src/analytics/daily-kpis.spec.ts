import { AnalyticsService } from './analytics.service';
import { ActivityType } from '../database/entities/activity.entity';

const WORKSPACE = 'workspace-1';

type Captured = { where?: any };

/**
 * getDailyKPIs reads five repositories. The assertions below care about the
 * activity query (which rows it selects and how it counts them) and about the
 * day window every query is given.
 */
function buildService(options: { activities?: any[]; timezone?: string } = {}) {
  const captured: { activities?: Captured; contacts?: Captured } = {};

  const activityRepository = {
    find: jest.fn().mockImplementation((opts: any) => {
      captured.activities = opts;
      return Promise.resolve(options.activities ?? []);
    }),
  };

  const contactRepository = {
    count: jest.fn().mockImplementation((opts: any) => {
      captured.contacts = opts;
      return Promise.resolve(0);
    }),
  };

  const dealRepository = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    })),
  };

  const taskRepository = { find: jest.fn().mockResolvedValue([]) };

  const workspaceRepository = {
    findOne: jest.fn().mockResolvedValue(
      options.timezone ? { id: WORKSPACE, settings: { timezone: options.timezone } } : null,
    ),
  };

  const service = new AnalyticsService(
    contactRepository as any,
    dealRepository as any,
    taskRepository as any,
    {} as any,
    activityRepository as any,
    {} as any,
    {} as any,
    workspaceRepository as any,
  );

  return { service, captured, workspaceRepository };
}

describe('AnalyticsService.getDailyKPIs', () => {
  // callsMade was structurally stuck at zero: nothing in the backend creates
  // an ActivityType.CALL, and WhatsApp calls are stored as whatsapp_message
  // with metadata.messageType === 'call'.
  it('counts a WhatsApp call activity in callsMade', async () => {
    const { service } = buildService({
      activities: [
        { type: 'whatsapp_message', metadata: { messageType: 'call' } },
        { type: 'whatsapp_message', metadata: { messageType: 'text' } },
      ],
    });

    const kpis = await service.getDailyKPIs(WORKSPACE);

    expect(kpis.callsMade).toBe(1);
  });

  it('still counts ActivityType.CALL in callsMade', async () => {
    const { service } = buildService({
      activities: [{ type: ActivityType.CALL, metadata: {} }],
    });

    await expect(service.getDailyKPIs(WORKSPACE)).resolves.toMatchObject({ callsMade: 1 });
  });

  it('buckets activities by occurredAt, not createdAt', async () => {
    const { service, captured } = buildService();

    await service.getDailyKPIs(WORKSPACE);

    expect(captured.activities?.where).toHaveProperty('occurredAt');
    expect(captured.activities?.where).not.toHaveProperty('createdAt');
  });

  it('filters activities to one user when userId is given', async () => {
    const { service, captured } = buildService();

    await service.getDailyKPIs(WORKSPACE, undefined, 'user-7');

    expect(captured.activities?.where).toMatchObject({ userId: 'user-7' });
  });

  // Review Focus 5 — a call at 23:30 in Bucharest belongs to that local day.
  it('uses the workspace timezone for the start and end of the day', async () => {
    const { service, captured } = buildService({ timezone: 'Europe/Bucharest' });

    await service.getDailyKPIs(WORKSPACE, new Date('2026-08-26T12:00:00Z'));

    // Between(start, end) keeps its bounds on the operator's value array.
    const range = (captured.activities?.where as any).occurredAt;
    const [start, end] = range.value as [Date, Date];
    expect(start.toISOString()).toBe('2026-08-25T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-26T20:59:59.999Z');
  });

  it('falls back to UTC when the workspace has no timezone set', async () => {
    const { service, captured } = buildService();

    await service.getDailyKPIs(WORKSPACE, new Date('2026-08-26T12:00:00Z'));

    const [start] = (captured.activities?.where as any).occurredAt.value as [Date, Date];
    expect(start.toISOString()).toBe('2026-08-26T00:00:00.000Z');
  });
});
