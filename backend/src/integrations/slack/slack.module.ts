import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';
import { Contact } from '../../database/entities/contact.entity';
import { Deal } from '../../database/entities/deal.entity';
import { Activity } from '../../database/entities/activity.entity';
import { ContactsModule } from '../../contacts/contacts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Deal, Activity]),
    forwardRef(() => ContactsModule),
  ],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}