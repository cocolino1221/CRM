import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';
import { Notification } from '../database/entities/notification.entity';
import { DeviceToken } from '../database/entities/device-token.entity';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, DeviceToken, User])],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushNotificationService],
  // Both are exported: other modules (ActivitiesModule's reminder job,
  // SchedulingService) inject NotificationsService, which pairs the in-app
  // row with the push itself.
  exports: [NotificationsService, PushNotificationService],
})
export class NotificationsModule {}
