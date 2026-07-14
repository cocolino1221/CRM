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
      const webhookFirstProviders = new Set(['esemneaza', 'payfunnels', 'payfunnel', 'gopayflow']);
      const isWebhookFirstProvider = webhookFirstProviders.has(providerKey);
      const isSocialOAuthProvider = ['facebook', 'instagram', 'tiktok'].includes(providerKey);

      if (!baseUrl) {
        if (isWebhookFirstProvider) {
          return {
            success: true,
            message: 'Webhook mode active. API URL is optional for this integration.',
            data: { mode: 'webhook_only' },
          };
        }
        if (isSocialOAuthProvider && integration.credentials?.accessToken) {
          const socialProbe = await this.probeSocialOAuthProvider(providerKey, integration.credentials.accessToken);
          return {
            success: true,
            message: `${providerKey} OAuth connection successful`,
            data: socialProbe,
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
      if (['esemneaza', 'payfunnels', 'payfunnel', 'gopayflow'].includes(providerKey) && statusCode === 404) {
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

  private async probeSocialOAuthProvider(providerKey: string, accessToken: string): Promise<any> {
    if (providerKey === 'instagram') {
      // Instagram Login tokens live on graph.instagram.com; legacy
      // Facebook-Login tokens only work on graph.facebook.com. Try the new
      // flavor first, fall back to the legacy one.
      try {
        const res = await this.httpService.axiosRef.get('https://graph.instagram.com/v23.0/me', {
          params: { fields: 'id,username' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        });
        return { provider: providerKey, profile: res.data };
      } catch {
        const res = await this.httpService.axiosRef.get('https://graph.facebook.com/v23.0/me', {
          params: { fields: 'id,name' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10000,
        });
        return { provider: providerKey, profile: res.data };
      }
    }

    if (providerKey === 'facebook') {
      const res = await this.httpService.axiosRef.get('https://graph.facebook.com/v23.0/me', {
        params: { fields: 'id,name' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      return { provider: providerKey, profile: res.data };
    }

    if (providerKey === 'tiktok') {
      const res = await this.httpService.axiosRef.get('https://open.tiktokapis.com/v2/user/info/', {
        params: { fields: 'open_id,display_name' },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
      return { provider: providerKey, profile: res.data?.data || res.data };
    }

    return { provider: providerKey };
  }
}
