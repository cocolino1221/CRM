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
 * Which colleagues the app offers as free.
 *
 * Meeting types outlive what an account is for: an admin account in this
 * workspace carries ten public ones. Offering it as a free colleague puts a
 * lead in front of someone who takes no meetings, and the booking endpoint
 * now refuses exactly that — so the hour must not be offered either.
 */
let hostRow: any = null;

describe('SchedulingService — only calendar roles are offered as hosts', () => {
  let service: SchedulingService;
  let meetingTypes: any[];

  // A Monday still ahead of the real clock: slotsForMeetingType measures
  // minimum notice against Date.now(), not against the clock passed in, so a
  // past date yields no slots at all and would make these pass for the wrong
  // reason.
  const DAY = new Date('2026-11-02T00:00:00.000Z');
  const NOW = new Date('2026-11-02T05:00:00.000Z'); // 07:00 Bucharest

  beforeEach(async () => {
    meetingTypes = [
      {
        id: 'mt-closer', userId: 'closer-1', workspaceId: 'ws-1', duration: 30,
        minNoticeHours: 0, slotInterval: 30, isActive: true, isPublic: true,
        user: { id: 'closer-1', firstName: 'Maria', lastName: 'T', role: 'closer' },
      },
      {
        id: 'mt-admin', userId: 'admin-1', workspaceId: 'ws-1', duration: 30,
        minNoticeHours: 0, slotInterval: 30, isActive: true, isPublic: true,
        user: { id: 'admin-1', firstName: 'Test', lastName: 'OAuth', role: 'admin' },
      },
    ];

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: getRepositoryToken(Availability),
          useValue: {
            find: jest.fn().mockResolvedValue([
              { dayOfWeek: 'monday', startTime: '09:00', endTime: '11:00',
                isActive: true, timezone: 'Europe/Bucharest' },
            ]),
          },
        },
        {
          provide: getRepositoryToken(MeetingType),
          useValue: { find: jest.fn().mockImplementation(async () => meetingTypes) },
        },
        { provide: getRepositoryToken(Booking), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => hostRow) } },
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  it('offers the closer and not the admin', async () => {
    const slots = await service.getTeamSlotsForWorkspace('ws-1', DAY, NOW);

    expect(slots.length).toBeGreaterThan(0);
    const hostIds = new Set(slots.flatMap((s: any) => s.hosts.map((h: any) => h.userId)));
    expect([...hostIds]).toEqual(['closer-1']);
  });

  it('offers no hour at all when the only host is an admin', async () => {
    meetingTypes = meetingTypes.filter((m) => m.userId === 'admin-1');

    await expect(service.getTeamSlotsForWorkspace('ws-1', DAY, NOW)).resolves.toEqual([]);
  });

  it('keeps offering a caller, a setter and a manager', async () => {
    for (const role of ['caller', 'setter', 'manager']) {
      meetingTypes = [{ ...meetingTypes[0], user: { ...meetingTypes[0].user, role } }];
      const slots = await service.getTeamSlotsForWorkspace('ws-1', DAY, NOW);
      expect(slots.length).toBeGreaterThan(0);
    }
  });
});
