import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { WhatsAppCampaign, WhatsAppCampaignStatus } from '../database/entities/whatsapp-campaign.entity';
import { EmailCampaign, EmailCampaignStatus } from '../database/entities/email-campaign.entity';
import { WhatsAppCampaignsService } from '../integrations/whatsapp/whatsapp-campaigns.service';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';

@Injectable()
export class CampaignSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    @InjectRepository(WhatsAppCampaign)
    private readonly waRepo: Repository<WhatsAppCampaign>,
    @InjectRepository(EmailCampaign)
    private readonly emailRepo: Repository<EmailCampaign>,
    private readonly waCampaignsService: WhatsAppCampaignsService,
    private readonly emailCampaignsService: EmailCampaignsService,
  ) {}

  /** On startup: reset any campaigns stuck in SENDING from a previous crash */
  async onModuleInit() {
    await this.waCampaignsService.resetStuckCampaigns();
    this.logger.log('CampaignSchedulerService initialized');
  }

  /** Runs every minute — picks up scheduled campaigns whose time has come */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchScheduledCampaigns() {
    const now = new Date();
    await Promise.all([
      this.dispatchWhatsAppCampaigns(now),
      this.dispatchEmailCampaigns(now),
    ]);
  }

  private async dispatchWhatsAppCampaigns(now: Date) {
    const dueCampaigns = await this.waRepo.find({
      where: {
        status: WhatsAppCampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    if (!dueCampaigns.length) return;
    this.logger.log(`Dispatching ${dueCampaigns.length} scheduled WhatsApp campaign(s)`);

    for (const campaign of dueCampaigns) {
      // Mark SENDING before fire-and-forget to prevent double-dispatch
      campaign.status = WhatsAppCampaignStatus.SENDING;
      await this.waRepo.save(campaign);

      setImmediate(() => {
        this.waCampaignsService
          .executeCampaign(campaign.id, campaign.workspaceId)
          .catch(err =>
            this.logger.error(`Scheduled WA campaign ${campaign.id} failed: ${err.message}`),
          );
      });
    }
  }

  private async dispatchEmailCampaigns(now: Date) {
    const dueCampaigns = await this.emailRepo.find({
      where: {
        status: EmailCampaignStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    if (!dueCampaigns.length) return;
    this.logger.log(`Dispatching ${dueCampaigns.length} scheduled Email campaign(s)`);

    for (const campaign of dueCampaigns) {
      // send() handles its own SENDING status guard
      setImmediate(() => {
        this.emailCampaignsService
          .send(campaign.workspaceId, campaign.id)
          .catch(err =>
            this.logger.error(`Scheduled email campaign ${campaign.id} failed: ${err.message}`),
          );
      });
    }
  }
}
