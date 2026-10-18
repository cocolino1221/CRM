import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking } from '../database/entities/booking.entity';
import { Availability, DayOfWeek } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';

/**
 * A caller booking from the phone used to be refused only when the hour was
 * already taken. Nothing looked at whether the closer works then at all, so a
 * lead could be put down for 03:00 on a Sunday — and now that closers declare
 * their hours, and the public page respects them, the manual path was the one
 * way left to book outside them.
 */
describe('BookingsService — manual bookings respect the host’s hours', () => {
  let service: BookingsService;
  let availabilities: any[];
  let overlapCount: number;

  const WORKSPACE = 'ws-1';
  const HOST = 'closer-1';
  const booker = { id: 'caller-1', role: 'caller' } as any;

  // Monday 2026-10-19, 10:00 Bucharest = 07:00 UTC.
  const mondayMorning = new Date('2026-10-19T07:00:00.000Z');
  // Sunday 2026-10-18, 03:00 Bucharest = 00:00 UTC.
  const sundayNight = new Date('2026-10-18T00:00:00.000Z');

  const create = (startTime: Date) =>
    service.create(WORKSPACE, booker, { hostId: HOST, startTime, duration: 30 });

  beforeEach(async () => {
    availabilities = [
      {
        id: 'av-mon',
        userId: HOST,
        workspaceId: WORKSPACE,
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
        timezone: 'Europe/Bucharest',
      },
    ];
    overlapCount = 0;

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getCount: jest.fn().mockImplementation(async () => overlapCount),
            }),
            create: jest.fn().mockImplementation((b) => b),
            save: jest.fn().mockImplementation(async (b) => ({ ...b, id: 'b1' })),
            findOne: jest.fn().mockResolvedValue({ id: 'b1' }),
          },
        },
        {
          provide: getRepositoryToken(Availability),
          useValue: { find: jest.fn().mockImplementation(async () => availabilities) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: HOST, workspaceId: WORKSPACE }) },
        },
      ],
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  it('accepts an hour inside the closer’s working day', async () => {
    await expect(create(mondayMorning)).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('refuses a day the closer does not work', async () => {
    await expect(create(sundayNight)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an hour before the closer starts', async () => {
    // 06:00 Bucharest on the same Monday.
    await expect(create(new Date('2026-10-19T03:00:00.000Z'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a meeting that would run past the end of the day', async () => {
    // Starts 16:45 Bucharest, 30 minutes long, so it ends at 17:15.
    await expect(create(new Date('2026-10-19T13:45:00.000Z'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still refuses an hour that is already taken', async () => {
    overlapCount = 1;
    await expect(create(mondayMorning)).rejects.toBeInstanceOf(BadRequestException);
  });

  // Every closer had an empty week until the availability screen shipped;
  // enforcing hours nobody has set would have stopped all manual booking.
  it('allows anything when the closer has declared no hours at all', async () => {
    availabilities = [];
    await expect(create(sundayNight)).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('ignores a row the closer switched off', async () => {
    availabilities = [{ ...availabilities[0], isActive: false }];
    await expect(create(mondayMorning)).rejects.toBeInstanceOf(BadRequestException);
  });
});
