import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { Contact } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';
import { Deal } from '../database/entities/deal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, User, Company, Activity, Deal]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}