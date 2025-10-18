import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class HubSpotIntegrationHandler implements IntegrationHandler {
  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await this.httpService.axiosRef.get('https://api.hubapi.com/oauth/v1/access-tokens/' + integration.credentials?.accessToken);
      return { success: true, message: 'Connected to HubSpot', data: response.data };
    } catch (error) {
      return { success: false, message: `HubSpot connection failed: ${error.message}` };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    return { records: [], hasMore: false };
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    return { event: 'hubspot.webhook', data: payload };
  }
}