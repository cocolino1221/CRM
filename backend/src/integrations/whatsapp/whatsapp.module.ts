import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { WhatsAppController } from './whatsapp.controller';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([Contact, Activity, Integration, User]),
    NotificationsModule,
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppAIService],
  exports: [WhatsAppService, WhatsAppAIService],
})
export class WhatsAppModule {}
