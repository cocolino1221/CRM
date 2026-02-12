import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowTemplatesService } from './workflow-templates.service';
import { Workflow, WorkflowExecution } from '../database/entities/workflow.entity';
import { ContactsModule } from '../contacts/contacts.module';
import { EmailModule } from '../email/email.module';
import { TasksModule } from '../tasks/tasks.module';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowExecution]),
    ContactsModule,
    EmailModule,
    TasksModule,
    DealsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowTemplatesService],
  exports: [WorkflowsService, WorkflowTemplatesService],
})
export class WorkflowsModule {}
