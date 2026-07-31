import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queues/queue.constants';

export interface MeetingReminderJobData {
  workspaceId: string;
  eventId: string;
}

/**
 * Enqueues a durable Bull job that fires N hours before a calendar event's
 * start time (delay computed at schedule time, not a recurring scan). One
 * pending job per event; re-scheduling (reschedule/edit) cancels-then-
 * replaces via a deterministic jobId, same pattern as CampaignDispatchService
 * and WhatsAppFollowupDispatchService.
 */
@Injectable()
export class MeetingReminderDispatchService {
  private readonly logger = new Logger(MeetingReminderDispatchService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCHEDULED_TASKS) private readonly queue: Queue,
  ) {}

  private jobId(eventId: string): string {
    return `event:${eventId}`;
  }

  async schedule(eventId: string, workspaceId: string, sendAt: Date): Promise<void> {
    await this.cancel(eventId);
    const delay = sendAt.getTime() - Date.now();
    if (delay <= 0) {
      this.logger.log(`Meeting reminder for event ${eventId} is already in the past — not scheduling`);
      return;
    }
    await this.queue.add(
      JOB_TYPES.SEND_MEETING_REMINDER,
      { workspaceId, eventId } as MeetingReminderJobData,
      {
        jobId: this.jobId(eventId),
        delay,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Scheduled meeting reminder for event ${eventId} in ${Math.round(delay / 60000)}min`);
  }

  async cancel(eventId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(this.jobId(eventId));
      if (job) await job.remove();
    } catch (err: any) {
      this.logger.debug(`cancel meeting reminder(${eventId}) noop: ${err?.message}`);
    }
  }
}
