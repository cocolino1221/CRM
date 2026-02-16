import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, FindOptionsWhere, ILike, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Contact, ContactStatus, ContactSource } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto, SortField } from './dto/query-contacts.dto';

export interface ContactsListResult {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(Deal)
    private dealRepository: Repository<Deal>,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(workspaceId: string, query: QueryContactsDto): Promise<ContactsListResult> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      source,
      ownerId,
      companyId,
      pipelineId,
      pipelineStageId,
      tags,
      minLeadScore,
      maxLeadScore,
      emailOptIn,
      sortBy = SortField.CREATED_AT,
      sortOrder = 'DESC',
      includeCompany,
      includeOwner,
      includeDeals,
      includeActivities,
    } = query;

    const queryBuilder = this.createBaseQuery(workspaceId);

    // Add relations
    if (includeCompany) {
      queryBuilder.leftJoinAndSelect('contact.company', 'company');
    }
    if (includeOwner) {
      queryBuilder.leftJoinAndSelect('contact.owner', 'owner');
    }
    if (includeDeals) {
      queryBuilder.leftJoinAndSelect('contact.deals', 'deals');
    }
    if (includeActivities) {
      queryBuilder
        .leftJoinAndSelect('contact.activities', 'activities')
        .addOrderBy('activities.createdAt', 'DESC');
    }

    // Always include pipeline-related relations for leads page
    queryBuilder.leftJoinAndSelect('contact.pipeline', 'pipeline');
    queryBuilder.leftJoinAndSelect('contact.pipelineStage', 'pipelineStage');

    // Always include team member relations for leads page
    queryBuilder.leftJoinAndSelect('contact.setter', 'setter');
    queryBuilder.leftJoinAndSelect('contact.caller', 'caller');
    queryBuilder.leftJoinAndSelect('contact.closer', 'closer');

    // Apply filters
    this.applyFilters(queryBuilder, {
      search,
      status,
      source,
      ownerId,
      companyId,
      pipelineId,
      pipelineStageId,
      tags,
      minLeadScore,
      maxLeadScore,
      emailOptIn,
    });

    // Apply sorting
    this.applySorting(queryBuilder, sortBy, sortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [contacts, total] = await queryBuilder.getManyAndCount();

    return {
      contacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(workspaceId: string, id: string, relations: string[] = []): Promise<Contact> {
    const queryBuilder = this.createBaseQuery(workspaceId).where('contact.id = :id', { id });

    // Add requested relations
    relations.forEach(relation => {
      queryBuilder.leftJoinAndSelect(`contact.${relation}`, relation);
    });

    const contact = await queryBuilder.getOne();

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }

    return contact;
  }

  // Sources that come from external integrations — on duplicate, skip silently instead of throwing
  private readonly externalSources = new Set<ContactSource>([
    ContactSource.TYPEFORM,
    ContactSource.WHATSAPP,
    ContactSource.SLACK,
    ContactSource.FACEBOOK,
    ContactSource.INSTAGRAM,
    ContactSource.KAJABI,
  ]);

  async create(workspaceId: string, dto: CreateContactDto): Promise<Contact> {
    const isExternal = dto.source && this.externalSources.has(dto.source);

    // Check for duplicate by email
    const existingByEmail = await this.contactRepository.findOne({
      where: { workspaceId, email: dto.email },
    });

    if (existingByEmail) {
      if (isExternal) {
        this.logger.log(`Duplicate contact (email=${dto.email}) skipped silently for source=${dto.source}`);
        return existingByEmail;
      }
      throw new ConflictException(`A contact with email "${dto.email}" already exists`);
    }

    // Check for duplicate by phone (only when phone is provided)
    if (dto.phone) {
      const existingByPhone = await this.contactRepository.findOne({
        where: { workspaceId, phone: dto.phone },
      });

      if (existingByPhone) {
        if (isExternal) {
          this.logger.log(`Duplicate contact (phone=${dto.phone}) skipped silently for source=${dto.source}`);
          return existingByPhone;
        }
        throw new ConflictException(`A contact with phone "${dto.phone}" already exists`);
      }
    }

    // Validate owner if provided
    if (dto.ownerId) {
      const owner = await this.userRepository.findOne({
        where: { id: dto.ownerId, workspaceId },
      });
      if (!owner) {
        throw new BadRequestException(`Owner with ID ${dto.ownerId} not found`);
      }
    }

    // Validate company if provided
    if (dto.companyId) {
      const company = await this.companyRepository.findOne({
        where: { id: dto.companyId, workspaceId },
      });
      if (!company) {
        throw new BadRequestException(`Company with ID ${dto.companyId} not found`);
      }
    }

    // If pipelineStageId is provided but pipelineId is not, automatically infer pipelineId from the stage
    let pipelineId = dto.pipelineId;
    let pipelineStageId = dto.pipelineStageId;
    if (pipelineStageId && !pipelineId) {
      const stage = await this.contactRepository.manager
        .getRepository('PipelineStage')
        .findOne({ where: { id: pipelineStageId, workspaceId } });

      if (stage) {
        pipelineId = (stage as any).pipelineId;
      }
    }

    // Auto-assign to default pipeline if no pipeline specified (so leads show up on Leads page)
    if (!pipelineId && !pipelineStageId) {
      try {
        const defaultPipeline = await this.contactRepository.manager
          .getRepository('Pipeline')
          .findOne({
            where: { workspaceId, isDefault: true },
            relations: ['stages'],
          });
        if (defaultPipeline) {
          pipelineId = defaultPipeline.id;
          const sortedStages = (defaultPipeline as any).stages
            ?.filter((s: any) => s)
            ?.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
          if (sortedStages?.length > 0) {
            pipelineStageId = sortedStages[0].id;
            this.logger.log(`Auto-assigned new contact to pipeline "${defaultPipeline.name}" stage "${sortedStages[0].name}"`);
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to auto-assign pipeline: ${err.message}`);
      }
    }

    // Create contact
    const contact = this.contactRepository.create({
      ...dto,
      workspaceId,
      pipelineId: pipelineId || dto.pipelineId,
      pipelineStageId: pipelineStageId || dto.pipelineStageId,
      status: dto.status || ContactStatus.LEAD,
      leadScore: dto.leadScore || 0,
      emailOptIn: dto.emailOptIn || false,
    });

    // Calculate lead score if not provided
    if (dto.leadScore === undefined) {
      contact.updateLeadScore();
    }

    const savedContact = await this.contactRepository.save(contact);

    // Emit contact.created event for workflow triggers
    this.eventEmitter.emit('contact.created', {
      contact: savedContact,
      workspaceId,
    });
    this.logger.log(`Contact created event emitted for contact ${savedContact.id}`);

    // Return contact with relations
    return this.findOne(workspaceId, savedContact.id, ['owner', 'company']);
  }

  async update(workspaceId: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    const contact = await this.findOne(workspaceId, id);

    // Check email uniqueness if email is being updated
    if (dto.email && dto.email !== contact.email) {
      const existingContact = await this.contactRepository.findOne({
        where: { workspaceId, email: dto.email },
      });
      if (existingContact && existingContact.id !== id) {
        throw new ConflictException(`Contact with email ${dto.email} already exists`);
      }
    }

    // Validate owner if provided
    if (dto.ownerId && dto.ownerId !== contact.ownerId) {
      const owner = await this.userRepository.findOne({
        where: { id: dto.ownerId, workspaceId },
      });
      if (!owner) {
        throw new BadRequestException(`Owner with ID ${dto.ownerId} not found`);
      }
    }

    // Validate company if provided
    if (dto.companyId && dto.companyId !== contact.companyId) {
      const company = await this.companyRepository.findOne({
        where: { id: dto.companyId, workspaceId },
      });
      if (!company) {
        throw new BadRequestException(`Company with ID ${dto.companyId} not found`);
      }
    }

    // Update contact
    Object.assign(contact, dto);

    // Recalculate lead score if relevant fields changed
    if (dto.email || dto.jobTitle || dto.companyId !== undefined) {
      contact.updateLeadScore();
    }

    const updatedContact = await this.contactRepository.save(contact);

    // Emit contact.updated event for workflow triggers
    this.eventEmitter.emit('contact.updated', {
      contact: updatedContact,
      workspaceId,
      changes: dto,
    });
    this.logger.log(`Contact updated event emitted for contact ${updatedContact.id}`);

    return this.findOne(workspaceId, id, ['owner', 'company']);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const contact = await this.findOne(workspaceId, id);
    await this.contactRepository.softRemove(contact);
  }

  async bulkDelete(workspaceId: string, ids: string[]): Promise<{ deletedCount: number }> {
    const contacts = await this.contactRepository.find({
      where: { workspaceId, id: In(ids) },
    });

    if (contacts.length === 0) {
      return { deletedCount: 0 };
    }

    await this.contactRepository.softRemove(contacts);
    return { deletedCount: contacts.length };
  }

  async updateStatus(workspaceId: string, id: string, status: ContactStatus): Promise<Contact> {
    const contact = await this.findOne(workspaceId, id);
    contact.status = status;
    await this.contactRepository.save(contact);
    return contact;
  }

  async bulkUpdateStatus(workspaceId: string, ids: string[], status: ContactStatus): Promise<{ updatedCount: number }> {
    const result = await this.contactRepository.update(
      { workspaceId, id: In(ids) },
      { status }
    );
    return { updatedCount: result.affected || 0 };
  }

  async getContactStats(workspaceId: string): Promise<{
    total: number;
    byStatus: Record<ContactStatus, number>;
    bySource: Record<string, number>;
    averageLeadScore: number;
    recentlyActive: number;
  }> {
    const queryBuilder = this.createBaseQuery(workspaceId);

    const [
      total,
      statusStats,
      sourceStats,
      avgLeadScore,
      recentlyActive,
    ] = await Promise.all([
      queryBuilder.getCount(),
      queryBuilder
        .select('contact.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('contact.status')
        .getRawMany(),
      queryBuilder
        .select('contact.source', 'source')
        .addSelect('COUNT(*)', 'count')
        .where('contact.source IS NOT NULL')
        .groupBy('contact.source')
        .getRawMany(),
      queryBuilder
        .select('AVG(contact.leadScore)', 'average')
        .getRawOne(),
      queryBuilder
        .where('contact.lastContactedAt > :date', { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
        .getCount(),
    ]);

    const byStatus = Object.values(ContactStatus).reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<ContactStatus, number>);

    statusStats.forEach(stat => {
      byStatus[stat.status] = parseInt(stat.count);
    });

    const bySource = sourceStats.reduce((acc, stat) => {
      acc[stat.source] = parseInt(stat.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      byStatus,
      bySource,
      averageLeadScore: parseFloat(avgLeadScore?.average || '0'),
      recentlyActive,
    };
  }

  private createBaseQuery(workspaceId: string): SelectQueryBuilder<Contact> {
    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId });
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<Contact>, filters: {
    search?: string;
    status?: ContactStatus;
    source?: string;
    ownerId?: string;
    companyId?: string;
    pipelineId?: string;
    pipelineStageId?: string;
    tags?: string[];
    minLeadScore?: number;
    maxLeadScore?: number;
    emailOptIn?: boolean;
  }): void {
    const {
      search,
      status,
      source,
      ownerId,
      companyId,
      pipelineId,
      pipelineStageId,
      tags,
      minLeadScore,
      maxLeadScore,
      emailOptIn,
    } = filters;

    if (search) {
      queryBuilder.andWhere(
        '(contact.firstName ILIKE :search OR contact.lastName ILIKE :search OR contact.email ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status) {
      queryBuilder.andWhere('contact.status = :status', { status });
    }

    if (source) {
      queryBuilder.andWhere('contact.source = :source', { source });
    }

    if (ownerId) {
      queryBuilder.andWhere('contact.ownerId = :ownerId', { ownerId });
    }

    if (companyId) {
      queryBuilder.andWhere('contact.companyId = :companyId', { companyId });
    }

    if (pipelineId) {
      queryBuilder.andWhere('contact.pipelineId = :pipelineId', { pipelineId });
    }

    if (pipelineStageId) {
      queryBuilder.andWhere('contact.pipelineStageId = :pipelineStageId', { pipelineStageId });
    }

    if (tags && tags.length > 0) {
      queryBuilder.andWhere('contact.tags && :tags', { tags });
    }

    if (minLeadScore !== undefined) {
      queryBuilder.andWhere('contact.leadScore >= :minLeadScore', { minLeadScore });
    }

    if (maxLeadScore !== undefined) {
      queryBuilder.andWhere('contact.leadScore <= :maxLeadScore', { maxLeadScore });
    }

    if (emailOptIn !== undefined) {
      queryBuilder.andWhere('contact.emailOptIn = :emailOptIn', { emailOptIn });
    }
  }

  private applySorting(queryBuilder: SelectQueryBuilder<Contact>, sortBy: SortField, sortOrder: string): void {
    const orderDirection = sortOrder.toUpperCase() as 'ASC' | 'DESC';

    switch (sortBy) {
      case SortField.FIRST_NAME:
        queryBuilder.orderBy('contact.firstName', orderDirection);
        break;
      case SortField.LAST_NAME:
        queryBuilder.orderBy('contact.lastName', orderDirection);
        break;
      case SortField.EMAIL:
        queryBuilder.orderBy('contact.email', orderDirection);
        break;
      case SortField.LEAD_SCORE:
        queryBuilder.orderBy('contact.leadScore', orderDirection);
        break;
      case SortField.LAST_CONTACTED_AT:
        queryBuilder.orderBy('contact.lastContactedAt', orderDirection);
        break;
      case SortField.UPDATED_AT:
        queryBuilder.orderBy('contact.updatedAt', orderDirection);
        break;
      default:
        queryBuilder.orderBy('contact.createdAt', orderDirection);
        break;
    }
  }

  async bulkImport(workspaceId: string, contacts: CreateContactDto[]): Promise<{
    imported: number;
    failed: number;
    errors: Array<{ email: string; error: string }>;
  }> {
    const errors: Array<{ email: string; error: string }> = [];
    const successfulContacts: Contact[] = [];

    for (const contactDto of contacts) {
      try {
        // Check if contact already exists
        const existing = await this.contactRepository.findOne({
          where: { workspaceId, email: contactDto.email },
        });

        if (existing) {
          errors.push({ email: contactDto.email, error: 'Contact already exists' });
          continue;
        }

        // Validate owner if provided
        if (contactDto.ownerId) {
          const owner = await this.userRepository.findOne({
            where: { id: contactDto.ownerId, workspaceId },
          });
          if (!owner) {
            errors.push({ email: contactDto.email, error: `Owner with ID ${contactDto.ownerId} not found` });
            continue;
          }
        }

        // Validate company if provided
        if (contactDto.companyId) {
          const company = await this.companyRepository.findOne({
            where: { id: contactDto.companyId, workspaceId },
          });
          if (!company) {
            errors.push({ email: contactDto.email, error: `Company with ID ${contactDto.companyId} not found` });
            continue;
          }
        }

        // Create contact
        const contact = this.contactRepository.create({
          ...contactDto,
          workspaceId,
          status: contactDto.status || ContactStatus.LEAD,
          leadScore: contactDto.leadScore || 0,
          emailOptIn: contactDto.emailOptIn || false,
        });

        if (contactDto.leadScore === undefined) {
          contact.updateLeadScore();
        }

        successfulContacts.push(contact);
      } catch (error) {
        errors.push({ email: contactDto.email, error: error.message || 'Unknown error' });
      }
    }

    // Save all successful contacts in batch
    if (successfulContacts.length > 0) {
      await this.contactRepository.save(successfulContacts);
    }

    this.logger.log(`Imported ${successfulContacts.length} contacts, ${errors.length} failed`);

    return {
      imported: successfulContacts.length,
      failed: errors.length,
      errors,
    };
  }

  async exportContacts(workspaceId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const contacts = await this.contactRepository.find({
      where: { workspaceId },
      relations: ['owner', 'company'],
    });

    if (format === 'csv') {
      // Convert to CSV format
      const headers = [
        'First Name', 'Last Name', 'Email', 'Phone', 'Job Title',
        'Company', 'Status', 'Source', 'Lead Score', 'Tags'
      ];

      const rows = contacts.map(contact => [
        contact.firstName,
        contact.lastName,
        contact.email,
        contact.phone || '',
        contact.jobTitle || '',
        contact.company?.name || '',
        contact.status,
        contact.source || '',
        contact.leadScore,
        contact.tags?.join('; ') || '',
      ]);

      this.logger.log(`Exported ${contacts.length} contacts as CSV`);
      return { headers, rows };
    }

    // Default JSON format
    this.logger.log(`Exported ${contacts.length} contacts as JSON`);
    return contacts;
  }

  async mergeContacts(workspaceId: string, primaryContactId: string, contactIdsToMerge: string[]): Promise<Contact> {
    // Get primary contact
    const primaryContact = await this.findOne(workspaceId, primaryContactId, ['deals', 'activities']);

    // Get contacts to merge
    const contactsToMerge = await this.contactRepository.find({
      where: { workspaceId, id: In(contactIdsToMerge) },
      relations: ['deals', 'activities'],
    });

    if (contactsToMerge.length !== contactIdsToMerge.length) {
      throw new NotFoundException('Some contacts to merge were not found');
    }

    // Merge data
    for (const contact of contactsToMerge) {
      // Merge tags
      if (contact.tags && contact.tags.length > 0) {
        primaryContact.tags = [...new Set([...(primaryContact.tags || []), ...contact.tags])];
      }

      // Keep the best lead score
      if (contact.leadScore > primaryContact.leadScore) {
        primaryContact.leadScore = contact.leadScore;
      }

      // Update lastContactedAt to most recent
      if (contact.lastContactedAt &&
          (!primaryContact.lastContactedAt || contact.lastContactedAt > primaryContact.lastContactedAt)) {
        primaryContact.lastContactedAt = contact.lastContactedAt;
      }

      // Merge custom fields
      if (contact.customFields) {
        primaryContact.customFields = {
          ...(primaryContact.customFields || {}),
          ...contact.customFields,
        };
      }

      // Fill in missing fields
      if (!primaryContact.phone && contact.phone) primaryContact.phone = contact.phone;
      if (!primaryContact.jobTitle && contact.jobTitle) primaryContact.jobTitle = contact.jobTitle;
      // Note: linkedinUrl and twitterHandle fields don't exist in Contact entity yet
      // if (!primaryContact.linkedinUrl && contact.linkedinUrl) primaryContact.linkedinUrl = contact.linkedinUrl;
      // if (!primaryContact.twitterHandle && contact.twitterHandle) primaryContact.twitterHandle = contact.twitterHandle;

      // Re-assign deals to primary contact
      if (contact.deals && contact.deals.length > 0) {
        await this.dealRepository.update(
          { contactId: contact.id },
          { contactId: primaryContactId }
        );
      }

      // Re-assign activities to primary contact
      if (contact.activities && contact.activities.length > 0) {
        await this.activityRepository.update(
          { contactId: contact.id },
          { contactId: primaryContactId }
        );
      }
    }

    // Save merged primary contact
    await this.contactRepository.save(primaryContact);

    // Soft delete merged contacts
    await this.contactRepository.softRemove(contactsToMerge);

    this.logger.log(`Merged ${contactIdsToMerge.length} contacts into ${primaryContactId}`);

    // Return updated primary contact with all relations
    return this.findOne(workspaceId, primaryContactId, ['owner', 'company', 'deals', 'activities']);
  }

  async getActivities(workspaceId: string, contactId: string): Promise<Activity[]> {
    const contact = await this.findOne(workspaceId, contactId);

    const activities = await this.activityRepository.find({
      where: { contactId: contact.id, workspaceId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    this.logger.log(`Retrieved ${activities.length} activities for contact ${contactId}`);
    return activities;
  }

  async addTags(workspaceId: string, contactId: string, tags: string[]): Promise<Contact> {
    const contact = await this.findOne(workspaceId, contactId);

    const currentTags = contact.tags || [];
    const newTags = tags.filter(tag => !currentTags.includes(tag));

    if (newTags.length > 0) {
      contact.tags = [...currentTags, ...newTags];
      await this.contactRepository.save(contact);
      this.logger.log(`Added tags ${newTags.join(', ')} to contact ${contactId}`);
    }

    return contact;
  }

  async removeTags(workspaceId: string, contactId: string, tags: string[]): Promise<Contact> {
    const contact = await this.findOne(workspaceId, contactId);

    if (contact.tags && contact.tags.length > 0) {
      contact.tags = contact.tags.filter(tag => !tags.includes(tag));
      await this.contactRepository.save(contact);
      this.logger.log(`Removed tags ${tags.join(', ')} from contact ${contactId}`);
    }

    return contact;
  }

  async getAnalyticsOverview(workspaceId: string, ownerId?: string): Promise<{
    total: number;
    byStatus: Record<ContactStatus, number>;
    bySource: Record<string, number>;
    averageLeadScore: number;
    highTicketLeads: number;
    lowTicketLeads: number;
    followUpNeeded: number;
    lostLeads: number;
    conversionRate: number;
    recentlyAdded: number;
  }> {
    // If ownerId is provided, filter by owner (employee view), otherwise show all (admin/owner view)
    const whereClause: any = { workspaceId };
    if (ownerId) {
      whereClause.ownerId = ownerId;
    }
    const contacts = await this.contactRepository.find({ where: whereClause });

    const total = contacts.length;

    // Count by status
    const byStatus = {} as Record<ContactStatus, number>;
    Object.values(ContactStatus).forEach(status => {
      byStatus[status] = contacts.filter(c => c.status === status).length;
    });

    // Count by source
    const bySource: Record<string, number> = {};
    contacts.forEach(c => {
      const source = c.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // Calculate average lead score
    const totalScore = contacts.reduce((sum, c) => sum + (c.leadScore || 0), 0);
    const averageLeadScore = total > 0 ? Math.round(totalScore / total) : 0;

    // Count by tags
    const highTicketLeads = contacts.filter(c => c.tags?.includes('high-ticket')).length;
    const lowTicketLeads = contacts.filter(c => c.tags?.includes('low-ticket')).length;
    const followUpNeeded = contacts.filter(c => c.tags?.includes('follow-up')).length;
    const lostLeads = contacts.filter(c => c.tags?.includes('lost')).length;

    // Calculate conversion rate (leads that became customers)
    const customers = byStatus[ContactStatus.CUSTOMER];
    const leads = byStatus[ContactStatus.LEAD];
    const conversionRate = leads > 0 ? Math.round((customers / (leads + customers)) * 100) : 0;

    // Count recently added (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyAdded = contacts.filter(c => c.createdAt >= sevenDaysAgo).length;

    this.logger.log(`Generated analytics overview for workspace ${workspaceId}`);

    return {
      total,
      byStatus,
      bySource,
      averageLeadScore,
      highTicketLeads,
      lowTicketLeads,
      followUpNeeded,
      lostLeads,
      conversionRate,
      recentlyAdded,
    };
  }

  async getAnalyticsByTags(workspaceId: string, ownerId?: string): Promise<Array<{
    tag: string;
    count: number;
    averageLeadScore: number;
    conversionRate: number;
  }>> {
    // If ownerId is provided, filter by owner (employee view), otherwise show all (admin/owner view)
    const whereClause: any = { workspaceId };
    if (ownerId) {
      whereClause.ownerId = ownerId;
    }
    const contacts = await this.contactRepository.find({ where: whereClause });

    // Collect all unique tags
    const tagMap = new Map<string, Contact[]>();
    contacts.forEach(contact => {
      if (contact.tags && contact.tags.length > 0) {
        contact.tags.forEach(tag => {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, []);
          }
          tagMap.get(tag)!.push(contact);
        });
      }
    });

    // Calculate metrics for each tag
    const results = Array.from(tagMap.entries()).map(([tag, tagContacts]) => {
      const count = tagContacts.length;
      const totalScore = tagContacts.reduce((sum, c) => sum + (c.leadScore || 0), 0);
      const averageLeadScore = count > 0 ? Math.round(totalScore / count) : 0;

      const customers = tagContacts.filter(c => c.status === ContactStatus.CUSTOMER).length;
      const leads = tagContacts.filter(c => c.status === ContactStatus.LEAD).length;
      const conversionRate = (leads + customers) > 0 ? Math.round((customers / (leads + customers)) * 100) : 0;

      return { tag, count, averageLeadScore, conversionRate };
    });

    // Sort by count descending
    results.sort((a, b) => b.count - a.count);

    this.logger.log(`Generated tag analytics for workspace ${workspaceId}`);
    return results;
  }

  async getConversionFunnel(workspaceId: string, ownerId?: string): Promise<{
    stages: Array<{
      stage: ContactStatus;
      count: number;
      percentage: number;
      dropoffRate: number;
    }>;
    totalEntered: number;
    totalConverted: number;
    overallConversionRate: number;
  }> {
    // If ownerId is provided, filter by owner (employee view), otherwise show all (admin/owner view)
    const whereClause: any = { workspaceId };
    if (ownerId) {
      whereClause.ownerId = ownerId;
    }
    const contacts = await this.contactRepository.find({ where: whereClause });

    const totalEntered = contacts.length;

    // Define funnel stages in order
    const funnelStages = [
      ContactStatus.LEAD,
      ContactStatus.PROSPECT,
      ContactStatus.QUALIFIED,
      ContactStatus.CUSTOMER,
    ];

    const stages = funnelStages.map((stage, index) => {
      const count = contacts.filter(c => c.status === stage).length;
      const percentage = totalEntered > 0 ? Math.round((count / totalEntered) * 100) : 0;

      // Calculate dropoff rate from previous stage
      let dropoffRate = 0;
      if (index > 0) {
        const previousStage = funnelStages[index - 1];
        const previousCount = contacts.filter(c => c.status === previousStage).length;
        dropoffRate = previousCount > 0 ? Math.round(((previousCount - count) / previousCount) * 100) : 0;
      }

      return { stage, count, percentage, dropoffRate };
    });

    const totalConverted = contacts.filter(c => c.status === ContactStatus.CUSTOMER).length;
    const overallConversionRate = totalEntered > 0 ? Math.round((totalConverted / totalEntered) * 100) : 0;

    this.logger.log(`Generated conversion funnel for workspace ${workspaceId}`);

    return {
      stages,
      totalEntered,
      totalConverted,
      overallConversionRate,
    };
  }

  /**
   * Find contacts by multiple email addresses
   * @param workspaceId The workspace ID
   * @param emails Array of email addresses to search for
   * @returns Map of email to Contact (only includes found contacts)
   */
  async findByEmails(workspaceId: string, emails: string[]): Promise<Map<string, Contact>> {
    if (!emails || emails.length === 0) {
      return new Map();
    }

    // Normalize emails to lowercase for case-insensitive matching
    const normalizedEmails = emails.map(e => e.toLowerCase());

    const contacts = await this.contactRepository.find({
      where: {
        workspaceId,
        email: In(normalizedEmails),
      },
      relations: ['owner', 'company'],
    });

    // Create a map for O(1) lookup
    const contactMap = new Map<string, Contact>();
    contacts.forEach(contact => {
      contactMap.set(contact.email.toLowerCase(), contact);
    });

    this.logger.log(`Found ${contacts.length} existing contacts out of ${emails.length} emails`);
    return contactMap;
  }

  /**
   * Bulk create contacts with efficient batch processing
   * @param workspaceId The workspace ID
   * @param contacts Array of contact data to create
   * @param options Options for handling duplicates
   * @returns Result with created, updated, and skipped counts
   */
  async bulkCreate(
    workspaceId: string,
    contacts: CreateContactDto[],
    options?: {
      skipDuplicates?: boolean;
      updateExisting?: boolean;
      batchSize?: number;
    },
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: Array<{ email: string; error: string }>;
  }> {
    const batchSize = options?.batchSize || 100;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ email: string; error: string }> = [];

    this.logger.log(`Starting bulk create of ${contacts.length} contacts in batches of ${batchSize}`);

    // Process in batches
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      try {
        // Get all emails in this batch
        const emails = batch.map(c => c.email).filter(Boolean);

        // Find existing contacts in a single query
        const existingMap = await this.findByEmails(workspaceId, emails);

        const toCreate: Contact[] = [];
        const toUpdate: Contact[] = [];

        for (const dto of batch) {
          try {
            if (!dto.email) {
              errors.push({ email: dto.email || 'unknown', error: 'Email is required' });
              skipped++;
              continue;
            }

            const existing = existingMap.get(dto.email.toLowerCase());

            if (existing) {
              if (options?.updateExisting) {
                // Update existing contact
                Object.assign(existing, {
                  ...dto,
                  workspaceId, // Ensure workspace doesn't change
                  id: existing.id, // Preserve ID
                  status: dto.status || existing.status,
                  leadScore: dto.leadScore !== undefined ? dto.leadScore : existing.leadScore,
                });
                existing.updateLeadScore();
                toUpdate.push(existing);
              } else if (options?.skipDuplicates) {
                skipped++;
              } else {
                errors.push({ email: dto.email, error: 'Contact already exists' });
                skipped++;
              }
            } else {
              // Create new contact
              const contact = this.contactRepository.create({
                ...dto,
                workspaceId,
                status: dto.status || ContactStatus.LEAD,
                leadScore: dto.leadScore || 0,
                emailOptIn: dto.emailOptIn || false,
              });
              contact.updateLeadScore();
              toCreate.push(contact);
            }
          } catch (error) {
            errors.push({ email: dto.email, error: error.message });
            skipped++;
          }
        }

        // Batch save new contacts
        if (toCreate.length > 0) {
          await this.contactRepository.save(toCreate, { chunk: 100 });
          created += toCreate.length;

          // Emit events for created contacts
          toCreate.forEach(contact => {
            this.eventEmitter.emit('contact.created', {
              contact,
              workspaceId,
            });
          });
        }

        // Batch save updated contacts
        if (toUpdate.length > 0) {
          await this.contactRepository.save(toUpdate, { chunk: 100 });
          updated += toUpdate.length;

          // Emit events for updated contacts
          toUpdate.forEach(contact => {
            this.eventEmitter.emit('contact.updated', {
              contact,
              workspaceId,
            });
          });
        }

        this.logger.log(
          `Processed batch ${i / batchSize + 1}: created=${toCreate.length}, updated=${toUpdate.length}, skipped=${batch.length - toCreate.length - toUpdate.length}`,
        );
      } catch (error) {
        this.logger.error(`Error processing batch ${i / batchSize + 1}:`, error);
        // Mark entire batch as errors
        batch.forEach(dto => {
          errors.push({ email: dto.email || 'unknown', error: error.message });
          skipped++;
        });
      }
    }

    this.logger.log(
      `Bulk create completed: created=${created}, updated=${updated}, skipped=${skipped}, errors=${errors.length}`,
    );

    return { created, updated, skipped, errors };
  }

  /**
   * One-time migration: assign all contacts without a pipeline to the default pipeline's first stage.
   */
  async assignOrphansToPipeline(workspaceId: string): Promise<{ updated: number }> {
    const defaultPipeline = await this.contactRepository.manager
      .getRepository('Pipeline')
      .findOne({
        where: { workspaceId, isDefault: true },
        relations: ['stages'],
      });

    if (!defaultPipeline) {
      this.logger.warn('No default pipeline found for workspace');
      return { updated: 0 };
    }

    const sortedStages = (defaultPipeline as any).stages
      ?.filter((s: any) => s)
      ?.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));

    if (!sortedStages?.length) {
      this.logger.warn('Default pipeline has no stages');
      return { updated: 0 };
    }

    const firstStageId = sortedStages[0].id;

    const result = await this.contactRepository
      .createQueryBuilder()
      .update(Contact)
      .set({
        pipelineId: defaultPipeline.id,
        pipelineStageId: firstStageId,
      })
      .where('workspaceId = :workspaceId', { workspaceId })
      .andWhere('pipelineId IS NULL')
      .execute();

    this.logger.log(`Assigned ${result.affected} orphan contacts to pipeline "${defaultPipeline.name}" stage "${sortedStages[0].name}"`);
    return { updated: result.affected || 0 };
  }
}