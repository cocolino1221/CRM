import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { canManageBooking } from './booking-permissions';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { Availability, DayOfWeek } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';

describe('canManageBooking', () => {
  const booking = { hostId: 'closer-1' };

  it('lets the closer manage their own booking', () => {
    expect(canManageBooking({ id: 'closer-1', role: 'closer' }, booking)).toBe(true);
  });

  // The rule the team asked for: a closer's day is the closer's.
  it('refuses another closer, a setter and a caller', () => {
    expect(canManageBooking({ id: 'closer-2', role: 'closer' }, booking)).toBe(false);
    expect(canManageBooking({ id: 'setter-1', role: 'setter' }, booking)).toBe(false);
    expect(canManageBooking({ id: 'caller-1', role: 'caller' }, booking)).toBe(false);
  });

  it('lets whoever runs the team fix a mistake', () => {
    for (const role of ['admin', 'manager', 'super_admin']) {
      expect(canManageBooking({ id: 'boss', role }, booking)).toBe(true);
    }
  });

  it('refuses nobody-in-particular', () => {
    expect(canManageBooking(null, booking)).toBe(false);
    expect(canManageBooking({ id: 'closer-1', role: 'closer' }, { hostId: null })).toBe(false);
  });
});

describe('BookingsService — moving and cancelling', () => {
  let service: BookingsService;
  let stored: any;
  let overlapCount: number;
  let excluded: string | undefined;
  let saved: any[];

  const WORKSPACE = 'ws-1';
  const closer = { id: 'closer-1', role: 'closer' };
  const other = { id: 'closer-2', role: 'closer' };

  // Mondays 2030-01-07: 10:00 / 11:00 Bucharest = 08:00 / 09:00 UTC.
  const MONDAY_10 = '2030-01-07T08:00:00.000Z';
  const MONDAY_11 = '2030-01-07T09:00:00.000Z';

  beforeEach(async () => {
    stored = {
      id: 'b1',
      workspaceId: WORKSPACE,
      hostId: 'closer-1',
      startTime: new Date(MONDAY_10),
      endTime: new Date('2030-01-07T08:45:00.000Z'),
      duration: 45,
      status: BookingStatus.CONFIRMED,
    };
    overlapCount = 0;
    excluded = undefined;
    saved = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            createQueryBuilder: () => {
              const qb: any = {
                where: () => qb,
                andWhere: (_sql: string, p?: any) => {
                  if (p && 'excludeId' in p) excluded = p.excludeId;
                  return qb;
                },
                getCount: async () => overlapCount,
              };
              return qb;
            },
            // A host who was deleted loads as host: null, the way TypeORM does it.
            findOne: jest.fn(async ({ relations }: any = {}) =>
              relations?.includes('host') ? { ...stored, host: stored.hostDeleted ? null : { id: stored.hostId } } : stored,
            ),
            save: jest.fn(async (b) => (saved.push({ ...b }), b)),
          },
        },
        {
          provide: getRepositoryToken(Availability),
          useValue: {
            find: jest.fn(async () => [
              {
                userId: 'closer-1',
                workspaceId: WORKSPACE,
                dayOfWeek: DayOfWeek.MONDAY,
                startTime: '09:00',
                endTime: '17:00',
                isActive: true,
                timezone: 'Europe/Bucharest',
              },
            ]),
          },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async ({ where }) => where.id === 'closer-1' ? closer : where.id === 'boss' ? { id: 'boss', role: 'admin' } : other) } },
      ],
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  it('moves the booking, keeping its length, and does not collide with itself', async () => {
    await service.reschedule(WORKSPACE, 'b1', closer, MONDAY_11);
    expect(saved[0].startTime.toISOString()).toBe(MONDAY_11);
    expect(saved[0].endTime.toISOString()).toBe('2030-01-07T09:45:00.000Z');
    expect(excluded).toBe('b1');
  });

  it('refuses another closer', async () => {
    await expect(service.reschedule(WORKSPACE, 'b1', other, MONDAY_11)).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved).toHaveLength(0);
  });

  it('refuses an hour that is taken, outside the hours, or in the past', async () => {
    overlapCount = 1;
    await expect(service.reschedule(WORKSPACE, 'b1', closer, MONDAY_11)).rejects.toBeInstanceOf(BadRequestException);
    overlapCount = 0;
    // 20:00 Bucharest, after the closer's day ends.
    await expect(service.reschedule(WORKSPACE, 'b1', closer, '2030-01-07T18:00:00.000Z')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reschedule(WORKSPACE, 'b1', closer, '2020-01-06T08:00:00.000Z')).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it('does not move a cancelled booking back to life', async () => {
    stored.status = BookingStatus.CANCELLED;
    await expect(service.reschedule(WORKSPACE, 'b1', closer, MONDAY_11)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets only its closer cancel it', async () => {
    await expect(service.cancel(WORKSPACE, 'b1', 'closer-2', 'x')).rejects.toBeInstanceOf(ForbiddenException);
    const result = await service.cancel(WORKSPACE, 'b1', 'closer-1', 'Lead-ul a cerut');
    expect(result.status).toBe(BookingStatus.CANCELLED);
  });

  // Saving a booking whose host relation loaded as null wrote hostId = NULL
  // and Postgres refused it: an admin could not cancel a deleted closer's booking.
  it('cancels a booking whose closer was deleted', async () => {
    stored.hostDeleted = true;
    await service.cancel(WORKSPACE, 'b1', 'boss', 'Closerul a plecat');
    const written = saved[saved.length - 1];
    expect(written.status).toBe(BookingStatus.CANCELLED);
    expect(written.hostId).toBe('closer-1');
    expect(written.host).not.toBeNull();
  });

  it('lets only its closer change its status', async () => {
    await expect(service.updateStatus(WORKSPACE, 'b1', BookingStatus.COMPLETED, other)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
