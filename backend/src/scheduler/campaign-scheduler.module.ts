import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WhatsAppCampaign } from '../database/entities/whatsapp-campaign.entity';
import { EmailCampaign } from '../database/entities/email-campaign.entity';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import { CampaignDispatchProcessor } from './campaign-dispatch.processor';
import { CampaignDispatchModule } from './campaign-dispatch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppCampaign, EmailCampaign]),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED_TASKS }),
    WhatsAppModule,
    EmailCampaignsModule,
    CampaignDispatchModule,
  ],
  providers: [CampaignSchedulerService, CampaignDispatchProcessor],
  exports: [CampaignSchedulerService],
})
export class CampaignSchedulerModule {}
