import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactsService } from '../contacts/contacts.service';

/**
 * The lead who will not pick an hour.
 *
 * They become a contact with no booking, which is all the De sunat queue
 * looks for, and everyone who works the phone is told. Nothing else in the
 * product marks them: the absence of a booking is the mark.
 */
describe('SchedulingService — "call me instead"', () => {
  let service: SchedulingService;
  let create: jest.Mock;
  let notify: jest.Mock;
  let team: any[];

  const WORKSPACE = 'ws-1';
  const entry = { id: 'mt-1', workspaceId: WORKSPACE, userId: 'closer-1', isActive: true, isPublic: true };

  const callback = () =>
    service.requestCallback('consultatie-ab12cd', {
      name: 'Vlad Popescu',
      phone: '0722000111',
    });

  beforeEach(async () => {
    create = jest.fn().mockResolvedValue({ id: 'c1', firstName: 'Vlad', lastName: 'Popescu', phone: '0722000111' });
    notify = jest.fn().mockResolvedValue(undefined);
    team = [{ id: 'caller-1' }, { id: 'closer-1' }];

    const moduleRef = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: getRepositoryToken(Availability), useValue: {} },
        {
          provide: getRepositoryToken(MeetingType),
          useValue: { findOne: jest.fn().mockResolvedValue(entry), find: jest.fn().mockResolvedValue([]) },
        },
        { provide: getRepositoryToken(Booking), useValue: {} },
        { provide: getRepositoryToken(User), useValue: { find: jest.fn().mockImplementation(async () => team) } },
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: NotificationsService, useValue: { create: notify } },
        { provide: ContactsService, useValue: { create, findAll: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SchedulingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a lead with no booking behind it', async () => {
    await callback();

    expect(create).toHaveBeenCalledTimes(1);
    const [, dto] = create.mock.calls[0];
    expect(dto).toEqual(expect.objectContaining({ phone: '0722000111', tags: ['callback'] }));
  });

  // The address is required by the DTO and most of these people give a number.
  it('mints an address when the lead left none', async () => {
    await callback();

    const [, dto] = create.mock.calls[0];
    expect(dto.email).toBe('callback.0722000111@booking.placeholder.invalid');
  });

  it('keeps an address the lead did give', async () => {
    await service.requestCallback('consultatie-ab12cd', {
      name: 'Vlad',
      phone: '0722000111',
      email: 'vlad@example.com',
    });

    expect(create.mock.calls[0][1].email).toBe('vlad@example.com');
  });

  it('tells everyone who works the phone, once each', async () => {
    const result = await callback();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(result.alerted).toBe(2);
    expect(notify.mock.calls[0][1]).toEqual(
      expect.objectContaining({ userId: 'caller-1', title: 'Cerere de contactare' }),
    );
  });

  it('asks only for callers and closers, not the whole workspace', async () => {
    await callback();

    const userRepo = (service as any).userRepository;
    const [{ where }] = userRepo.find.mock.calls[0];
    const roles = where.map((clause: any) => clause.role);
    expect(roles).toEqual([UserRole.CALLER, UserRole.CLOSER]);
  });

  // Asking twice is not an error; they are already in the CRM and still waiting.
  it('still alerts when the contact already exists', async () => {
    const conflict: any = new Error('exists');
    conflict.status = 409;
    create.mockRejectedValueOnce(conflict);
    (service as any).contactsService.findAll = jest
      .fn()
      .mockResolvedValue({ contacts: [{ id: 'c-existing', firstName: 'Vlad', lastName: 'Popescu' }] });

    const result = await callback();

    expect(result.contactId).toBe('c-existing');
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not lose the lead when a push fails', async () => {
    notify.mockRejectedValue(new Error('push down'));

    await expect(callback()).resolves.toEqual(expect.objectContaining({ contactId: 'c1' }));
  });
});
