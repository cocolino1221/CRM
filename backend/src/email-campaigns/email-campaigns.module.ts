import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailCampaign } from '../database/entities/email-campaign.entity';
import { Contact } from '../database/entities/contact.entity';
import { EmailModule } from '../email/email.module';
import { EmailCampaignsController } from './email-campaigns.controller';
import { EmailCampaignsService } from './email-campaigns.service';
import { CampaignDispatchModule } from '../scheduler/campaign-dispatch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailCampaign, Contact]),
    EmailModule,
    CampaignDispatchModule,
  ],
  controllers: [EmailCampaignsController],
  providers: [EmailCampaignsService],
  exports: [EmailCampaignsService],
})
export class EmailCampaignsModule {}
