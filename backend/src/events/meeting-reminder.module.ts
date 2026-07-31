import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { Event } from '../database/entities/event.entity';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { MeetingReminderProcessor } from './meeting-reminder.processor';

/**
 * Top-level module holding the meeting-reminder processor (needs
 * WhatsAppService — importing WhatsAppModule directly inside EventsModule
 * would cycle back through this queue's producer side, so it's split out,
 * same pattern as WhatsAppFollowupModule / CampaignSchedulerModule).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED_TASKS }),
    TypeOrmModule.forFeature([Event]),
    WhatsAppModule,
  ],
  providers: [MeetingReminderProcessor],
})
export class MeetingReminderModule {}
