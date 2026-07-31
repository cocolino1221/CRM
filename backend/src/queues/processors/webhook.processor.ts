import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface WebhookPayload {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  retries?: number;
  timeout?: number;
}

@Processor(QUEUE_NAMES.BACKGROUND_JOBS)
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly httpService: HttpService) {}

  @Process(JOB_TYPES.WEBHOOK_SEND)
  async handleWebhookSend(job: Job<WebhookPayload>) {
    this.logger.log(`Processing webhook send job ${job.id} to ${job.data.url}`);

    const {
      url,
      method = 'POST',
      headers = {},
      body,
      timeout = 10000,
    } = job.data;

    try {
      const startTime = Date.now();

      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SlackCRM-Webhook/1.0',
            ...headers,
          },
          data: body,
          timeout,
          validateStatus: (status) => status >= 200 && status < 300,
        })
      );

      const duration = Date.now() - startTime;

      this.logger.log(
        `Webhook delivered successfully to ${url} in ${duration}ms (status: ${response.status})`
      );

      return {
        success: true,
        url,
        status: response.status,
        duration,
        response: response.data,
      };
    } catch (error) {
      const errorMessage = error.response
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message;

      this.logger.error(`Webhook delivery failed to ${url}: ${errorMessage}`);

      // Determine if we should retry
      const shouldRetry = this.shouldRetryWebhook(error);

      if (shouldRetry && (job.attemptsMade < (job.opts.attempts || 3))) {
        this.logger.log(`Will retry webhook delivery to ${url}`);
        throw error; // This will trigger Bull's retry mechanism
      }

      // Return error info if we're not retrying
      return {
        success: false,
        url,
        error: errorMessage,
        attemptsMade: job.attemptsMade,
      };
    }
  }

  @Process(JOB_TYPES.WEBHOOK_RETRY)
  async handleWebhookRetry(job: Job<WebhookPayload>) {
    this.logger.log(`Processing webhook retry job ${job.id} to ${job.data.url}`);

    // Use the same handler as webhook send
    return this.handleWebhookSend(job);
  }

  /**
   * Determine if a webhook should be retried based on the error
   */
  private shouldRetryWebhook(error: any): boolean {
    // Don't retry on 4xx client errors (except 429 rate limit)
    if (error.response) {
      const status = error.response.status;

      // Retry on 429 (rate limit) and 5xx (server errors)
      if (status === 429 || status >= 500) {
        return true;
      }

      // Don't retry on other 4xx errors
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Retry on network errors, timeouts, etc.
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET') {
      return true;
    }

    // Default: retry
    return true;
  }
}
