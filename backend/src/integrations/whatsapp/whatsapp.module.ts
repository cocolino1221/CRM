import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import { WhatsAppController } from './whatsapp.controller';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { WhatsAppCampaign } from '../../database/entities/whatsapp-campaign.entity';
import { NotificationsModule } from '../../notifications/notifications.module';
import { CampaignDispatchModule } from '../../scheduler/campaign-dispatch.module';
import { UploadModule } from '../../upload/upload.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([Contact, Activity, Integration, User, PipelineStage, WhatsAppCampaign]),
    NotificationsModule,
    CampaignDispatchModule,
    UploadModule,
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppAIService, WhatsAppCampaignsService],
  exports: [WhatsAppService, WhatsAppAIService, WhatsAppCampaignsService],
})
export class WhatsAppModule {}
