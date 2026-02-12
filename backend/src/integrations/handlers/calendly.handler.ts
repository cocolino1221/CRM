import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class CalendlyIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(CalendlyIntegrationHandler.name);
  private readonly baseUrl = 'https://api.calendly.com';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const accessToken = integration.credentials?.accessToken;
      if (!accessToken) {
        return {
          success: false,
          message: 'Access token not found',
        };
      }

      // Get current user info to test connection
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        message: 'Connected to Calendly successfully',
        data: {
          name: response.data.resource.name,
          email: response.data.resource.email,
          schedulingUrl: response.data.resource.scheduling_url,
        },
      };
    } catch (error) {
      this.logger.error(`Calendly connection failed: ${error.message}`);
      return {
        success: false,
        message: `Calendly connection failed: ${error.response?.data?.message || error.message}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'scheduled_events';
      let records = [];

      switch (syncType) {
        case 'scheduled_events':
          records = await this.syncScheduledEvents(accessToken, options);
          break;
        case 'event_types':
          records = await this.syncEventTypes(accessToken, options);
          break;
        case 'invitees':
          records = await this.syncInvitees(accessToken, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`Calendly sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing Calendly webhook');

    // Calendly webhook events
    const event = {
      type: `calendly.${payload.event}`,
      eventUri: payload.payload?.event?.uri,
      inviteeUri: payload.payload?.invitee?.uri,
      timestamp: new Date(payload.created_at),
      data: payload.payload,
    };

    return event;
  }

  /**
   * Sync scheduled events from Calendly
   */
  private async syncScheduledEvents(accessToken: string, options?: any): Promise<any[]> {
    try {
      // First get current user
      const userResponse = await this.httpService.axiosRef.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const userUri = userResponse.data.resource.uri;

      // Then get scheduled events
      const params: any = {
        user: userUri,
        count: options?.limit || 100,
        sort: 'start_time:desc',
      };

      if (options?.minStartTime) {
        params.min_start_time = options.minStartTime;
      }
      if (options?.maxStartTime) {
        params.max_start_time = options.maxStartTime;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/scheduled_events`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params,
        }
      );

      return (response.data.collection || []).map((event: any) => ({
        uri: event.uri,
        name: event.name,
        status: event.status,
        startTime: event.start_time,
        endTime: event.end_time,
        eventType: event.event_type,
        location: event.location,
        inviteesCounter: event.invitees_counter,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
      }));
    } catch (error) {
      this.logger.error(`Scheduled events sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync event types from Calendly
   */
  private async syncEventTypes(accessToken: string, options?: any): Promise<any[]> {
    try {
      // First get current user
      const userResponse = await this.httpService.axiosRef.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const userUri = userResponse.data.resource.uri;

      // Then get event types
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/event_types`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            user: userUri,
            count: options?.limit || 100,
            active: options?.active !== undefined ? options.active : true,
          },
        }
      );

      return (response.data.collection || []).map((eventType: any) => ({
        uri: eventType.uri,
        name: eventType.name,
        slug: eventType.slug,
        active: eventType.active,
        duration: eventType.duration,
        schedulingUrl: eventType.scheduling_url,
        description: eventType.description_plain,
        color: eventType.color,
        type: eventType.type,
        createdAt: eventType.created_at,
        updatedAt: eventType.updated_at,
      }));
    } catch (error) {
      this.logger.error(`Event types sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync invitees from Calendly
   */
  private async syncInvitees(accessToken: string, options?: any): Promise<any[]> {
    try {
      const params: any = {
        count: options?.limit || 100,
        sort: 'created_at:desc',
      };

      if (options?.eventUri) {
        params.event = options.eventUri;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/scheduled_events/${options?.eventUri}/invitees`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params,
        }
      );

      return (response.data.collection || []).map((invitee: any) => ({
        uri: invitee.uri,
        email: invitee.email,
        name: invitee.name,
        status: invitee.status,
        timezone: invitee.timezone,
        event: invitee.event,
        questionsAndAnswers: invitee.questions_and_answers,
        cancelledAt: invitee.cancelled_at,
        createdAt: invitee.created_at,
        updatedAt: invitee.updated_at,
      }));
    } catch (error) {
      this.logger.error(`Invitees sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get event details
   */
  async getScheduledEvent(accessToken: string, eventUri: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}${eventUri}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.resource;
    } catch (error) {
      this.logger.error(`Failed to get Calendly event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get invitee details
   */
  async getInvitee(accessToken: string, inviteeUri: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}${inviteeUri}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.resource;
    } catch (error) {
      this.logger.error(`Failed to get Calendly invitee: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel scheduled event
   */
  async cancelScheduledEvent(
    accessToken: string,
    inviteeUri: string,
    reason?: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/scheduled_events/${inviteeUri}/cancellation`,
        {
          reason: reason || 'Cancelled by user',
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to cancel Calendly event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create webhook subscription
   */
  async createWebhookSubscription(
    accessToken: string,
    data: {
      url: string;
      events: string[];
      organizationUri: string;
      scope?: 'organization' | 'user';
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/webhook_subscriptions`,
        {
          url: data.url,
          events: data.events,
          organization: data.organizationUri,
          scope: data.scope || 'organization',
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.resource;
    } catch (error) {
      this.logger.error(`Failed to create Calendly webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * List webhook subscriptions
   */
  async listWebhookSubscriptions(
    accessToken: string,
    organizationUri: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/webhook_subscriptions`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            organization: organizationUri,
            scope: 'organization',
          },
        }
      );

      return response.data.collection || [];
    } catch (error) {
      this.logger.error(`Failed to list Calendly webhooks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhookSubscription(
    accessToken: string,
    webhookUri: string
  ): Promise<any> {
    try {
      await this.httpService.axiosRef.delete(
        `${this.baseUrl}${webhookUri}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete Calendly webhook: ${error.message}`);
      throw error;
    }
  }
}
