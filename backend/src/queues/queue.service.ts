import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, JobOptions } from 'bull';
import { QUEUE_NAMES, JOB_TYPES, JOB_PRIORITIES } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  // All job types below (email, data sync, analytics, ai, webhook, workflow)
  // share this one queue — job routing is by JOB_TYPES name (@Process), not
  // by which queue it's on. See QUEUE_NAMES.BACKGROUND_JOBS.
  constructor(
    @InjectQueue(QUEUE_NAMES.BACKGROUND_JOBS) private backgroundQueue: Queue,
  ) {}

  // Email queue methods
  async sendEmail(data: {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SEND_EMAIL, data, {
      priority: JOB_PRIORITIES.HIGH,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      ...options,
    });

    this.logger.log(`Email job ${job.id} added to queue`);
    return job;
  }

  async sendBulkEmail(emails: any[], options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SEND_BULK_EMAIL, { emails }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Bulk email job ${job.id} added with ${emails.length} emails`);
    return job;
  }

  async sendWelcomeEmail(email: string, name: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SEND_WELCOME_EMAIL, { email, name }, {
      priority: JOB_PRIORITIES.HIGH,
      attempts: 3,
      ...options,
    });

    this.logger.log(`Welcome email job ${job.id} added for ${email}`);
    return job;
  }

  async sendPasswordResetEmail(email: string, resetToken: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SEND_PASSWORD_RESET, { email, resetToken }, {
      priority: JOB_PRIORITIES.CRITICAL,
      attempts: 5,
      ...options,
    });

    this.logger.log(`Password reset email job ${job.id} added for ${email}`);
    return job;
  }

  // Data sync queue methods
  async syncContacts(workspaceId: string, syncType: 'full' | 'incremental' = 'incremental', options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SYNC_CONTACTS, {
      workspaceId,
      syncType,
      lastSyncedAt: new Date(),
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Contact sync job ${job.id} added for workspace ${workspaceId}`);
    return job;
  }

  async syncDeals(workspaceId: string, syncType: 'full' | 'incremental' = 'incremental', options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SYNC_DEALS, {
      workspaceId,
      syncType,
      lastSyncedAt: new Date(),
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Deal sync job ${job.id} added for workspace ${workspaceId}`);
    return job;
  }

  async syncIntegration(workspaceId: string, integrationId: string, syncType: 'full' | 'incremental' = 'incremental', options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.SYNC_INTEGRATION, {
      workspaceId,
      integrationId,
      syncType,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 3,
      ...options,
    });

    this.logger.log(`Integration sync job ${job.id} added for ${integrationId}`);
    return job;
  }

  async exportData(workspaceId: string, entityType: string, format: 'csv' | 'json' | 'xlsx', filters?: any, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.EXPORT_DATA, {
      workspaceId,
      entityType,
      format,
      filters,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      timeout: 300000, // 5 minutes
      ...options,
    });

    this.logger.log(`Export job ${job.id} added for ${entityType}`);
    return job;
  }

  async importData(workspaceId: string, entityType: string, data: any[], options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.IMPORT_DATA, {
      workspaceId,
      entityType,
      data,
    }, {
      priority: JOB_PRIORITIES.HIGH,
      attempts: 2,
      timeout: 600000, // 10 minutes
      ...options,
    });

    this.logger.log(`Import job ${job.id} added for ${entityType} with ${data.length} records`);
    return job;
  }

  async importGoogleSheets(
    workspaceId: string,
    userId: string,
    contacts: any[],
    duplicateActions: Record<string, 'skip' | 'update' | 'create'>,
    options?: JobOptions,
  ) {
    const job = await this.backgroundQueue.add(JOB_TYPES.IMPORT_GOOGLE_SHEETS, {
      workspaceId,
      userId,
      contacts,
      duplicateActions,
    }, {
      priority: JOB_PRIORITIES.HIGH,
      attempts: 2,
      timeout: 600000, // 10 minutes
      removeOnComplete: false, // Keep job so we can check status
      removeOnFail: false,
      ...options,
    });

    this.logger.log(`Google Sheets import job ${job.id} queued for workspace ${workspaceId} with ${contacts.length} contacts`);
    return job;
  }

  async getJobStatus(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp),
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    };
  }

  // Analytics queue methods
  async calculateMetrics(workspaceId: string, metricType: string, dateRange?: any, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.CALCULATE_METRICS, {
      workspaceId,
      metricType,
      dateRange,
    }, {
      priority: JOB_PRIORITIES.LOW,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Metrics calculation job ${job.id} added for ${metricType}`);
    return job;
  }

  async updateLeadScores(workspaceId: string, contactIds?: string[], options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.UPDATE_LEAD_SCORES, {
      workspaceId,
      contactIds,
    }, {
      priority: JOB_PRIORITIES.LOW,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Lead score update job ${job.id} added`);
    return job;
  }

  // AI queue methods
  async scoreContact(contactId: string, workspaceId: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.AI_LEAD_SCORE, {
      contactId,
      workspaceId,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`AI lead score job ${job.id} added for contact ${contactId}`);
    return job;
  }

  async enrichContact(contactId: string, workspaceId: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.AI_ENRICH_CONTACT, {
      contactId,
      workspaceId,
    }, {
      priority: JOB_PRIORITIES.LOW,
      attempts: 2,
      ...options,
    });

    this.logger.log(`AI enrich contact job ${job.id} added for contact ${contactId}`);
    return job;
  }

  async generateEmail(context: string, tone?: string, purpose?: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.AI_GENERATE_EMAIL, {
      context,
      tone,
      purpose,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`AI generate email job ${job.id} added`);
    return job;
  }

  async analyzeSentiment(text: string, entityId: string, entityType: 'contact' | 'deal' | 'activity', options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.AI_SENTIMENT_ANALYSIS, {
      text,
      entityId,
      entityType,
    }, {
      priority: JOB_PRIORITIES.LOW,
      attempts: 2,
      ...options,
    });

    this.logger.log(`AI sentiment analysis job ${job.id} added`);
    return job;
  }

  async processLead(contactId: string, workspaceId: string, userId: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.AI_PROCESS_LEAD, {
      contactId,
      workspaceId,
      userId,
    }, {
      priority: JOB_PRIORITIES.HIGH,
      attempts: 2,
      ...options,
    });

    this.logger.log(`AI process lead job ${job.id} added for contact ${contactId}`);
    return job;
  }

  // Webhook queue methods
  async sendWebhook(
    url: string,
    data: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      body?: any;
      timeout?: number;
    },
    options?: JobOptions
  ) {
    const job = await this.backgroundQueue.add(JOB_TYPES.WEBHOOK_SEND, {
      url,
      ...data,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      ...options,
    });

    this.logger.log(`Webhook delivery job ${job.id} added for ${url}`);
    return job;
  }

  // Workflow queue methods
  async executeWorkflow(workflowId: string, triggerData: any, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.WORKFLOW_EXECUTE, {
      workflowId,
      triggerData,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      attempts: 2,
      ...options,
    });

    this.logger.log(`Workflow execution job ${job.id} added for workflow ${workflowId}`);
    return job;
  }

  async scheduleWorkflow(workflowId: string, schedule: string, options?: JobOptions) {
    const job = await this.backgroundQueue.add(JOB_TYPES.WORKFLOW_SCHEDULED, {
      workflowId,
      schedule,
    }, {
      priority: JOB_PRIORITIES.NORMAL,
      repeat: {
        cron: schedule,
      },
      ...options,
    });

    this.logger.log(`Scheduled workflow job ${job.id} added for workflow ${workflowId}`);
    return job;
  }

  // Queue management methods
  async getJobById(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async getQueueStats(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async pauseQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.log(`Queue ${queueName} paused`);
  }

  async resumeQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.log(`Queue ${queueName} resumed`);
  }

  async cleanQueue(queueName: string, grace: number = 0, status: 'completed' | 'failed' = 'completed') {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, status);
    this.logger.log(`Queue ${queueName} cleaned (${status} jobs older than ${grace}ms)`);
  }

  private getQueue(queueName: string): Queue {
    if (queueName === QUEUE_NAMES.BACKGROUND_JOBS) {
      return this.backgroundQueue;
    }
    throw new Error(`Unknown queue: ${queueName}`);
  }
}