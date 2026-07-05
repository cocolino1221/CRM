import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaMessagingController } from './meta-messaging.controller';
import { MetaMessagingService } from './meta-messaging.service';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { Workspace } from '../../database/entities/workspace.entity';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Contact, Activity, Integration, User, Workspace]),
  ],
  controllers: [MetaMessagingController],
  providers: [MetaMessagingService],
  exports: [MetaMessagingService],
})
export class MetaMessagingModule {}
