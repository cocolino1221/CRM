import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event } from '../database/entities/event.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Integration } from '../database/entities/integration.entity';
import { ZoomIntegrationHandler } from '../integrations/handlers/zoom.handler';
import { GoogleIntegrationHandler } from '../integrations/handlers/google.handler';
import { MeetingReminderDispatchModule } from './meeting-reminder-dispatch.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, User, Contact, Deal, Integration]),
    HttpModule,
    MeetingReminderDispatchModule,
    WhatsAppModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, ZoomIntegrationHandler, GoogleIntegrationHandler],
  exports: [EventsService],
})
export class EventsModule {}
