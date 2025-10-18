import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Task } from '../database/entities/task.entity';
import { Company } from '../database/entities/company.entity';
import { Activity } from '../database/entities/activity.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Deal, Task, Company, Activity]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}