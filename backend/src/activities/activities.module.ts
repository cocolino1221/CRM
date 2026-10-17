import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { Activity } from '../database/entities/activity.entity';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Task } from '../database/entities/task.entity';
import { Booking } from '../database/entities/booking.entity';
import { WorkQueuesService } from './work-queues.service';

@Module({
  imports: [TypeOrmModule.forFeature([Activity, Contact, Deal, Task, Booking])],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, WorkQueuesService],
  exports: [ActivitiesService, WorkQueuesService],
})
export class ActivitiesModule {}
