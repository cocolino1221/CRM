import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { WhatsAppCampaign, WhatsAppCampaignStatus } from '../database/entities/whatsapp-campaign.entity';
import { EmailCampaign, EmailCampaignStatus } from '../database/entities/email-campaign.entity';
import { WhatsAppCampaignsService } from '../integrations/whatsapp/whatsapp-campaigns.service';
import { CampaignDispatchService } from './campaign-dispatch.service';

// A scheduled campaign is "overdue" if its time passed but its Bull job never
// fired (e.g. Redis lost the job). Small margin avoids racing a job that is
// about to run normally.
const OVERDUE_MARGIN_MS = 2 * 60 * 1000;

/**
 * On startup: recover crashed campaigns and re-enqueue any still-SCHEDULED
 * campaigns as delayed Bull jobs. Delayed dispatch itself is event-driven via
 * CampaignDispatchService (enqueued when a campaign is scheduled) — there is no
 * polling cron, so an idle workspace generates no DB traffic and Neon can
 * autosuspend.
 */
@Injectable()
export class CampaignSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    @InjectRepository(WhatsAppCampaign)
    private readonly waRepo: Repository<WhatsAppCampaign>,
    @InjectRepository(EmailCampaign)
    private readonly emailRepo: Repository<EmailCampaign>,
    private readonly waCampaignsService: WhatsAppCampaignsService,
    private readonly dispatch: CampaignDispatchService,
  ) {}

  async onModuleInit() {
    await this.waCampaignsService.resetStuckCampaigns();
    await this.reenqueueScheduledCampaigns();
    this.logger.log('CampaignSchedulerService initialized');
  }

  /**
   * Re-enqueue delayed jobs for campaigns persisted as SCHEDULED. Covers
   * campaigns created before this deploy and survives Redis flushes. Uses a
   * deterministic jobId, so repeated startups dedupe rather than pile up.
   */
  private async reenqueueScheduledCampaigns() {
    const waScheduled = await this.waRepo.find({
      where: { status: WhatsAppCampaignStatus.SCHEDULED },
    });
    for (const c of waScheduled) {
      if (c.scheduledAt) {
        await this.dispatch.scheduleWhatsApp(c.id, c.workspaceId, c.scheduledAt);
      }
    }

    const emailScheduled = await this.emailRepo.find({
      where: { status: EmailCampaignStatus.SCHEDULED },
    });
    for (const c of emailScheduled) {
      if (c.scheduledAt) {
        await this.dispatch.scheduleEmail(c.id, c.workspaceId, c.scheduledAt);
      }
    }

    if (waScheduled.length || emailScheduled.length) {
      this.logger.log(
        `Re-enqueued ${waScheduled.length} WhatsApp + ${emailScheduled.length} email scheduled campaign(s)`,
      );
    }
  }

  /**
   * Hourly safety net. Catches scheduled campaigns whose Bull job was lost
   * (e.g. Redis flush between restarts) and re-dispatches only those that are
   * overdue AND have no pending job — so it never double-sends. Runs once an
   * hour, so it has negligible effect on Neon compute (the bill driver was a
   * per-minute cron, not an hourly one).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileOverdueCampaigns() {
    const cutoff = new Date(Date.now() - OVERDUE_MARGIN_MS);
    let recovered = 0;

    const waOverdue = await this.waRepo.find({
      where: { status: WhatsAppCampaignStatus.SCHEDULED, scheduledAt: LessThanOrEqual(cutoff) },
    });
    for (const c of waOverdue) {
      if (c.scheduledAt && !(await this.dispatch.hasPendingJob('wa', c.id))) {
        await this.dispatch.scheduleWhatsApp(c.id, c.workspaceId, c.scheduledAt);
        recovered++;
      }
    }

    const emailOverdue = await this.emailRepo.find({
      where: { status: EmailCampaignStatus.SCHEDULED, scheduledAt: LessThanOrEqual(cutoff) },
    });
    for (const c of emailOverdue) {
      if (c.scheduledAt && !(await this.dispatch.hasPendingJob('email', c.id))) {
        await this.dispatch.scheduleEmail(c.id, c.workspaceId, c.scheduledAt);
        recovered++;
      }
    }

    if (recovered) {
      this.logger.warn(`Reconcile: re-dispatched ${recovered} overdue campaign(s) with no pending job`);
    }
  }
}
