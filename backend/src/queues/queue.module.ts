import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { EmailProcessor } from './processors/email.processor';
import { DataSyncProcessor } from './processors/data-sync.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { AIProcessor } from './processors/ai.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { WorkflowProcessor } from './processors/workflow.processor';
import { QUEUE_NAMES } from './queue.constants';
import { AIModule } from '../ai/ai.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.BACKGROUND_JOBS }),
    HttpModule,
    AIModule,
    WorkflowsModule,
    ContactsModule,
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
    EmailProcessor,
    DataSyncProcessor,
    AnalyticsProcessor,
    AIProcessor,
    WebhookProcessor,
    WorkflowProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}