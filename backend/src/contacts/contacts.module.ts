import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { Contact } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { GoogleSheetsModule } from '../integrations/google-sheets/google-sheets.module';
import { MetaConversionsModule } from '../integrations/meta-conversions/meta-conversions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, User, Company, Activity, Deal]),
    NotificationsModule,
    GoogleSheetsModule,
    MetaConversionsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}