import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { EmailProcessor } from './processors/email.processor';
import { DataSyncProcessor } from './processors/data-sync.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { QUEUE_NAMES } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.DATA_SYNC },
      { name: QUEUE_NAMES.ANALYTICS },
    ),
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
    EmailProcessor,
    DataSyncProcessor,
    AnalyticsProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}