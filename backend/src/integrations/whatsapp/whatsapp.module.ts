import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppCallingController } from './whatsapp-calling.controller';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { WhatsAppCampaign } from '../../database/entities/whatsapp-campaign.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CampaignDispatchModule } from '../../scheduler/campaign-dispatch.module';
import { UploadModule } from '../../upload/upload.module';
import { WhatsAppFollowupDispatchModule } from './whatsapp-followup-dispatch.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([Contact, Activity, Integration, User, PipelineStage, WhatsAppCampaign]),
    NotificationsModule,
    CampaignDispatchModule,
    UploadModule,
    WhatsAppFollowupDispatchModule,
  ],
  controllers: [WhatsAppController, WhatsAppCallingController],
  providers: [WhatsAppService, WhatsAppAIService, WhatsAppCampaignsService, WhatsAppCallingService],
  exports: [WhatsAppService, WhatsAppAIService, WhatsAppCampaignsService, WhatsAppCallingService],
})
export class WhatsAppModule {}
