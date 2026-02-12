import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { WorkflowsService } from '../../workflows/workflows.service';

@Processor(QUEUE_NAMES.WORKFLOW)
export class WorkflowProcessor {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(private readonly workflowsService: WorkflowsService) {}

  @Process(JOB_TYPES.WORKFLOW_EXECUTE)
  async handleWorkflowExecution(job: Job<{
    workflowId: string;
    triggerData: any;
  }>) {
    this.logger.log(`Processing workflow execution job ${job.id} for workflow ${job.data.workflowId}`);

    try {
      const execution = await this.workflowsService.execute(
        job.data.workflowId,
        job.data.triggerData,
      );

      this.logger.log(
        `Workflow ${job.data.workflowId} executed with status: ${execution.status}`
      );

      return {
        success: execution.status === 'success' || execution.status === 'partial',
        workflowId: job.data.workflowId,
        executionId: execution.id,
        status: execution.status,
        duration: execution.durationMs,
        results: execution.results,
        errors: execution.errors,
      };
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${error.message}`);
      throw error;
    }
  }

  @Process(JOB_TYPES.WORKFLOW_SCHEDULED)
  async handleScheduledWorkflow(job: Job<{
    workflowId: string;
    schedule: string; // cron expression
  }>) {
    this.logger.log(`Processing scheduled workflow job ${job.id} for workflow ${job.data.workflowId}`);

    try {
      // Execute the workflow with empty trigger data (scheduled workflows don't have trigger data)
      const execution = await this.workflowsService.execute(
        job.data.workflowId,
        { scheduledAt: new Date(), schedule: job.data.schedule },
      );

      this.logger.log(
        `Scheduled workflow ${job.data.workflowId} executed with status: ${execution.status}`
      );

      return {
        success: execution.status === 'success' || execution.status === 'partial',
        workflowId: job.data.workflowId,
        executionId: execution.id,
        status: execution.status,
        scheduledTime: new Date(),
      };
    } catch (error) {
      this.logger.error(`Scheduled workflow execution failed: ${error.message}`);
      throw error;
    }
  }
}
