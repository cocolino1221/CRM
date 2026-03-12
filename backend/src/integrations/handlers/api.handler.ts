import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class ApiIntegrationHandler implements IntegrationHandler {
  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const baseUrl = integration.config?.baseUrl;
      const providerKey = String(integration.config?.provider || integration.externalId || '').trim().toLowerCase();
      const webhookFirstProviders = new Set(['esemneaza', 'payfunnels', 'payfunnel']);
      const isWebhookFirstProvider = webhookFirstProviders.has(providerKey);

      if (!baseUrl) {
        if (isWebhookFirstProvider) {
          return {
            success: true,
            message: 'Webhook mode active. API URL is optional for this integration.',
            data: { mode: 'webhook_only' },
          };
        }
        return { success: false, message: 'Base URL not configured' };
      }

      const headers: Record<string, string> = integration.config?.headers || {};

      if (integration.credentials?.apiKey) {
        headers['Authorization'] = `Bearer ${integration.credentials.apiKey}`;
      }

      const response = await this.httpService.axiosRef.get(baseUrl, { headers, timeout: 10000 });
      return { success: true, message: 'API connection successful', data: { status: response.status } };
    } catch (error) {
      const providerKey = String(integration.config?.provider || integration.externalId || '').trim().toLowerCase();
      const statusCode = (error as any)?.response?.status;
      if (['esemneaza', 'payfunnels', 'payfunnel'].includes(providerKey) && statusCode === 404) {
        return {
          success: true,
          message: 'Webhook mode active. Endpoint returned 404, but webhook integration can still be used.',
          data: { mode: 'webhook_only', status: statusCode },
        };
      }
      return { success: false, message: `API connection failed: ${error.message}` };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    return { records: [], hasMore: false };
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    return { event: 'api.webhook', data: payload };
  }
}
