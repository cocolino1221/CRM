import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../../queues/queue.constants';
import { WhatsAppService } from './whatsapp.service';
import { FollowupCheckJobData } from './whatsapp-followup-dispatch.service';

@Processor(QUEUE_NAMES.SCHEDULED_TASKS)
export class WhatsAppFollowupProcessor {
  private readonly logger = new Logger(WhatsAppFollowupProcessor.name);

  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Process(JOB_TYPES.CHECK_FOLLOWUP_REPLY)
  async handle(job: Job<FollowupCheckJobData>) {
    const { workspaceId, waId, flowId, armedStepId, targetStepId } = job.data;
    try {
      await this.whatsAppService.handleFollowupTimeout(workspaceId, waId, flowId, armedStepId, targetStepId);
    } catch (err: any) {
      this.logger.warn(`Follow-up check failed for ${waId} (flow ${flowId}, step ${armedStepId}): ${err?.message}`);
    }
  }
}
