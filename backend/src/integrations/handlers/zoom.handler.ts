import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class ZoomIntegrationHandler implements IntegrationHandler {
  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await this.httpService.axiosRef.get('https://api.zoom.us/v2/users/me', {
        headers: { Authorization: `Bearer ${integration.credentials?.accessToken}` },
      });
      return { success: true, message: 'Connected to Zoom', data: response.data };
    } catch (error) {
      return { success: false, message: `Zoom connection failed: ${error.message}` };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    return { records: [], hasMore: false };
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    return { event: 'zoom.webhook', data: payload };
  }
}