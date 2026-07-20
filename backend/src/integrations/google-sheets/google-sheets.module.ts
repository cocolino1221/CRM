import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { Document } from '../../database/entities/document.entity';
import { GoogleIntegrationHandler } from '../handlers/google.handler';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleDriveBackupService } from './google-drive-backup.service';
import { GoogleSheetsController } from './google-sheets.controller';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, Contact, PipelineStage, Document]), HttpModule, NotificationsModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsService, GoogleDriveBackupService, GoogleIntegrationHandler],
  exports: [GoogleSheetsService, GoogleDriveBackupService],
})
export class GoogleSheetsModule {}
