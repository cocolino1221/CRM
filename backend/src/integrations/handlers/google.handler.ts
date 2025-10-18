import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class GoogleIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(GoogleIntegrationHandler.name);

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      // Test Google API connection
      const response = await this.httpService.axiosRef.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${integration.credentials?.accessToken}`,
          },
        }
      );

      return {
        success: true,
        message: 'Connected to Google successfully',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Google connection failed: ${error.message}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'contacts';
      let records = [];

      switch (syncType) {
        case 'calendar':
          records = await this.syncCalendar(accessToken);
          break;
        case 'contacts':
          records = await this.syncContacts(accessToken);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`Sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing Google webhook');

    // Google sends push notifications for calendar changes
    if (payload.resourceState) {
      const event = {
        type: 'google.calendar.change',
        state: payload.resourceState,
        resourceId: payload.resourceId,
        channelId: payload.channelId,
        timestamp: new Date(),
      };

      return event;
    }

    return { event: 'google.webhook', data: payload };
  }

  private async syncCalendar(accessToken: string): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            maxResults: 100,
            timeMin: new Date().toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          },
        }
      );

      return response.data.items || [];
    } catch (error) {
      this.logger.error(`Calendar sync failed: ${error.message}`);
      return [];
    }
  }

  private async syncContacts(accessToken: string): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        'https://people.googleapis.com/v1/people/me/connections',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            personFields: 'names,emailAddresses,phoneNumbers,organizations',
            pageSize: 100,
          },
        }
      );

      return response.data.connections || [];
    } catch (error) {
      this.logger.error(`Contacts sync failed: ${error.message}`);
      return [];
    }
  }
}