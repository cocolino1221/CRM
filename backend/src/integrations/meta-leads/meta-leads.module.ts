import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaLeadsController } from './meta-leads.controller';
import { MetaLeadsService } from './meta-leads.service';
import { Contact } from '../../database/entities/contact.entity';
import { Integration } from '../../database/entities/integration.entity';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { ContactsModule } from '../../contacts/contacts.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Contact, Integration, Pipeline, PipelineStage]),
    ContactsModule,
    WhatsAppModule,
    NotificationsModule,
  ],
  controllers: [MetaLeadsController],
  providers: [MetaLeadsService],
  exports: [MetaLeadsService],
})
export class MetaLeadsModule {}
