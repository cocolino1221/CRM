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
 * Who the team page may offer.
 *
 * A meeting type outlives its owner: deleting a user leaves the row behind,
 * and because TypeORM will not load a soft-deleted relation the name came
 * back empty. Found on a real page, where a departed colleague was offered
 * for booking under the label "Coleg".
 */
describe('SchedulingService — getTeamSlots only offers people who are still here', () => {
  let service: SchedulingService;
  let meetingTypes: any[];

  const WORKSPACE = 'ws-1';
  const entry = { id: 'mt-1', workspaceId: WORKSPACE, userId: 'u1', isActive: true, isPublic: true };
  const slot = { startTime: '2026-10-19T07:00:00.000Z', endTime: '2026-10-19T07:30:00.000Z', duration: 30 };

  beforeEach(async () => {
    meetingTypes = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Availability), useValue: {} },
        {
          provide: getRepositoryToken(MeetingType),
          useValue: {
            findOne: jest.fn().mockResolvedValue(entry),
            find: jest.fn().mockImplementation(async () => meetingTypes),
          },
        },
        { provide: getRepositoryToken(Booking), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
    // The slot maths has its own tests; this is about who gets listed.
    jest.spyOn(service as any, 'slotsForMeetingType').mockResolvedValue([slot]);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists everyone whose owner is still around', async () => {
    meetingTypes = [
      { id: 'a', userId: 'u1', user: { firstName: 'Ana', lastName: 'Pop' } },
      { id: 'b', userId: 'u2', user: { firstName: 'Ion', lastName: 'Rus' } },
    ];

    const [hour] = await service.getTeamSlots('s', new Date('2026-10-19'), new Date('2026-10-18T09:00:00+03:00'));

    expect(hour.hosts.map((h: any) => h.name)).toEqual(['Ana Pop', 'Ion Rus']);
  });

  it('skips a meeting type whose owner was deleted', async () => {
    meetingTypes = [
      { id: 'a', userId: 'u1', user: { firstName: 'Ana', lastName: 'Pop' } },
      // A soft-deleted user does not come back through the relation.
      { id: 'b', userId: 'u2', user: undefined },
    ];

    const [hour] = await service.getTeamSlots('s', new Date('2026-10-19'), new Date('2026-10-18T09:00:00+03:00'));

    expect(hour.hosts.map((h: any) => h.name)).toEqual(['Ana Pop']);
  });

  it('offers the hour to nobody rather than to a ghost', async () => {
    meetingTypes = [{ id: 'b', userId: 'u2', user: null }];

    await expect(service.getTeamSlots('s', new Date('2026-10-19'))).resolves.toEqual([]);
  });

  it('gathers several people onto the same hour', async () => {
    meetingTypes = [
      { id: 'a', userId: 'u1', user: { firstName: 'Ana', lastName: 'Pop' } },
      { id: 'b', userId: 'u2', user: { firstName: 'Ion', lastName: 'Rus' } },
    ];

    const hours = await service.getTeamSlots('s', new Date('2026-10-19'), new Date('2026-10-18T09:00:00+03:00'));

    expect(hours).toHaveLength(1);
    expect(hours[0].hosts).toHaveLength(2);
  });
});
