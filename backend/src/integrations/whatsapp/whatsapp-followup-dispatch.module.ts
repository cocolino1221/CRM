import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../queues/queue.constants';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';

/**
 * Lightweight producer module: registers the follow-up queue and the service
 * used to enqueue/cancel delayed jobs. Imported by WhatsAppModule. Deliberately
 * has no WhatsAppService dependency so it can be imported without a cycle —
 * the actual processor (which needs WhatsAppService) lives in a separate
 * top-level module (WhatsAppFollowupModule), same split as campaign-dispatch.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.WHATSAPP_FOLLOWUP })],
  providers: [WhatsAppFollowupDispatchService],
  exports: [WhatsAppFollowupDispatchService],
})
export class WhatsAppFollowupDispatchModule {}
