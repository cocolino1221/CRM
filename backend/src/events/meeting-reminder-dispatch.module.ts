import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { MeetingReminderDispatchService } from './meeting-reminder-dispatch.service';

/**
 * Lightweight producer module: registers the meeting-reminder queue and the
 * service used to enqueue/cancel delayed jobs. Imported by EventsModule.
 * The processor (needs WhatsAppService) lives in a separate top-level module
 * to avoid a cycle — same split as CampaignDispatchModule/WhatsAppFollowupDispatchModule.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.MEETING_REMINDER })],
  providers: [MeetingReminderDispatchService],
  exports: [MeetingReminderDispatchService],
})
export class MeetingReminderDispatchModule {}
