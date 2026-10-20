import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { Availability } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { BookingBrandingService } from './booking-branding.service';
import { BookingFormService } from './booking-form.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactsModule } from '../contacts/contacts.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Availability,
      MeetingType,
      Booking,
      User,
      Contact,
      Workspace,
    ]),
    NotificationsModule,
    ContactsModule,
    BookingsModule,
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService, BookingBrandingService, BookingFormService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
