import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { Contact } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { GoogleSheetsService } from '../integrations/google-sheets/google-sheets.service';
import { MetaConversionsService } from '../integrations/meta-conversions/meta-conversions.service';

const WORKSPACE = 'workspace-123';
const CONTACT_ID = 'contact-1';

const qb = (contact: Partial<Contact> | null) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  withDeleted: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(contact),
  getMany: jest.fn().mockResolvedValue([]),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
});

// `contacts.tags` is a TypeORM simple-array: the values are joined with a comma
// and nothing is escaped, so a tag holding a comma is stored as one tag and read
// back as two. Every write path has to split it, or the data disagrees with
// itself — and the tags people type by hand are exactly where a comma turns up.
describe('ContactsService — tags on write', () => {
  let service: ContactsService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((data: any) => ({
              ...data,
              updateLeadScore: jest.fn(),
            })),
            save: jest.fn().mockImplementation(async (entity: any) => entity),
            // The "contact was tagged, move it along the pipeline" step reaches
            // for the stage repository through the entity manager.
            manager: {
              getRepository: () => ({
                findOne: jest.fn().mockResolvedValue(null),
                find: jest.fn().mockResolvedValue([]),
                createQueryBuilder: () => qb(null),
              }),
            },
          },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Company), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Activity), useValue: {} },
        { provide: getRepositoryToken(Deal), useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationsService, useValue: { notifyLead: jest.fn().mockResolvedValue(undefined) } },
        { provide: GoogleSheetsService, useValue: { appendContact: jest.fn().mockResolvedValue(undefined) } },
        { provide: MetaConversionsService, useValue: { trackLead: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(ContactsService);
    repo = module.get(getRepositoryToken(Contact));
  });

  describe('create', () => {
    beforeEach(() => {
      // create() runs three query builders in order: the phone duplicate lookup,
      // the email duplicate lookup, then the reload of the created row.
      repo.createQueryBuilder
        .mockReturnValueOnce(qb(null))
        .mockReturnValueOnce(qb(null))
        .mockReturnValue(qb({ id: CONTACT_ID } as any));
    });

    it('splits a tag that arrived with a comma in it', async () => {
      await service.create(WORKSPACE, {
        firstName: 'Ana',
        lastName: 'Marin',
        email: 'ana.marin@example.com',
        phone: '+40722000001',
        tags: ['typeform', 'Consultatie, Bihor'],
      } as any);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['typeform', 'Consultatie', 'Bihor'] }),
      );
    });

    it('drops duplicates that differ only in case, keeping the first spelling', async () => {
      await service.create(WORKSPACE, {
        firstName: 'Ana',
        lastName: 'Marin',
        email: 'ana2@example.com',
        phone: '+40722000002',
        tags: ['VIP', 'vip'],
      } as any);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ['VIP'] }));
    });
  });

  describe('addTags', () => {
    it('splits a comma in an added tag instead of storing it whole', async () => {
      const contact = { id: CONTACT_ID, tags: ['typeform'] } as any;
      repo.createQueryBuilder.mockReturnValue(qb(contact));

      const result = await service.addTags(WORKSPACE, CONTACT_ID, ['urgent, de sunat']);

      expect(result.tags).toEqual(['typeform', 'urgent', 'de sunat']);
      expect(repo.save).toHaveBeenCalled();
    });

    it('adds nothing when the tag is already there in another case', async () => {
      const contact = { id: CONTACT_ID, tags: ['VIP'] } as any;
      repo.createQueryBuilder.mockReturnValue(qb(contact));

      const result = await service.addTags(WORKSPACE, CONTACT_ID, ['vip']);

      expect(result.tags).toEqual(['VIP']);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('removeTags', () => {
    it('removes a tag whatever case it was asked for in', async () => {
      const contact = { id: CONTACT_ID, tags: ['VIP', 'typeform'] } as any;
      repo.createQueryBuilder.mockReturnValue(qb(contact));

      const result = await service.removeTags(WORKSPACE, CONTACT_ID, ['vip']);

      expect(result.tags).toEqual(['typeform']);
    });

    it('removes both halves when asked with the comma that was typed', async () => {
      const contact = { id: CONTACT_ID, tags: ['urgent', 'de sunat', 'typeform'] } as any;
      repo.createQueryBuilder.mockReturnValue(qb(contact));

      const result = await service.removeTags(WORKSPACE, CONTACT_ID, ['urgent, de sunat']);

      expect(result.tags).toEqual(['typeform']);
    });
  });
});
