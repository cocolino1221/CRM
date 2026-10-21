import { WorkQueuesService, parseQueueSource } from './work-queues.service';
import { BookingStatus } from '../database/entities/booking.entity';

const WORKSPACE = 'workspace-1';

function qb(result: any, raw?: any) {
  const builder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndMapOne: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue(result ?? []),
    getManyAndCount: jest.fn().mockResolvedValue([result ?? [], (result ?? []).length]),
    getRawMany: jest.fn().mockResolvedValue(raw ?? []),
  };
  return builder;
}

function build(options: {
  followUps?: any[];
  bookings?: any[];
  leads?: any[];
  latestRecordings?: any[];
  deals?: any[];
} = {}) {
  const activityBuilder = qb(options.followUps, options.latestRecordings);
  const bookingBuilder = qb(options.bookings);
  const contactBuilder = qb(options.leads);
  const dealBuilder = qb([], options.deals);

  const activityRepository = { createQueryBuilder: jest.fn(() => activityBuilder) };
  const bookingRepository = { createQueryBuilder: jest.fn(() => bookingBuilder) };
  const contactRepository = { createQueryBuilder: jest.fn(() => contactBuilder) };
  const dealRepository = { createQueryBuilder: jest.fn(() => dealBuilder) };
  const workspaceRepository = { findOne: jest.fn().mockResolvedValue({ settings: {} }) };

  const service = new WorkQueuesService(
    activityRepository as any,
    bookingRepository as any,
    contactRepository as any,
    dealRepository as any,
    workspaceRepository as any,
  );

  return { service, activityBuilder, bookingBuilder, contactBuilder, dealBuilder };
}

describe('WorkQueuesService.findFollowUpsDue', () => {
  it('returns activities whose followUpDate has passed', async () => {
    const due = [{ id: 'a1', followUpRequired: true }];
    const { service } = build({ followUps: due });

    await expect(service.findFollowUpsDue(WORKSPACE)).resolves.toEqual(due);
  });

  it('requires followUpRequired to be true', async () => {
    const { service, activityBuilder } = build();

    await service.findFollowUpsDue(WORKSPACE);

    const clauses = activityBuilder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => c.includes('followUpRequired'))).toBe(true);
  });

  it('scopes to the given user when userId is passed', async () => {
    const { service, activityBuilder } = build();

    await service.findFollowUpsDue(WORKSPACE, 'user-7');

    const params = activityBuilder.andWhere.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
    expect(params.some((p: any) => p.userId === 'user-7')).toBe(true);
  });
});

describe('WorkQueuesService.findBooked', () => {
  it('returns upcoming bookings', async () => {
    const bookings = [{ id: 'b1', startTime: new Date('2026-12-01T10:00:00Z') }];
    const { service } = build({ bookings });

    await expect(service.findBooked(WORKSPACE)).resolves.toEqual(bookings);
  });

  it('excludes cancelled bookings', async () => {
    const { service, bookingBuilder } = build();

    await service.findBooked(WORKSPACE);

    const params = bookingBuilder.andWhere.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
    expect(
      params.some((p: any) => Array.isArray(p.excluded) && p.excluded.includes(BookingStatus.CANCELLED)),
    ).toBe(true);
  });

  it('scopes to the host when a userId is given', async () => {
    const { service, bookingBuilder } = build();

    await service.findBooked(WORKSPACE, 'user-7');

    const clauses = bookingBuilder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => c.includes('hostId'))).toBe(true);
  });

  it('only returns bookings starting now or later', async () => {
    const { service, bookingBuilder } = build();

    await service.findBooked(WORKSPACE);

    const clauses = bookingBuilder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => c.includes('startTime'))).toBe(true);
  });
});

describe('WorkQueuesService.findUnbookedLeads', () => {
  it('returns typeform contacts with no booking', async () => {
    const leads = [{ id: 'c1', source: 'typeform' }];
    const { service } = build({ leads });

    await expect(service.findUnbookedLeads(WORKSPACE)).resolves.toEqual({
      data: leads,
      total: 1,
      waiting: 0,
    });
  });

  // A NOT IN subquery over tens of thousands of contacts is the slow way; the
  // left join uses the existing index on bookings.contactId.
  it('excludes contacts that have a booking with a left join, not a subquery', async () => {
    const { service, contactBuilder } = build();

    await service.findUnbookedLeads(WORKSPACE);

    expect(contactBuilder.leftJoin).toHaveBeenCalled();
    const clauses = contactBuilder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => /IS NULL/i.test(c))).toBe(true);
    expect(clauses.some((c) => /NOT IN/i.test(c))).toBe(false);
  });

  // The web list showed a lead as Vândut while De sunat still queued it to
  // be rung: this endpoint judged the queue by bookings alone and knew
  // nothing about a sale. 29 leads were sitting there, several already paid.
  it('leaves out leads already won or lost', async () => {
    const { service, contactBuilder } = build();

    await service.findUnbookedLeads(WORKSPACE);

    const clauses = contactBuilder.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(clauses.some((c) => /isClosedWon/i.test(c) && /^NOT /i.test(c.trim()))).toBe(true);
    // Won from the phone writes a deal, not a stage change, so the rule has
    // to read both or every sale made on a call stays on the calling list.
    expect(clauses.some((c) => /closed_won/i.test(c))).toBe(true);
  });

  it('scopes to the workspace', async () => {
    const { service, contactBuilder } = build();

    await service.findUnbookedLeads(WORKSPACE);

    expect(contactBuilder.where).toHaveBeenCalledWith(
      expect.stringContaining('workspaceId'),
      expect.objectContaining({ workspaceId: WORKSPACE }),
    );
  });
});

describe('Queue source filter', () => {
  // De sunat now runs two queries against the same mock builder — the page
  // and the "waiting" count — so an identical filter legitimately shows up
  // twice. Which sources are asked for is still what this checks.
  const sourceParams = (builder: any) => {
    const seen = new Set<string>();
    return builder.andWhere.mock.calls
      .map((c: any[]) => c[1])
      .filter((p: any) => p && ('source' in p || 'sources' in p))
      .filter((p: any) => {
        const key = JSON.stringify(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  it('De sunat covers Typeform, WooCommerce and manual by default', async () => {
    const { service, contactBuilder } = build();
    await service.findUnbookedLeads(WORKSPACE);
    expect(sourceParams(contactBuilder)).toEqual([{ sources: ['typeform', 'woocommerce', 'manual'] }]);
  });

  it('De sunat narrows to one source', async () => {
    const { service, contactBuilder } = build();
    await service.findUnbookedLeads(WORKSPACE, 1, 50, 'woocommerce' as any);
    expect(sourceParams(contactBuilder)).toEqual([{ sources: ['woocommerce'] }]);
  });

  it('Programați filters by the contact source only when asked', async () => {
    const all = build();
    await all.service.findBooked(WORKSPACE);
    expect(sourceParams(all.bookingBuilder)).toEqual([]);

    const one = build();
    await one.service.findBooked(WORKSPACE, undefined, 'typeform' as any);
    expect(sourceParams(one.bookingBuilder)).toEqual([{ source: 'typeform' }]);
  });

  it('ignores a source the queues do not know', () => {
    expect(parseQueueSource('payflow')).toBeUndefined();
    expect(parseQueueSource(undefined)).toBeUndefined();
    expect(parseQueueSource('manual')).toBe('manual');
  });
});

describe('WorkQueuesService.attachLatestRecordings', () => {
  it('attaches the most recent recordingUrl for each contact', async () => {
    const { service } = build({
      latestRecordings: [{ contactId: 'c1', recordingurl: 'https://r2/one.mp3' }],
    });

    const rows = await service.attachLatestRecordings(WORKSPACE, [
      { id: 'c1' } as any,
      { id: 'c2' } as any,
    ]);

    expect(rows[0]).toMatchObject({ id: 'c1', recordingUrl: 'https://r2/one.mp3' });
    expect(rows[1].recordingUrl).toBeUndefined();
  });

  it('returns the rows untouched when there are none to enrich', async () => {
    const { service } = build();

    await expect(service.attachLatestRecordings(WORKSPACE, [])).resolves.toEqual([]);
  });
});
