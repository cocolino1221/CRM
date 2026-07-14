import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { Contact, ContactSource } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateContactDto } from './dto/create-contact.dto';

// Minimal mock repository — only the methods exercised by ContactsService.create()
// for the "no phone / no tags / no explicit pipeline" happy path.
const createMockRepository = () => ({
  // Return a real Contact instance so entity methods (e.g. updateLeadScore) are available,
  // mirroring what TypeORM's repository.create() does.
  create: jest.fn().mockImplementation((entity) => Object.assign(new Contact(), entity)),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(Object.assign(entity, { id: entity.id || 'contact-1' }))),
  findOne: jest.fn(),
  find: jest.fn(),
});

describe('ContactsService — lead notification trigger', () => {
  let service: ContactsService;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'notifyLead'>>;

  const workspaceId = 'workspace-1';
  const ownerId = 'owner-1';

  beforeEach(async () => {
    notificationsService = {
      notifyLead: jest.fn().mockResolvedValue(undefined),
    } as any;

    const userRepositoryMock = createMockRepository();
    // The owner-validation branch in create() requires a truthy lookup result.
    userRepositoryMock.findOne.mockResolvedValue({ id: ownerId, workspaceId } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: getRepositoryToken(Contact), useValue: createMockRepository() },
        { provide: getRepositoryToken(User), useValue: userRepositoryMock },
        { provide: getRepositoryToken(Company), useValue: createMockRepository() },
        { provide: getRepositoryToken(Activity), useValue: createMockRepository() },
        { provide: getRepositoryToken(Deal), useValue: createMockRepository() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);

    // Bypass the real findOne (query builder) — it's exercised elsewhere; here we only
    // care about what create() does before returning.
    jest.spyOn(service, 'findOne').mockImplementation(async (_ws, id) => ({ id, ownerId } as Contact));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseDto = (source?: ContactSource): CreateContactDto =>
    ({
      firstName: 'Ana',
      lastName: 'Pop',
      email: `ana-${Math.random().toString(36).slice(2)}@example.com`,
      ownerId,
      source,
    }) as CreateContactDto;

  it('maps a Typeform source to the "typeform" notification category', async () => {
    await service.create(workspaceId, baseDto(ContactSource.TYPEFORM));

    expect(notificationsService.notifyLead).toHaveBeenCalledTimes(1);
    expect(notificationsService.notifyLead).toHaveBeenCalledWith(
      workspaceId,
      ownerId,
      'typeform',
      'New lead',
      'Ana Pop',
      expect.stringContaining('/leads/'),
    );
  });

  it('maps a social source (Facebook) to the "social" notification category', async () => {
    await service.create(workspaceId, baseDto(ContactSource.FACEBOOK));

    expect(notificationsService.notifyLead).toHaveBeenCalledWith(
      workspaceId,
      ownerId,
      'social',
      'New lead',
      'Ana Pop',
      expect.any(String),
    );
  });

  it('maps a manual/unrecognized source to the "manual" notification category', async () => {
    await service.create(workspaceId, baseDto(ContactSource.MANUAL));

    expect(notificationsService.notifyLead).toHaveBeenCalledWith(
      workspaceId,
      ownerId,
      'manual',
      'New lead',
      'Ana Pop',
      expect.any(String),
    );
  });

  it('does not notify when the contact has no owner', async () => {
    const dto = baseDto(ContactSource.TYPEFORM);
    delete (dto as any).ownerId;

    await service.create(workspaceId, dto);

    expect(notificationsService.notifyLead).not.toHaveBeenCalled();
  });
});
