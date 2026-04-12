import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppCampaign } from '../database/entities/whatsapp-campaign.entity';
import { EmailCampaign } from '../database/entities/email-campaign.entity';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';
import { CampaignSchedulerService } from './campaign-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppCampaign, EmailCampaign]),
    WhatsAppModule,
    EmailCampaignsModule,
  ],
  providers: [CampaignSchedulerService],
  exports: [CampaignSchedulerService],
})
export class CampaignSchedulerModule {}
