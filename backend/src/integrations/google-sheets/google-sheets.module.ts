import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { GoogleIntegrationHandler } from '../handlers/google.handler';
import { GoogleSheetsService } from './google-sheets.service';
import { GoogleSheetsController } from './google-sheets.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, Contact, PipelineStage]), HttpModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsService, GoogleIntegrationHandler],
  exports: [GoogleSheetsService],
})
export class GoogleSheetsModule {}
