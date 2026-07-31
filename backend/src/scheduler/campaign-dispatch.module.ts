import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { CampaignDispatchService } from './campaign-dispatch.service';

/**
 * Lightweight producer module: registers the campaign-dispatch queue and the
 * service used to enqueue/cancel delayed jobs. Imported by the campaign
 * feature modules. Deliberately has no campaign-service dependencies so it
 * can be imported without creating a cycle.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED_TASKS })],
  providers: [CampaignDispatchService],
  exports: [CampaignDispatchService],
})
export class CampaignDispatchModule {}
