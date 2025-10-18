import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Integration, IntegrationWebhook } from '../../database/entities/integration.entity';
import { IntegrationRegistry } from '../registry/integration.registry';

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: Date;
  source: string;
  signature?: string;
}

export interface WebhookContext {
  headers: Record<string, string>;
  method: string;
  url: string;
  ip?: string;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    @InjectRepository(IntegrationWebhook)
    private webhookRepository: Repository<IntegrationWebhook>,
    private eventEmitter: EventEmitter2,
    private httpService: HttpService,
    private configService: ConfigService,
    private integrationRegistry: IntegrationRegistry,
  ) {}

  /**
   * Get webhooks for an integration
   */
  async getWebhooks(integrationId: string, workspaceId: string): Promise<IntegrationWebhook[]> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    return this.webhookRepository.find({
      where: { integrationId, workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create a webhook for an integration
   */
  async createWebhook(
    integrationId: string,
    workspaceId: string,
    data: {
      url: string;
      event: string;
      secret?: string;
      headers?: Record<string, string>;
    },
  ): Promise<IntegrationWebhook> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId, workspaceId },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    // Generate secret if not provided
    const secret = data.secret || this.generateWebhookSecret();

    const webhook = this.webhookRepository.create({
      integrationId,
      workspaceId,
      url: data.url,
      event: data.event,
      secret,
      headers: data.headers,
      status: 'active',
    });

    const saved = await this.webhookRepository.save(webhook);

    this.logger.log(`Webhook created for integration ${integrationId}: ${data.event} -> ${data.url}`);

    return saved;
  }

  /**
   * Update webhook
   */
  async updateWebhook(
    webhookId: string,
    workspaceId: string,
    data: Partial<{
      url: string;
      event: string;
      secret: string;
      headers: Record<string, string>;
      status: 'active' | 'disabled' | 'error';
    }>,
  ): Promise<IntegrationWebhook> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    Object.assign(webhook, data);
    return this.webhookRepository.save(webhook);
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string, workspaceId: string): Promise<void> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    await this.webhookRepository.remove(webhook);
    this.logger.log(`Webhook deleted: ${webhookId}`);
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    integrationId: string,
    payload: any,
    context: WebhookContext,
  ): Promise<{ success: boolean; message: string }> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId },
      relations: ['webhooks'],
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    if (!integration.isEnabled) {
      throw new BadRequestException('Integration is disabled');
    }

    try {
      // Verify webhook signature if configured
      if (integration.config?.webhookSecret) {
        this.verifyWebhookSignature(payload, context.headers, integration.config.webhookSecret);
      }

      // Get integration handler
      const handler = this.integrationRegistry.getIntegrationHandler(integration.type);

      let processedPayload = payload;
      let eventType = 'webhook';

      // Let the integration handler process the webhook
      if (handler?.handleWebhook) {
        const result = await handler.handleWebhook(integration, payload);
        processedPayload = result.data || payload;
        eventType = result.event || eventType;
      }

      // Emit webhook event
      this.eventEmitter.emit('webhook.received', {
        integrationId,
        workspaceId: integration.workspaceId,
        event: eventType,
        payload: processedPayload,
        headers: context.headers,
        timestamp: new Date(),
      });

      // Update integration activity
      integration.lastActivityAt = new Date();
      await this.integrationRepository.save(integration);

      // Update webhook delivery status
      const matchingWebhooks = integration.webhooks?.filter(w =>
        w.event === eventType || w.event === '*'
      );

      for (const webhook of matchingWebhooks || []) {
        webhook.lastDeliveredAt = new Date();
        webhook.failureCount = 0;
        webhook.lastError = null;
        webhook.status = 'active';
        await this.webhookRepository.save(webhook);
      }

      this.logger.log(`Webhook processed for integration ${integrationId}: ${eventType}`);

      return { success: true, message: 'Webhook processed successfully' };
    } catch (error) {
      this.logger.error(`Webhook processing failed for integration ${integrationId}:`, error);

      // Record webhook failure
      const webhooks = await this.webhookRepository.find({
        where: { integrationId },
      });

      for (const webhook of webhooks) {
        webhook.failureCount += 1;
        webhook.lastError = error.message;
        if (webhook.failureCount >= 5) {
          webhook.status = 'error';
        }
        await this.webhookRepository.save(webhook);
      }

      throw error;
    }
  }

  /**
   * Send webhook to external URL
   */
  async sendWebhook(
    webhook: IntegrationWebhook,
    payload: WebhookPayload,
    retries: number = 3,
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'SlackCRM-Webhook/1.0',
      ...webhook.headers,
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = this.generateWebhookSignature(payload, webhook.secret);
      headers['X-Webhook-Signature'] = signature;
      headers['X-Webhook-Signature-256'] = `sha256=${signature}`;
    }

    // Add metadata headers
    headers['X-Webhook-Event'] = payload.event;
    headers['X-Webhook-Delivery'] = crypto.randomUUID();
    headers['X-Webhook-Timestamp'] = payload.timestamp.toISOString();

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        const response = await this.httpService.axiosRef.post(webhook.url, payload, {
          headers,
          timeout: 30000, // 30 second timeout
          validateStatus: (status) => status >= 200 && status < 300,
        });

        const duration = Date.now() - startTime;

        // Update webhook success
        webhook.lastDeliveredAt = new Date();
        webhook.failureCount = 0;
        webhook.lastError = null;
        webhook.status = 'active';
        await this.webhookRepository.save(webhook);

        this.logger.log(
          `Webhook delivered successfully to ${webhook.url} in ${duration}ms (attempt ${attempt}/${retries})`
        );

        return true;
      } catch (error) {
        const duration = Date.now();
        const isLastAttempt = attempt === retries;

        this.logger.warn(
          `Webhook delivery failed to ${webhook.url} (attempt ${attempt}/${retries}): ${error.message}`
        );

        if (isLastAttempt) {
          // Update webhook failure
          webhook.failureCount += 1;
          webhook.lastError = error.message;

          if (webhook.failureCount >= 5) {
            webhook.status = 'error';
          }

          await this.webhookRepository.save(webhook);
        } else {
          // Wait before retry (exponential backoff)
          await this.sleep(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }

    return false;
  }

  /**
   * Broadcast webhook to all matching webhooks
   */
  async broadcastWebhook(
    integrationId: string,
    event: string,
    data: any,
  ): Promise<{ sent: number; failed: number }> {
    const webhooks = await this.webhookRepository.find({
      where: [
        { integrationId, event, status: 'active' },
        { integrationId, event: '*', status: 'active' },
      ],
    });

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date(),
      source: 'slackcrm',
    };

    let sent = 0;
    let failed = 0;

    const promises = webhooks.map(async (webhook) => {
      const success = await this.sendWebhook(webhook, payload);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    });

    await Promise.all(promises);

    this.logger.log(`Webhook broadcast complete: ${sent} sent, ${failed} failed`);

    return { sent, failed };
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(
    payload: any,
    headers: Record<string, string>,
    secret: string,
  ): void {
    const signature = headers['x-webhook-signature'] || headers['x-hub-signature-256'];

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expectedSignature = this.generateWebhookSignature(payload, secret);
    const receivedSignature = signature.replace('sha256=', '');

    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex'),
    )) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  /**
   * Generate webhook signature
   */
  private generateWebhookSignature(payload: any, secret: string): string {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(webhookId: string, workspaceId: string): Promise<{ success: boolean; message: string }> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    const testPayload: WebhookPayload = {
      event: 'test',
      data: { message: 'This is a test webhook from SlackCRM' },
      timestamp: new Date(),
      source: 'slackcrm-test',
    };

    try {
      const success = await this.sendWebhook(webhook, testPayload, 1);

      if (success) {
        return { success: true, message: 'Test webhook delivered successfully' };
      } else {
        return { success: false, message: 'Test webhook delivery failed' };
      }
    } catch (error) {
      return { success: false, message: `Test webhook failed: ${error.message}` };
    }
  }

  /**
   * Get webhook delivery logs
   */
  async getWebhookLogs(
    webhookId: string,
    workspaceId: string,
    limit: number = 100,
  ): Promise<any[]> {
    // This would typically query a webhook_logs table
    // For now, return webhook status information
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId, workspaceId },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    return [
      {
        id: webhook.id,
        event: webhook.event,
        url: webhook.url,
        status: webhook.status,
        lastDeliveredAt: webhook.lastDeliveredAt,
        failureCount: webhook.failureCount,
        lastError: webhook.lastError,
      },
    ];
  }
}