import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queues/queue.constants';

type CampaignKind = 'wa' | 'email';

/**
 * Enqueues delayed Bull jobs that fire exactly at a campaign's scheduledAt.
 * Replaces the per-minute DB-polling cron so Neon can autosuspend when idle.
 * The job carries only ids; the processor re-checks status before sending,
 * so cancel/reschedule are handled by re-enqueueing (deterministic jobId).
 */
@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED_TASKS) private readonly queue: Queue,
  ) {}

  private jobId(kind: CampaignKind, campaignId: string): string {
    return `${kind}:${campaignId}`;
  }

  async scheduleWhatsApp(campaignId: string, workspaceId: string, scheduledAt: Date | string) {
    return this.enqueue('wa', JOB_TYPES.DISPATCH_WA_CAMPAIGN, campaignId, workspaceId, scheduledAt);
  }

  async scheduleEmail(campaignId: string, workspaceId: string, scheduledAt: Date | string) {
    return this.enqueue('email', JOB_TYPES.DISPATCH_EMAIL_CAMPAIGN, campaignId, workspaceId, scheduledAt);
  }

  private async enqueue(
    kind: CampaignKind,
    jobType: string,
    campaignId: string,
    workspaceId: string,
    scheduledAt: Date | string,
  ) {
    // Drop any existing job first so reschedules don't collide on the jobId.
    await this.cancel(kind, campaignId);

    const delay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
    await this.queue.add(
      jobType,
      { campaignId, workspaceId },
      {
        jobId: this.jobId(kind, campaignId),
        delay,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Enqueued ${kind} campaign ${campaignId} (delay ${Math.round(delay / 1000)}s)`);
  }

  async cancel(kind: CampaignKind, campaignId: string) {
    try {
      const job = await this.queue.getJob(this.jobId(kind, campaignId));
      if (job) await job.remove();
    } catch (err: any) {
      // Job may already be active/processing — safe to ignore.
      this.logger.debug(`cancel(${kind}:${campaignId}) noop: ${err?.message}`);
    }
  }

  /** True if a dispatch job for this campaign is still queued/delayed/active. */
  async hasPendingJob(kind: CampaignKind, campaignId: string): Promise<boolean> {
    try {
      const job = await this.queue.getJob(this.jobId(kind, campaignId));
      // Completed/removed jobs return null (removeOnComplete), so any hit means
      // the job is still pending and will fire on its own.
      return !!job;
    } catch {
      return false;
    }
  }
}
