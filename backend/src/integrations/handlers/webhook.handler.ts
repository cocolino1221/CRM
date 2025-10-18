import { Injectable } from '@nestjs/common';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class WebhookIntegrationHandler implements IntegrationHandler {
  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    return { success: true, message: 'Webhook integration ready to receive data' };
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    return { records: [], hasMore: false };
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    return { event: 'webhook.received', data: payload };
  }
}