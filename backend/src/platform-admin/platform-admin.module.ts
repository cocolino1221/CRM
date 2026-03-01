import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Activity } from '../database/entities/activity.entity';
import { Notification } from '../database/entities/notification.entity';
import { IntegrationLog } from '../database/entities/integration.entity';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, User, Contact, Activity, Notification, IntegrationLog])],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
