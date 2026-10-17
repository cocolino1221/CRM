import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Booking a slot used to tell nobody: the host learned about it by looking at
 * their calendar. The person who has to take the call is the one who needs to
 * know, so the notification goes to them alone, not to the workspace.
 */
describe('SchedulingService — booking notifies its host', () => {
  let service: SchedulingService;
  let create: jest.Mock;

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
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(Contact),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'c1' }) },
        },
        { provide: NotificationsService, useValue: { create } },
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

  it('still returns the booking when notifying fails', async () => {
    create.mockRejectedValueOnce(new Error('push service down'));

    await expect(service.createBooking(dto)).resolves.toEqual(
      expect.objectContaining({ id: 'b1', hostId: HOST }),
    );
  });
});
