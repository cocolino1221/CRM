import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queues/queue.constants';
import { WhatsAppCampaign, WhatsAppCampaignStatus } from '../database/entities/whatsapp-campaign.entity';
import { EmailCampaign, EmailCampaignStatus } from '../database/entities/email-campaign.entity';
import { WhatsAppCampaignsService } from '../integrations/whatsapp/whatsapp-campaigns.service';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';

interface DispatchJobData {
  campaignId: string;
  workspaceId: string;
}

// Tolerance for clock skew / early firing — if the campaign is scheduled more
// than this far in the future, the job was superseded by a later reschedule.
const RESCHEDULE_TOLERANCE_MS = 30 * 1000;

@Processor(QUEUE_NAMES.SCHEDULED_TASKS)
export class CampaignDispatchProcessor {
  private readonly logger = new Logger(CampaignDispatchProcessor.name);

  constructor(
    @InjectRepository(WhatsAppCampaign)
    private readonly waRepo: Repository<WhatsAppCampaign>,
    @InjectRepository(EmailCampaign)
    private readonly emailRepo: Repository<EmailCampaign>,
    private readonly waCampaigns: WhatsAppCampaignsService,
    private readonly emailCampaigns: EmailCampaignsService,
  ) {}

  @Process(JOB_TYPES.DISPATCH_WA_CAMPAIGN)
  async dispatchWhatsApp(job: Job<DispatchJobData>) {
    const { campaignId, workspaceId } = job.data;
    const campaign = await this.waRepo.findOne({ where: { id: campaignId, workspaceId } });
    if (!campaign) {
      this.logger.warn(`WA dispatch: campaign ${campaignId} not found, skipping`);
      return;
    }
    if (campaign.status !== WhatsAppCampaignStatus.SCHEDULED) {
      this.logger.log(`WA dispatch: campaign ${campaignId} no longer SCHEDULED (${campaign.status}), skipping`);
      return;
    }
    if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now() + RESCHEDULE_TOLERANCE_MS) {
      this.logger.log(`WA dispatch: campaign ${campaignId} rescheduled later, skipping this job`);
      return;
    }

    // executeCampaign expects status to already be SENDING.
    campaign.status = WhatsAppCampaignStatus.SENDING;
    await this.waRepo.save(campaign);
    await this.waCampaigns.executeCampaign(campaignId, workspaceId);
  }

  @Process(JOB_TYPES.DISPATCH_EMAIL_CAMPAIGN)
  async dispatchEmail(job: Job<DispatchJobData>) {
    const { campaignId, workspaceId } = job.data;
    const campaign = await this.emailRepo.findOne({ where: { id: campaignId, workspaceId } });
    if (!campaign) {
      this.logger.warn(`Email dispatch: campaign ${campaignId} not found, skipping`);
      return;
    }
    if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
      this.logger.log(`Email dispatch: campaign ${campaignId} no longer SCHEDULED (${campaign.status}), skipping`);
      return;
    }
    if (campaign.scheduledAt && new Date(campaign.scheduledAt).getTime() > Date.now() + RESCHEDULE_TOLERANCE_MS) {
      this.logger.log(`Email dispatch: campaign ${campaignId} rescheduled later, skipping this job`);
      return;
    }

    // send() sets SENDING and guards against double-send itself.
    await this.emailCampaigns.send(workspaceId, campaignId);
  }
}
