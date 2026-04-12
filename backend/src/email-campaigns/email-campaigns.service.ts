import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaign, EmailCampaignStatus } from '../database/entities/email-campaign.entity';
import { Contact } from '../database/entities/contact.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmailCampaignsService {
  private readonly logger = new Logger(EmailCampaignsService.name);

  constructor(
    @InjectRepository(EmailCampaign)
    private readonly campaignRepo: Repository<EmailCampaign>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    private readonly emailService: EmailService,
  ) {}

  async findAll(workspaceId: string) {
    return this.campaignRepo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async findOne(workspaceId: string, id: string) {
    const campaign = await this.campaignRepo.findOne({
      where: { id, workspaceId },
      relations: ['createdBy'],
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(workspaceId: string, userId: string, dto: Partial<EmailCampaign>) {
    const status =
      dto.scheduledAt && new Date(dto.scheduledAt) > new Date()
        ? EmailCampaignStatus.SCHEDULED
        : EmailCampaignStatus.DRAFT;

    const campaign = this.campaignRepo.create({
      ...dto,
      workspaceId,
      createdById: userId,
      status,
    });
    return this.campaignRepo.save(campaign);
  }

  async update(workspaceId: string, id: string, dto: Partial<EmailCampaign>) {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === EmailCampaignStatus.SENDING || campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Cannot edit a campaign that is sending or already sent');
    }
    Object.assign(campaign, dto);
    return this.campaignRepo.save(campaign);
  }

  async remove(workspaceId: string, id: string) {
    const campaign = await this.findOne(workspaceId, id);
    await this.campaignRepo.remove(campaign);
    return { deleted: true };
  }

  async previewAudience(workspaceId: string, filters: EmailCampaign['filters']) {
    const qb = this.contactRepo.createQueryBuilder('c')
      .where('c.workspaceId = :workspaceId', { workspaceId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere("c.email IS NOT NULL AND c.email != ''")
      .andWhere("c.email NOT LIKE '%@whatsapp.placeholder.invalid'");

    this.applyFilters(qb, filters);
    const count = await qb.getCount();
    return { count };
  }

  /**
   * Schedule an existing campaign to send at a future time.
   */
  async scheduleAt(workspaceId: string, id: string, scheduledAt: Date) {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === EmailCampaignStatus.SENDING || campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Cannot reschedule a campaign that is sending or already sent');
    }
    if (new Date(scheduledAt) <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    campaign.scheduledAt = new Date(scheduledAt);
    campaign.status = EmailCampaignStatus.SCHEDULED;
    return this.campaignRepo.save(campaign);
  }

  /**
   * Fire-and-forget send: returns immediately, sends in background.
   */
  async sendAsync(workspaceId: string, id: string): Promise<{ message: string; total: number }> {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === EmailCampaignStatus.SENDING) {
      throw new BadRequestException('Campaign is already sending');
    }
    if (campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Campaign has already been sent');
    }

    const total = campaign.csvRecipients?.length
      ? campaign.csvRecipients.length
      : 0; // CRM contacts counted during send

    // Fire and forget
    setImmediate(() => {
      this.send(workspaceId, id).catch(err => {
        this.logger.error(`Email campaign ${id} async send failed: ${err.message}`);
      });
    });

    return { message: 'Campaign started. Sending in background.', total };
  }

  /**
   * Synchronous send (also called by scheduler and sendAsync).
   * Sends to csvRecipients if present, otherwise to CRM contacts matching filters.
   */
  async send(workspaceId: string, id: string) {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === EmailCampaignStatus.SENDING || campaign.status === EmailCampaignStatus.SENT) {
      throw new BadRequestException('Campaign already sent or sending');
    }
    if (!campaign.subject || (!campaign.htmlBody && !campaign.textBody)) {
      throw new BadRequestException('Campaign must have subject and body');
    }

    campaign.status = EmailCampaignStatus.SENDING;
    await this.campaignRepo.save(campaign);

    let sent = 0;
    let failed = 0;
    let totalRecipients = 0;

    if (campaign.csvRecipients?.length) {
      // ── CSV recipients path ──
      totalRecipients = campaign.csvRecipients.length;
      for (const recipient of campaign.csvRecipients) {
        if (!recipient.email) { failed++; continue; }
        const success = await this.emailService.sendEmail({
          to: recipient.email,
          subject: campaign.subject,
          html: campaign.htmlBody ? this.personalise(campaign.htmlBody, recipient) : undefined,
          text: campaign.textBody ? this.personalise(campaign.textBody, recipient) : undefined,
        });
        if (success) sent++; else failed++;
      }
    } else {
      // ── CRM contacts path ──
      const qb = this.contactRepo.createQueryBuilder('c')
        .select(['c.id', 'c.email', 'c.firstName'])
        .where('c.workspaceId = :workspaceId', { workspaceId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere("c.email IS NOT NULL AND c.email != ''")
        .andWhere("c.email NOT LIKE '%@whatsapp.placeholder.invalid'");

      this.applyFilters(qb, campaign.filters);
      const contacts = await qb.getMany();
      totalRecipients = contacts.length;

      for (const contact of contacts) {
        const success = await this.emailService.sendEmail({
          to: contact.email,
          subject: campaign.subject,
          html: campaign.htmlBody || undefined,
          text: campaign.textBody || undefined,
        });
        if (success) sent++; else failed++;
      }
    }

    campaign.status =
      failed === totalRecipients && totalRecipients > 0
        ? EmailCampaignStatus.FAILED
        : EmailCampaignStatus.SENT;
    campaign.sentAt = new Date();
    campaign.stats = { total: totalRecipients, sent, failed };
    await this.campaignRepo.save(campaign);

    return { total: totalRecipients, sent, failed };
  }

  /** Replace {{name}} placeholders with recipient data */
  private personalise(template: string, recipient: { name?: string; email: string }): string {
    return template
      .replace(/\{\{name\}\}/gi, recipient.name || '')
      .replace(/\{\{email\}\}/gi, recipient.email);
  }

  private applyFilters(qb: any, filters?: EmailCampaign['filters']) {
    if (!filters) return;
    if (filters.tags?.length) {
      qb.andWhere('c.tags && :tags', { tags: filters.tags });
    }
    if (filters.statuses?.length) {
      qb.andWhere('c.status IN (:...statuses)', { statuses: filters.statuses });
    }
    if (filters.sources?.length) {
      qb.andWhere('c.source IN (:...sources)', { sources: filters.sources });
    }
  }
}
