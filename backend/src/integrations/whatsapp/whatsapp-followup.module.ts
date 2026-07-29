import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../queues/queue.constants';
import { WhatsAppModule } from './whatsapp.module';
import { WhatsAppFollowupProcessor } from './whatsapp-followup.processor';

/**
 * Top-level module holding the follow-up processor (needs WhatsAppService,
 * which would create a cycle if registered inside WhatsAppModule itself —
 * same split as CampaignDispatchModule / CampaignSchedulerModule). Each
 * module side (producer in WhatsAppFollowupDispatchModule, consumer here)
 * calls registerQueue for the same name — the documented @nestjs/bull pattern
 * for splitting a queue's producer and consumer across modules.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.WHATSAPP_FOLLOWUP }),
    WhatsAppModule,
  ],
  providers: [WhatsAppFollowupProcessor],
})
export class WhatsAppFollowupModule {}
