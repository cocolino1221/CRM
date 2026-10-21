import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { Booking } from '../database/entities/booking.entity';
import { Availability } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';

/**
 * Only someone who works the calendar may be put in it.
 *
 * A super_admin test account held a real lead's appointment at 03:00: any
 * user could be named as host, and a host with no declared hours accepts any
 * hour. The role check is what stops an account that never takes meetings
 * from collecting them.
 */
describe('BookingsService — the host must work the calendar', () => {
  let service: BookingsService;
  let host: any;

  const WORKSPACE = 'ws-1';
  const admin = { id: 'admin-1', role: 'admin' } as any;
  // Monday 2026-10-19, 10:00 Bucharest.
  const monday = new Date('2026-10-19T07:00:00.000Z');

  beforeEach(async () => {
    host = { id: 'host-1', workspaceId: WORKSPACE, role: 'closer' };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getCount: jest.fn().mockResolvedValue(0),
            }),
            create: jest.fn().mockImplementation((b) => b),
            save: jest.fn().mockImplementation(async (b) => ({ ...b, id: 'b1' })),
            findOne: jest.fn().mockResolvedValue({ id: 'b1' }),
          },
        },
        {
          provide: getRepositoryToken(Availability),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockImplementation(async () => host) },
        },
      ],
    }).compile();

    service = moduleRef.get(BookingsService);
  });

  const book = (startTime: Date | string = monday) =>
    service.create(WORKSPACE, admin, { hostId: 'host-1', startTime: startTime as any, duration: 30 });

  it('books a closer', async () => {
    await expect(book()).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('books a caller and a setter too', async () => {
    for (const role of ['caller', 'setter']) {
      host = { ...host, role };
      await expect(book()).resolves.toEqual(expect.objectContaining({ id: 'b1' }));
    }
  });

  it('refuses a host who only administers the workspace', async () => {
    host = { ...host, role: 'super_admin' };
    await expect(book()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an admin host even when an admin is doing the booking', async () => {
    host = { ...host, role: 'admin' };
    await expect(book()).rejects.toMatchObject({
      message: expect.stringContaining('calendar'),
    });
  });

  it('refuses a start time with no hour in it, which would land at midnight UTC', async () => {
    await expect(book('2026-10-24')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still accepts a start time that carries an hour', async () => {
    await expect(book('2026-10-24T15:30:00.000Z')).resolves.toEqual(
      expect.objectContaining({ id: 'b1' }),
    );
  });
});
