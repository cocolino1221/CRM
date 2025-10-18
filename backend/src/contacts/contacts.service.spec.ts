import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { Contact, ContactStatus } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import {
  createMockRepository,
  createMockContact,
  createMockUser,
  createMockCompany,
  generateUniqueEmail,
  expectContactToMatch,
} from '../../test/utils/test-utils';

describe('ContactsService', () => {
  let service: ContactsService;
  let contactRepository: jest.Mocked<Repository<Contact>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let companyRepository: jest.Mocked<Repository<Company>>;

  const mockWorkspaceId = 'workspace-123';
  const mockUserId = 'user-123';
  const mockCompanyId = 'company-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: createMockRepository<Contact>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Company),
          useValue: createMockRepository<Company>(),
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    contactRepository = module.get(getRepositoryToken(Contact)) as jest.Mocked<Repository<Contact>>;
    userRepository = module.get(getRepositoryToken(User)) as jest.Mocked<Repository<User>>;
    companyRepository = module.get(getRepositoryToken(Company)) as jest.Mocked<Repository<Company>>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated contacts with proper filtering', async () => {
      const mockContacts = [
        createMockContact({ id: 'contact-1' }),
        createMockContact({ id: 'contact-2' }),
      ];
      const total = 25;

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockContacts, total]),
      };

      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const query: QueryContactsDto = {
        page: 1,
        limit: 20,
        search: 'jane',
        status: ContactStatus.LEAD,
      };

      const result = await service.findAll(mockWorkspaceId, query);

      expect(result).toEqual({
        contacts: mockContacts,
        total,
        page: 1,
        limit: 20,
        totalPages: 2,
      });

      expect(contactRepository.createQueryBuilder).toHaveBeenCalledWith('contact');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('contact.workspaceId = :workspaceId', { workspaceId: mockWorkspaceId });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('contact.status = :status', { status: ContactStatus.LEAD });
    });

    it('should apply search filter correctly', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const query: QueryContactsDto = { search: 'john doe' };
      await service.findAll(mockWorkspaceId, query);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(contact.firstName ILIKE :search OR contact.lastName ILIKE :search OR contact.email ILIKE :search)',
        { search: '%john doe%' }
      );
    });
  });

  describe('findOne', () => {
    it('should return a contact by id with relations', async () => {
      const mockContact = createMockContact();
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockContact),
      };

      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.findOne(mockWorkspaceId, mockContact.id, ['owner', 'company']);

      expect(result).toEqual(mockContact);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('contact.id = :id', { id: mockContact.id });
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('contact.owner', 'owner');
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('contact.company', 'company');
    });

    it('should throw NotFoundException when contact not found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await expect(service.findOne(mockWorkspaceId, 'nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createContactDto: CreateContactDto = {
      firstName: 'John',
      lastName: 'Doe',
      email: generateUniqueEmail(),
      phone: '+1234567890',
      jobTitle: 'Developer',
      ownerId: mockUserId,
      companyId: mockCompanyId,
    };

    it('should create a new contact successfully', async () => {
      const mockUser = createMockUser({ id: mockUserId });
      const mockCompany = createMockCompany({ id: mockCompanyId });
      const mockCreatedContact = createMockContact({
        ...createContactDto,
        id: 'new-contact-id',
        workspaceId: mockWorkspaceId,
      });

      contactRepository.findOne.mockResolvedValue(null); // No existing contact
      userRepository.findOne.mockResolvedValue(mockUser);
      companyRepository.findOne.mockResolvedValue(mockCompany);
      contactRepository.create.mockReturnValue(mockCreatedContact);
      contactRepository.save.mockResolvedValue(mockCreatedContact);

      // Mock findOne for returning created contact with relations
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ ...mockCreatedContact, owner: mockUser, company: mockCompany }),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.create(mockWorkspaceId, createContactDto);

      expect(contactRepository.findOne).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId, email: createContactDto.email },
      });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUserId, workspaceId: mockWorkspaceId },
      });
      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockCompanyId, workspaceId: mockWorkspaceId },
      });
      expect(contactRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createContactDto,
          workspaceId: mockWorkspaceId,
          status: ContactStatus.LEAD,
          leadScore: 0,
          emailOptIn: false,
        })
      );
      expect(contactRepository.save).toHaveBeenCalled();
      expect(result).toHaveProperty('owner', mockUser);
      expect(result).toHaveProperty('company', mockCompany);
    });

    it('should throw ConflictException when email already exists', async () => {
      const existingContact = createMockContact({ email: createContactDto.email });
      contactRepository.findOne.mockResolvedValue(existingContact);

      await expect(service.create(mockWorkspaceId, createContactDto)).rejects.toThrow(
        ConflictException
      );

      expect(contactRepository.findOne).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId, email: createContactDto.email },
      });
      expect(contactRepository.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when owner not found', async () => {
      contactRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.create(mockWorkspaceId, createContactDto)).rejects.toThrow(
        BadRequestException
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUserId, workspaceId: mockWorkspaceId },
      });
    });

    it('should throw BadRequestException when company not found', async () => {
      const mockUser = createMockUser({ id: mockUserId });
      contactRepository.findOne.mockResolvedValue(null);
      userRepository.findOne.mockResolvedValue(mockUser);
      companyRepository.findOne.mockResolvedValue(null);

      await expect(service.create(mockWorkspaceId, createContactDto)).rejects.toThrow(
        BadRequestException
      );

      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockCompanyId, workspaceId: mockWorkspaceId },
      });
    });

    it('should create contact without owner and company', async () => {
      const dtoWithoutRelations = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: generateUniqueEmail(),
      };

      const mockCreatedContact = createMockContact({
        ...dtoWithoutRelations,
        id: 'new-contact-id',
        workspaceId: mockWorkspaceId,
      });

      contactRepository.findOne.mockResolvedValue(null);
      contactRepository.create.mockReturnValue(mockCreatedContact);
      contactRepository.save.mockResolvedValue(mockCreatedContact);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockCreatedContact),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.create(mockWorkspaceId, dtoWithoutRelations);

      expect(result).toBeDefined();
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(companyRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const mockContactId = 'contact-123';
    const updateContactDto: UpdateContactDto = {
      firstName: 'Updated',
      lastName: 'Name',
      jobTitle: 'Senior Developer',
    };

    it('should update contact successfully', async () => {
      const existingContact = createMockContact({ id: mockContactId });
      const updatedContact = createMockContact({ ...existingContact, ...updateContactDto });

      // Mock findOne for initial contact fetch
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValueOnce(existingContact).mockResolvedValueOnce(updatedContact),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      contactRepository.save.mockResolvedValue(updatedContact);

      const result = await service.update(mockWorkspaceId, mockContactId, updateContactDto);

      expect(contactRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateContactDto)
      );
      expectContactToMatch(result, updateContactDto);
    });

    it('should throw NotFoundException when contact not found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await expect(service.update(mockWorkspaceId, 'nonexistent-id', updateContactDto))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const existingContact = createMockContact({ id: mockContactId });
      const anotherContact = createMockContact({ id: 'another-contact', email: 'existing@example.com' });

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingContact),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      contactRepository.findOne.mockResolvedValue(anotherContact);

      await expect(service.update(mockWorkspaceId, mockContactId, { email: 'existing@example.com' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should soft delete contact successfully', async () => {
      const mockContact = createMockContact();
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockContact),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
      contactRepository.softRemove.mockResolvedValue(mockContact);

      await service.remove(mockWorkspaceId, mockContact.id);

      expect(contactRepository.softRemove).toHaveBeenCalledWith(mockContact);
    });

    it('should throw NotFoundException when contact not found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await expect(service.remove(mockWorkspaceId, 'nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkDelete', () => {
    it('should bulk delete contacts successfully', async () => {
      const mockContacts = [
        createMockContact({ id: 'contact-1' }),
        createMockContact({ id: 'contact-2' }),
      ];
      contactRepository.find.mockResolvedValue(mockContacts);
      contactRepository.softRemove.mockResolvedValue(mockContacts as any);

      const result = await service.bulkDelete(mockWorkspaceId, ['contact-1', 'contact-2']);

      expect(result).toEqual({ deletedCount: 2 });
      expect(contactRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: mockWorkspaceId, id: expect.any(Object) },
      });
      expect(contactRepository.softRemove).toHaveBeenCalledWith(mockContacts);
    });

    it('should return zero when no contacts found', async () => {
      contactRepository.find.mockResolvedValue([]);

      const result = await service.bulkDelete(mockWorkspaceId, ['nonexistent-1', 'nonexistent-2']);

      expect(result).toEqual({ deletedCount: 0 });
      expect(contactRepository.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update contact status successfully', async () => {
      const mockContact = createMockContact({ status: ContactStatus.LEAD });
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockContact),
      };
      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const updatedContact = createMockContact({ ...mockContact, status: ContactStatus.QUALIFIED });
      contactRepository.save.mockResolvedValue(updatedContact);

      const result = await service.updateStatus(mockWorkspaceId, mockContact.id, ContactStatus.QUALIFIED);

      expect(result.status).toEqual(ContactStatus.QUALIFIED);
      expect(contactRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ContactStatus.QUALIFIED })
      );
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should bulk update contact statuses successfully', async () => {
      const mockUpdateResult = { affected: 3 };
      contactRepository.update.mockResolvedValue(mockUpdateResult as any);

      const result = await service.bulkUpdateStatus(
        mockWorkspaceId,
        ['contact-1', 'contact-2', 'contact-3'],
        ContactStatus.QUALIFIED
      );

      expect(result).toEqual({ updatedCount: 3 });
      expect(contactRepository.update).toHaveBeenCalledWith(
        { workspaceId: mockWorkspaceId, id: expect.any(Object) },
        { status: ContactStatus.QUALIFIED }
      );
    });
  });

  describe('getContactStats', () => {
    it('should return contact statistics', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(100),
        getRawMany: jest.fn().mockResolvedValue([
          { status: ContactStatus.LEAD, count: '50' },
          { status: ContactStatus.QUALIFIED, count: '30' },
        ]),
        getRawOne: jest.fn().mockResolvedValue({ average: '75.5' }),
      };

      contactRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getContactStats(mockWorkspaceId);

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('bySource');
      expect(result).toHaveProperty('averageLeadScore');
      expect(result).toHaveProperty('recentlyActive');
      expect(result.byStatus[ContactStatus.LEAD]).toEqual(50);
      expect(result.byStatus[ContactStatus.QUALIFIED]).toEqual(30);
    });
  });
});