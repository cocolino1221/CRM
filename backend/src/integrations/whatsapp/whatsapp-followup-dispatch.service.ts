import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../../queues/queue.constants';

export interface FollowupCheckJobData {
  workspaceId: string;
  waId: string;
  flowId: string;
  armedStepId: string;
}

/**
 * Enqueues durable Bull jobs that fire if a WhatsApp contact hasn't replied
 * within a flow step's `timeoutBranch` window (minutes to 7 days). Replaces
 * in-process setTimeout (capped at 6h, lost on restart) for this purpose —
 * Redis persists the delay across Fly redeploys.
 *
 * One pending follow-up job per (flow, contact) at a time: re-arming for a
 * new step cancels-then-replaces via a deterministic jobId, same pattern as
 * CampaignDispatchService.
 */
@Injectable()
export class WhatsAppFollowupDispatchService {
  private readonly logger = new Logger(WhatsAppFollowupDispatchService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED_TASKS) private readonly queue: Queue,
  ) {}

  private jobId(flowId: string, waId: string): string {
    return `${flowId}:${waId}`;
  }

  async schedule(flowId: string, waId: string, workspaceId: string, armedStepId: string, delayMs: number): Promise<void> {
    await this.cancel(flowId, waId);
    await this.queue.add(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      { workspaceId, waId, flowId, armedStepId } as FollowupCheckJobData,
      {
        jobId: this.jobId(flowId, waId),
        delay: Math.max(0, delayMs),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Armed follow-up for ${waId} (flow ${flowId}, step ${armedStepId}) in ${Math.round(delayMs / 1000)}s`);
  }

  async cancel(flowId: string, waId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(this.jobId(flowId, waId));
      if (job) await job.remove();
    } catch (err: any) {
      this.logger.debug(`cancel followup(${flowId}:${waId}) noop: ${err?.message}`);
    }
  }
}
