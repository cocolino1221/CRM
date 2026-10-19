import { Deal } from '../database/entities/deal.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkQueuesService, parseQueueDate } from './work-queues.service';
import { Contact } from '../database/entities/contact.entity';
import { Booking } from '../database/entities/booking.entity';
import { Activity } from '../database/entities/activity.entity';

/**
 * Narrowing De sunat to a period.
 *
 * The queue is thousands of rows deep, so "who came in last month" is the
 * question a caller actually asks. Both ends are optional: a month gives
 * two, an open-ended custom range gives one.
 */
describe('WorkQueuesService — the De sunat period filter', () => {
  let service: WorkQueuesService;
  let clauses: string[];
  let params: Record<string, any>;

  const qb = () => {
    const builder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockImplementation((sql: string, p?: any) => {
        clauses.push(sql);
        Object.assign(params, p || {});
        return builder;
      }),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return builder;
  };

  beforeEach(async () => {
    clauses = [];
    params = {};

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkQueuesService,
        { provide: getRepositoryToken(Contact), useValue: { createQueryBuilder: qb } },
        { provide: getRepositoryToken(Booking), useValue: { createQueryBuilder: qb, find: jest.fn() } },
        { provide: getRepositoryToken(Activity), useValue: { createQueryBuilder: qb, find: jest.fn() } },
        { provide: getRepositoryToken(Deal), useValue: { createQueryBuilder: qb } },
        {
          provide: getRepositoryToken(Workspace),
          useValue: { findOne: jest.fn().mockResolvedValue({ settings: {} }) },
        },
      ],
    }).compile();

    service = moduleRef.get(WorkQueuesService);
  });

  const sql = () => clauses.join(' | ');

  it('filters on both ends of a month', async () => {
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-30T23:59:59.999Z');

    await service.findUnbookedLeads('ws-1', 1, 50, undefined, from, to);

    expect(sql()).toContain('contact.createdAt >= :createdFrom');
    expect(sql()).toContain('contact.createdAt <= :createdTo');
    expect(params.createdFrom).toBe(from);
    expect(params.createdTo).toBe(to);
  });

  it('accepts an open-ended range', async () => {
    await service.findUnbookedLeads('ws-1', 1, 50, undefined, new Date('2026-09-01'), undefined);

    expect(sql()).toContain('contact.createdAt >= :createdFrom');
    expect(sql()).not.toContain('contact.createdAt <= :createdTo');
  });

  // Without a period the queue filters on no date the caller chose. The
  // grace clause is not one of those: it is always on, and it is the reason
  // this no longer just greps for "createdAt".
  it('adds no period clause when no period is chosen', async () => {
    await service.findUnbookedLeads('ws-1');

    expect(sql()).not.toContain(':createdFrom');
    expect(sql()).not.toContain(':createdTo');
  });
});

describe('parseQueueDate', () => {
  it('reads an ISO date', () => {
    expect(parseQueueDate('2026-09-01T00:00:00.000Z')?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('treats nothing as no filter', () => {
    expect(parseQueueDate(undefined)).toBeUndefined();
    expect(parseQueueDate('')).toBeUndefined();
  });

  // Emptying the queue over a typo would look like missing data, not a bad URL.
  it('ignores a value it cannot read rather than filtering everything out', () => {
    expect(parseQueueDate('last tuesday')).toBeUndefined();
  });
});
