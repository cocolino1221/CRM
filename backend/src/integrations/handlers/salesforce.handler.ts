import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class SalesforceIntegrationHandler implements IntegrationHandler {
  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const instanceUrl = integration.config?.instanceUrl || 'https://login.salesforce.com';
      const response = await this.httpService.axiosRef.get(`${instanceUrl}/services/data/v52.0/`, {
        headers: { Authorization: `Bearer ${integration.credentials?.accessToken}` },
      });
      return { success: true, message: 'Connected to Salesforce', data: response.data };
    } catch (error) {
      return { success: false, message: `Salesforce connection failed: ${error.message}` };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    return { records: [], hasMore: false };
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    return { event: 'salesforce.webhook', data: payload };
  }
}