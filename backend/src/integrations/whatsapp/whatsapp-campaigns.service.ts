import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  WhatsAppCampaign,
  WhatsAppCampaignStatus,
  WaCsvRecipient,
} from '../../database/entities/whatsapp-campaign.entity';
import { WhatsAppService } from './whatsapp.service';
import { normalizePhoneE164 } from '../../common/utils/phone.util';

export interface CreateWaCampaignDto {
  name: string;
  templateName: string;
  language?: string;
  templateParams?: any[];
  csvRecipients: WaCsvRecipient[];
  scheduledAt?: string | Date | null;
}

@Injectable()
export class WhatsAppCampaignsService {
  private readonly logger = new Logger(WhatsAppCampaignsService.name);

  constructor(
    @InjectRepository(WhatsAppCampaign)
    private readonly repo: Repository<WhatsAppCampaign>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async findAll(workspaceId: string): Promise<WhatsAppCampaign[]> {
    return this.repo.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(workspaceId: string, id: string): Promise<WhatsAppCampaign> {
    const campaign = await this.repo.findOne({ where: { id, workspaceId } });
    if (!campaign) throw new NotFoundException('WhatsApp campaign not found');
    return campaign;
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateWaCampaignDto,
  ): Promise<WhatsAppCampaign> {
    if (!dto.csvRecipients?.length) {
      throw new BadRequestException('At least one recipient is required');
    }

    const status =
      dto.scheduledAt && new Date(dto.scheduledAt) > new Date()
        ? WhatsAppCampaignStatus.SCHEDULED
        : WhatsAppCampaignStatus.DRAFT;

    const campaign = this.repo.create({
      workspaceId,
      createdById: userId,
      name: dto.name,
      templateName: dto.templateName,
      language: dto.language || 'pt_BR',
      templateParams: dto.templateParams || [],
      csvRecipients: dto.csvRecipients,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      status,
      stats: {},
    });
    return this.repo.save(campaign);
  }

  async update(
    workspaceId: string,
    id: string,
    dto: Partial<Pick<CreateWaCampaignDto, 'name' | 'templateName' | 'language' | 'templateParams' | 'scheduledAt'>>,
  ): Promise<WhatsAppCampaign> {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === WhatsAppCampaignStatus.SENDING || campaign.status === WhatsAppCampaignStatus.SENT) {
      throw new BadRequestException('Cannot edit a campaign that is sending or already sent');
    }
    // Enforce 5-minute lock before scheduled send
    if (campaign.scheduledAt) {
      const msUntilSend = new Date(campaign.scheduledAt).getTime() - Date.now();
      if (msUntilSend < 5 * 60 * 1000) {
        throw new BadRequestException('Campaign is locked — less than 5 minutes before scheduled send');
      }
    }
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.templateName !== undefined) campaign.templateName = dto.templateName;
    if (dto.language !== undefined) campaign.language = dto.language;
    if (dto.templateParams !== undefined) campaign.templateParams = dto.templateParams;
    if ('scheduledAt' in dto) {
      campaign.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      campaign.status =
        campaign.scheduledAt && campaign.scheduledAt > new Date()
          ? WhatsAppCampaignStatus.SCHEDULED
          : WhatsAppCampaignStatus.DRAFT;
    }
    return this.repo.save(campaign);
  }

  async remove(workspaceId: string, id: string): Promise<{ deleted: boolean }> {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === WhatsAppCampaignStatus.SENDING) {
      throw new BadRequestException('Cannot delete a campaign that is currently sending');
    }
    await this.repo.remove(campaign);
    return { deleted: true };
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  async schedule(
    workspaceId: string,
    id: string,
    scheduledAt: Date,
  ): Promise<WhatsAppCampaign> {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === WhatsAppCampaignStatus.SENDING || campaign.status === WhatsAppCampaignStatus.SENT) {
      throw new BadRequestException('Cannot reschedule a campaign that is sending or already sent');
    }
    if (new Date(scheduledAt) <= new Date()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    campaign.scheduledAt = new Date(scheduledAt);
    campaign.status = WhatsAppCampaignStatus.SCHEDULED;
    return this.repo.save(campaign);
  }

  // ─── Execution ───────────────────────────────────────────────────────────────

  /**
   * Fire-and-forget wrapper: sets status to SENDING and calls executeCampaign
   * in the background. Returns immediately so the HTTP response is fast.
   */
  async sendNow(workspaceId: string, id: string): Promise<{ message: string; total: number }> {
    const campaign = await this.findOne(workspaceId, id);
    if (campaign.status === WhatsAppCampaignStatus.SENDING) {
      throw new BadRequestException('Campaign is already sending');
    }
    if (campaign.status === WhatsAppCampaignStatus.SENT) {
      throw new BadRequestException('Campaign has already been sent');
    }

    // Mark as sending immediately so duplicate calls are rejected
    campaign.status = WhatsAppCampaignStatus.SENDING;
    await this.repo.save(campaign);

    // Fire and forget — runs in background without blocking the HTTP response
    setImmediate(() => {
      this.executeCampaign(id, workspaceId).catch(err => {
        this.logger.error(`Campaign ${id} execution error: ${err.message}`);
      });
    });

    return {
      message: 'Campaign started. Sending in background.',
      total: campaign.csvRecipients?.length || 0,
    };
  }

  /**
   * Core execution logic. Called by sendNow() and the cron scheduler.
   * IMPORTANT: campaign must already be in SENDING status before calling this.
   */
  async executeCampaign(id: string, workspaceId: string): Promise<void> {
    let campaign: WhatsAppCampaign;
    try {
      campaign = await this.repo.findOne({ where: { id, workspaceId } });
      if (!campaign) {
        this.logger.warn(`executeCampaign: campaign ${id} not found`);
        return;
      }
      if (campaign.status === WhatsAppCampaignStatus.SENT) {
        this.logger.warn(`executeCampaign: campaign ${id} already sent, skipping`);
        return;
      }
    } catch (err) {
      this.logger.error(`executeCampaign: failed to load campaign ${id}: ${err.message}`);
      return;
    }

    const recipients: WaCsvRecipient[] = campaign.csvRecipients || [];
    let sent = 0;
    let failed = 0;

    this.logger.log(
      `Starting campaign "${campaign.name}" (${id}): ${recipients.length} recipients`,
    );

    for (const recipient of recipients) {
      const phone =
        normalizePhoneE164(recipient.phone) ||
        recipient.phone.replace(/[^0-9+]/g, '');

      if (!phone) {
        failed++;
        continue;
      }

      try {
        await this.whatsappService.sendTemplateMessageForWorkspace(
          workspaceId,
          phone,
          campaign.templateName,
          campaign.language,
          recipient.vars?.length ? recipient.vars : campaign.templateParams || [],
        );
        sent++;
      } catch (err: any) {
        this.logger.warn(
          `Campaign ${id}: failed to send to ${phone}: ${err.message}`,
        );
        failed++;
      }

      // 50 ms delay between sends to respect Meta rate limits
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    campaign.status = WhatsAppCampaignStatus.SENT;
    campaign.sentAt = new Date();
    campaign.stats = { total: recipients.length, sent, failed };
    await this.repo.save(campaign);

    this.logger.log(
      `Campaign "${campaign.name}" (${id}) done: ${sent}/${recipients.length} sent, ${failed} failed`,
    );
  }

  // ─── Scheduler support ───────────────────────────────────────────────────────

  /** Called by cron to pick up campaigns whose scheduledAt has passed */
  async findDueCampaigns(): Promise<WhatsAppCampaign[]> {
    return this.repo.find({
      where: {
        status: WhatsAppCampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
    });
  }

  /** Reset campaigns stuck in SENDING (e.g. after server restart) */
  async resetStuckCampaigns(): Promise<void> {
    const stuck = await this.repo.find({
      where: { status: WhatsAppCampaignStatus.SENDING },
    });
    for (const c of stuck) {
      c.status = WhatsAppCampaignStatus.FAILED;
      c.stats = { ...(c.stats || {}), failed: c.csvRecipients?.length || 0 };
    }
    if (stuck.length) {
      await this.repo.save(stuck);
      this.logger.warn(`Reset ${stuck.length} stuck WhatsApp campaigns to FAILED`);
    }
  }
}
