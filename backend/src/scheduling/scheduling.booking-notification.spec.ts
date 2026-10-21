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
 * Booking a slot used to tell nobody: the host learned about it by looking at
 * their calendar. The person who has to take the call is the one who needs to
 * know, so the notification goes to them alone, not to the workspace.
 */
let hostRow: any = null;

describe('SchedulingService — booking notifies its host', () => {
  let service: SchedulingService;
  let create: jest.Mock;
  let createContact: jest.Mock;
  let found: any;

  const HOST = 'user-host';
  const meetingType = {
    id: 'mt1',
    userId: HOST,
    workspaceId: 'ws1',
    duration: 30,
    isActive: true,
    locationType: 'phone',
    location: null,
    name: 'Consultație',
  };

  const dto: any = {
    meetingTypeId: 'mt1',
    guestName: 'Vlad Popescu',
    guestEmail: 'vlad@example.com',
    guestPhone: '+40700000000',
    startTime: '2026-11-02T09:00:00.000Z',
  };

  beforeEach(async () => {
    create = jest.fn().mockResolvedValue(undefined);
    createContact = jest.fn().mockResolvedValue({ id: 'new-lead' });
    found = { id: 'c1' };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Availability), useValue: {} },
        {
          provide: getRepositoryToken(MeetingType),
          useValue: { findOne: jest.fn().mockResolvedValue(meetingType) },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            // No clashing booking in the slot.
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((b) => b),
            save: jest.fn().mockImplementation((b) => Promise.resolve({ ...b, id: 'b1' })),
          },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => hostRow) } },
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            createQueryBuilder: () => {
              const qb: any = { where: () => qb, andWhere: () => qb, orderBy: () => qb, getOne: async () => found };
              return qb;
            },
          },
        },
        { provide: NotificationsService, useValue: { create } },
        { provide: ContactsService, useValue: { create: createContact } },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('notifies the host, once, and nobody else', async () => {
    await service.createBooking(dto);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      'ws1',
      expect.objectContaining({ userId: HOST, type: 'meeting' }),
    );
  });

  it('names the guest so the host knows who is calling', async () => {
    await service.createBooking(dto);

    const [, payload] = create.mock.calls[0];
    expect(payload.message).toContain('Vlad Popescu');
  });

  it('links to the contact when the guest is already in the CRM', async () => {
    await service.createBooking(dto);

    const [, payload] = create.mock.calls[0];
    expect(payload.metadata).toEqual(expect.objectContaining({ contactId: 'c1', bookingId: 'b1' }));
  });

  // Someone who found the link on Instagram is not in the CRM yet: the
  // booking showed as "Contact" and the person never reached the leads list.
  it('makes a lead for a stranger who booked, on the closer of the meeting', async () => {
    found = null;
    await service.createBooking(dto);

    expect(createContact).toHaveBeenCalledWith(
      'ws1',
      expect.objectContaining({
        firstName: 'Vlad',
        lastName: 'Popescu',
        email: 'vlad@example.com',
        phone: '+40700000000',
        closerId: HOST,
      }),
    );
    const [, payload] = create.mock.calls[0];
    expect(payload.metadata).toEqual(expect.objectContaining({ contactId: 'new-lead' }));
  });

  it('does not make a second lead for someone already in the CRM', async () => {
    await service.createBooking(dto);
    expect(createContact).not.toHaveBeenCalled();
  });

  it('still books when the lead cannot be made', async () => {
    found = null;
    createContact.mockRejectedValueOnce(new Error('db down'));
    await expect(service.createBooking(dto)).resolves.toEqual(expect.objectContaining({ id: 'b1', contactId: null }));
  });

  it('still returns the booking when notifying fails', async () => {
    create.mockRejectedValueOnce(new Error('push service down'));

    await expect(service.createBooking(dto)).resolves.toEqual(
      expect.objectContaining({ id: 'b1', hostId: HOST }),
    );
  });
});
