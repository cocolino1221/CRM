import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Integration } from '../database/entities/integration.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { EmailModule } from '../email/email.module';
import { GoogleIntegrationHandler } from '../integrations/handlers/google.handler';
import { ZoomIntegrationHandler } from '../integrations/handlers/zoom.handler';
import { BookingMeetingsService } from './booking-meetings.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Booking } from '../database/entities/booking.entity';
import { Availability } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Availability, User, Integration, Workspace]),
    HttpModule,
    EmailModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingMeetingsService, GoogleIntegrationHandler, ZoomIntegrationHandler],
  exports: [BookingsService, BookingMeetingsService],
})
export class BookingsModule {}
