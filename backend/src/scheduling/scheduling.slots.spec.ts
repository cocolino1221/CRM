import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactsService } from '../contacts/contacts.service';

/**
 * The hours a lead is offered.
 *
 * A closer types their day in their own clock, in as many windows as they
 * like; the lead must see exactly those windows, cut at the closer's step.
 */
let hostRow: any = null;

describe('SchedulingService — public slots', () => {
  let service: SchedulingService;
  let rows: any[];
  let bookings: any[];
  let meetingType: any;

  beforeEach(async () => {
    hostRow = null;
    rows = [];
    bookings = [];
    meetingType = {
      id: 'mt-1',
      userId: 'closer-1',
      workspaceId: 'ws-1',
      duration: 30,
      minNoticeHours: 0,
      slotInterval: 30,
      isActive: true,
      isPublic: true,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Availability), useValue: { find: jest.fn(async () => rows) } },
        { provide: getRepositoryToken(MeetingType), useValue: { findOne: jest.fn(async () => meetingType) } },
        { provide: getRepositoryToken(Booking), useValue: { find: jest.fn(async () => bookings) } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => hostRow) } },
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  // A Monday far enough ahead that minimum notice never interferes.
  const DAY = '2030-01-07';
  const starts = async () =>
    (await service.getAvailableSlots('slug', new Date(DAY))).map((s: any) => s.startTime);

  it('reads the hours in the closer timezone, not the server one', async () => {
    rows = [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', timezone: 'Europe/Bucharest' }];

    // Bucharest is UTC+2 in January.
    expect(await starts()).toEqual(['2030-01-07T07:00:00.000Z', '2030-01-07T07:30:00.000Z']);
  });

  it('offers nothing on a day the closer blocked, and the usual hours the day after', async () => {
    rows = [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', timezone: 'UTC' }];
    hostRow = { id: 'closer-1', preferences: { blockedDays: [DAY] } };
    expect(await starts()).toEqual([]);

    hostRow = { id: 'closer-1', preferences: { blockedDays: ['2030-01-08'] } };
    expect(await starts()).toHaveLength(2);
  });

  it('offers every window of a split day, in order', async () => {
    rows = [
      { dayOfWeek: 'monday', startTime: '11:30', endTime: '12:30', timezone: 'UTC' },
      { dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', timezone: 'UTC' },
    ];

    expect(await starts()).toEqual([
      '2030-01-07T09:00:00.000Z',
      '2030-01-07T09:30:00.000Z',
      '2030-01-07T11:30:00.000Z',
      '2030-01-07T12:00:00.000Z',
    ]);
  });

  it('steps by the meeting type interval', async () => {
    rows = [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', timezone: 'UTC' }];
    meetingType.slotInterval = 15;

    expect(await starts()).toHaveLength(3); // 09:00, 09:15, 09:30
  });

  it('skips a start that overlaps a confirmed booking', async () => {
    rows = [{ dayOfWeek: 'monday', startTime: '09:00', endTime: '10:30', timezone: 'UTC' }];
    bookings = [{ startTime: new Date('2030-01-07T09:30:00Z'), endTime: new Date('2030-01-07T10:00:00Z') }];

    expect(await starts()).toEqual(['2030-01-07T09:00:00.000Z', '2030-01-07T10:00:00.000Z']);
  });

  it('converts across a DST change', () => {
    // Europe/Bucharest moves to UTC+3 on the last Sunday of March.
    expect(SchedulingService.zonedToUtc('2030-04-01', '09:00', 'Europe/Bucharest').toISOString()).toBe(
      '2030-04-01T06:00:00.000Z',
    );
  });
});
