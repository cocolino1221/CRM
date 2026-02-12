import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIAgentService } from './ai-agent.service';
import { AIController } from './ai.controller';
import { LeadScoringService } from './lead-scoring.service';
import { Contact } from '../database/entities/contact.entity';
import { Task } from '../database/entities/task.entity';
import { Deal } from '../database/entities/deal.entity';
import { Activity } from '../database/entities/activity.entity';
import { ContactsModule } from '../contacts/contacts.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Task, Deal, Activity]),
    ContactsModule,
    EmailModule,
  ],
  controllers: [AIController],
  providers: [AIAgentService, LeadScoringService],
  exports: [AIAgentService, LeadScoringService],
})
export class AIModule {}
