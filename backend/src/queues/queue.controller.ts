import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { QUEUE_NAMES } from './queue.constants';

@ApiTags('Queues')
@Controller('queues')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get(':queueName/stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  @ApiResponse({ status: 200, description: 'Queue statistics retrieved' })
  @Roles('admin')
  async getQueueStats(@Param('queueName') queueName: string) {
    return this.queueService.getQueueStats(queueName);
  }

  @Get(':queueName/jobs/:jobId')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job details retrieved' })
  @Roles('admin', 'user')
  async getJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.queueService.getJobById(queueName, jobId);
    if (!job) {
      return { error: 'Job not found' };
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      opts: job.opts,
      progress: job.progress(),
      returnvalue: job.returnvalue,
      stacktrace: job.stacktrace,
      timestamp: job.timestamp,
      attemptsMade: job.attemptsMade,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  }

  @Post(':queueName/pause')
  @ApiOperation({ summary: 'Pause queue processing' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  @ApiResponse({ status: 200, description: 'Queue paused' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  async pauseQueue(@Param('queueName') queueName: string) {
    await this.queueService.pauseQueue(queueName);
    return { message: `Queue ${queueName} paused` };
  }

  @Post(':queueName/resume')
  @ApiOperation({ summary: 'Resume queue processing' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  @ApiResponse({ status: 200, description: 'Queue resumed' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  async resumeQueue(@Param('queueName') queueName: string) {
    await this.queueService.resumeQueue(queueName);
    return { message: `Queue ${queueName} resumed` };
  }

  @Post(':queueName/clean')
  @ApiOperation({ summary: 'Clean completed or failed jobs from queue' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  @ApiQuery({ name: 'grace', required: false, description: 'Grace period in ms', type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['completed', 'failed'] })
  @ApiResponse({ status: 200, description: 'Queue cleaned' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  async cleanQueue(
    @Param('queueName') queueName: string,
    @Query('grace') grace?: number,
    @Query('status') status?: 'completed' | 'failed',
  ) {
    await this.queueService.cleanQueue(queueName, grace || 0, status || 'completed');
    return { message: `Queue ${queueName} cleaned` };
  }

  @Post('sync/contacts')
  @ApiOperation({ summary: 'Trigger contact sync job' })
  @ApiQuery({ name: 'syncType', required: false, enum: ['full', 'incremental'] })
  @ApiResponse({ status: 200, description: 'Sync job started' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async syncContacts(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('syncType') syncType?: 'full' | 'incremental',
  ) {
    const job = await this.queueService.syncContacts(workspaceId, syncType || 'incremental');
    return { jobId: job.id, message: 'Contact sync job started' };
  }

  @Post('sync/deals')
  @ApiOperation({ summary: 'Trigger deal sync job' })
  @ApiQuery({ name: 'syncType', required: false, enum: ['full', 'incremental'] })
  @ApiResponse({ status: 200, description: 'Sync job started' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async syncDeals(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('syncType') syncType?: 'full' | 'incremental',
  ) {
    const job = await this.queueService.syncDeals(workspaceId, syncType || 'incremental');
    return { jobId: job.id, message: 'Deal sync job started' };
  }

  @Post('analytics/metrics')
  @ApiOperation({ summary: 'Trigger metrics calculation' })
  @ApiQuery({ name: 'metricType', required: true, enum: ['deals', 'contacts', 'tasks', 'revenue', 'conversion'] })
  @ApiResponse({ status: 200, description: 'Metrics calculation job started' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async calculateMetrics(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('metricType') metricType: string,
  ) {
    const job = await this.queueService.calculateMetrics(workspaceId, metricType);
    return { jobId: job.id, message: 'Metrics calculation job started' };
  }

  @Post('analytics/lead-scores')
  @ApiOperation({ summary: 'Trigger lead score update' })
  @ApiResponse({ status: 200, description: 'Lead score update job started' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async updateLeadScores(@CurrentWorkspace('id') workspaceId: string) {
    const job = await this.queueService.updateLeadScores(workspaceId);
    return { jobId: job.id, message: 'Lead score update job started' };
  }
}