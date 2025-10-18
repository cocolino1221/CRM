import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactStatus } from '../database/entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import {
  createMockContact,
  createMockUser,
  createMockAuthContext,
  generateUniqueEmail,
} from '../../test/utils/test-utils';

describe('ContactsController', () => {
  let controller: ContactsController;
  let contactsService: jest.Mocked<ContactsService>;

  const mockWorkspaceId = 'workspace-123';
  const mockAuthContext = createMockAuthContext();

  beforeEach(async () => {
    const mockContactsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      updateStatus: jest.fn(),
      bulkDelete: jest.fn(),
      bulkUpdateStatus: jest.fn(),
      getContactStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
      ],
    }).compile();

    controller = module.get<ContactsController>(ContactsController);
    contactsService = module.get(ContactsService) as jest.Mocked<ContactsService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated contacts', async () => {
      const mockContacts = [
        createMockContact({ id: 'contact-1' }),
        createMockContact({ id: 'contact-2' }),
      ];

      const mockResult = {
        contacts: mockContacts,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      contactsService.findAll.mockResolvedValue(mockResult);

      const query: QueryContactsDto = {
        page: 1,
        limit: 20,
        search: 'test',
      };

      const result = await controller.findAll(mockWorkspaceId, query);

      expect(result).toEqual(mockResult);
      expect(contactsService.findAll).toHaveBeenCalledWith(mockWorkspaceId, query);
    });

    it('should handle empty query parameters', async () => {
      const mockResult = {
        contacts: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };

      contactsService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(mockWorkspaceId, {});

      expect(result).toEqual(mockResult);
      expect(contactsService.findAll).toHaveBeenCalledWith(mockWorkspaceId, {});
    });
  });

  describe('getStats', () => {
    it('should return contact statistics', async () => {
      const mockStats = {
        total: 100,
        byStatus: {
          [ContactStatus.LEAD]: 50,
          [ContactStatus.QUALIFIED]: 30,
          [ContactStatus.CUSTOMER]: 20,
          [ContactStatus.PROSPECT]: 0,
          [ContactStatus.INACTIVE]: 0,
          [ContactStatus.CHURNED]: 0,
        },
        bySource: {
          website: 40,
          referral: 30,
          social_media: 30,
        },
        averageLeadScore: 75.5,
        recentlyActive: 25,
      };

      contactsService.getContactStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(mockWorkspaceId);

      expect(result).toEqual(mockStats);
      expect(contactsService.getContactStats).toHaveBeenCalledWith(mockWorkspaceId);
    });
  });

  describe('findOne', () => {
    it('should return contact by id without relations', async () => {
      const mockContact = createMockContact();
      contactsService.findOne.mockResolvedValue(mockContact);

      const result = await controller.findOne(mockWorkspaceId, mockContact.id);

      expect(result).toEqual(mockContact);
      expect(contactsService.findOne).toHaveBeenCalledWith(mockWorkspaceId, mockContact.id, []);
    });

    it('should return contact by id with relations', async () => {
      const mockContact = createMockContact();
      contactsService.findOne.mockResolvedValue(mockContact);

      const result = await controller.findOne(mockWorkspaceId, mockContact.id, 'company,owner');

      expect(result).toEqual(mockContact);
      expect(contactsService.findOne).toHaveBeenCalledWith(mockWorkspaceId, mockContact.id, ['company', 'owner']);
    });

    it('should filter invalid relations', async () => {
      const mockContact = createMockContact();
      contactsService.findOne.mockResolvedValue(mockContact);

      const result = await controller.findOne(mockWorkspaceId, mockContact.id, 'company,invalid,owner');

      expect(result).toEqual(mockContact);
      expect(contactsService.findOne).toHaveBeenCalledWith(mockWorkspaceId, mockContact.id, ['company', 'owner']);
    });

    it('should throw NotFoundException when contact not found', async () => {
      contactsService.findOne.mockRejectedValue(new NotFoundException('Contact not found'));

      await expect(controller.findOne(mockWorkspaceId, 'nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new contact successfully', async () => {
      const createContactDto: CreateContactDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: generateUniqueEmail(),
        phone: '+1234567890',
        jobTitle: 'Developer',
      };

      const mockCreatedContact = createMockContact({
        ...createContactDto,
        id: 'new-contact-id',
      });

      contactsService.create.mockResolvedValue(mockCreatedContact);

      const result = await controller.create(mockWorkspaceId, createContactDto);

      expect(result).toEqual(mockCreatedContact);
      expect(contactsService.create).toHaveBeenCalledWith(mockWorkspaceId, createContactDto);
    });

    it('should handle validation errors', async () => {
      const invalidDto = {
        firstName: '',
        lastName: '',
        email: 'invalid-email',
      } as CreateContactDto;

      // This would be caught by ValidationPipe before reaching the controller
      // but we test the service integration
      contactsService.create.mockRejectedValue(new BadRequestException('Validation failed'));

      await expect(controller.create(mockWorkspaceId, invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update contact successfully', async () => {
      const contactId = 'contact-123';
      const updateContactDto: UpdateContactDto = {
        firstName: 'Updated',
        lastName: 'Name',
        jobTitle: 'Senior Developer',
      };

      const mockUpdatedContact = createMockContact({
        id: contactId,
        ...updateContactDto,
      });

      contactsService.update.mockResolvedValue(mockUpdatedContact);

      const result = await controller.update(mockWorkspaceId, contactId, updateContactDto);

      expect(result).toEqual(mockUpdatedContact);
      expect(contactsService.update).toHaveBeenCalledWith(mockWorkspaceId, contactId, updateContactDto);
    });

    it('should throw NotFoundException when contact not found', async () => {
      contactsService.update.mockRejectedValue(new NotFoundException('Contact not found'));

      await expect(
        controller.update(mockWorkspaceId, 'nonexistent-id', { firstName: 'Test' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove contact successfully', async () => {
      const contactId = 'contact-123';
      contactsService.remove.mockResolvedValue(undefined);

      await controller.remove(mockWorkspaceId, contactId);

      expect(contactsService.remove).toHaveBeenCalledWith(mockWorkspaceId, contactId);
    });

    it('should throw NotFoundException when contact not found', async () => {
      contactsService.remove.mockRejectedValue(new NotFoundException('Contact not found'));

      await expect(controller.remove(mockWorkspaceId, 'nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update contact status successfully', async () => {
      const contactId = 'contact-123';
      const newStatus = ContactStatus.QUALIFIED;
      const mockUpdatedContact = createMockContact({
        id: contactId,
        status: newStatus,
      });

      contactsService.updateStatus.mockResolvedValue(mockUpdatedContact);

      const result = await controller.updateStatus(mockWorkspaceId, contactId, newStatus);

      expect(result).toEqual(mockUpdatedContact);
      expect(contactsService.updateStatus).toHaveBeenCalledWith(mockWorkspaceId, contactId, newStatus);
    });

    it('should throw BadRequestException for invalid status', async () => {
      const contactId = 'contact-123';
      const invalidStatus = 'invalid-status' as ContactStatus;

      await expect(
        controller.updateStatus(mockWorkspaceId, contactId, invalidStatus)
      ).rejects.toThrow(BadRequestException);

      expect(contactsService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('should bulk delete contacts successfully', async () => {
      const ids = ['contact-1', 'contact-2', 'contact-3'];
      const mockResult = { deletedCount: 3 };

      contactsService.bulkDelete.mockResolvedValue(mockResult);

      const result = await controller.bulkDelete(mockWorkspaceId, ids);

      expect(result).toEqual(mockResult);
      expect(contactsService.bulkDelete).toHaveBeenCalledWith(mockWorkspaceId, ids);
    });

    it('should throw BadRequestException for empty ids array', async () => {
      await expect(controller.bulkDelete(mockWorkspaceId, [])).rejects.toThrow(BadRequestException);

      expect(contactsService.bulkDelete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for undefined ids', async () => {
      await expect(controller.bulkDelete(mockWorkspaceId, undefined as any)).rejects.toThrow(BadRequestException);

      expect(contactsService.bulkDelete).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should bulk update contact statuses successfully', async () => {
      const ids = ['contact-1', 'contact-2'];
      const newStatus = ContactStatus.QUALIFIED;
      const mockResult = { updatedCount: 2 };

      contactsService.bulkUpdateStatus.mockResolvedValue(mockResult);

      const result = await controller.bulkUpdateStatus(mockWorkspaceId, ids, newStatus);

      expect(result).toEqual(mockResult);
      expect(contactsService.bulkUpdateStatus).toHaveBeenCalledWith(mockWorkspaceId, ids, newStatus);
    });

    it('should throw BadRequestException for empty ids array', async () => {
      await expect(
        controller.bulkUpdateStatus(mockWorkspaceId, [], ContactStatus.QUALIFIED)
      ).rejects.toThrow(BadRequestException);

      expect(contactsService.bulkUpdateStatus).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid status', async () => {
      const ids = ['contact-1', 'contact-2'];
      const invalidStatus = 'invalid-status' as ContactStatus;

      await expect(
        controller.bulkUpdateStatus(mockWorkspaceId, ids, invalidStatus)
      ).rejects.toThrow(BadRequestException);

      expect(contactsService.bulkUpdateStatus).not.toHaveBeenCalled();
    });
  });
});