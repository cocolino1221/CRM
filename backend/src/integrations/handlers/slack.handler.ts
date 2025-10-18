import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class SlackIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(SlackIntegrationHandler.name);

  constructor(private httpService: HttpService) {}

  /**
   * Test Slack API connection
   */
  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://slack.com/api/auth.test', {
          headers: {
            Authorization: `Bearer ${integration.credentials?.accessToken}`,
          },
        })
      );

      if (response.data.ok) {
        return {
          success: true,
          message: 'Connected to Slack successfully',
          data: {
            team: response.data.team,
            user: response.data.user,
            url: response.data.url,
          },
        };
      } else {
        return {
          success: false,
          message: `Slack API error: ${response.data.error}`,
        };
      }
    } catch (error) {
      this.logger.error('Slack connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Sync data with Slack (users, channels, messages)
   */
  async syncData(integration: Integration, options?: any): Promise<any> {
    const { direction, entity } = options;

    try {
      switch (entity) {
        case 'users':
          return await this.syncUsers(integration, direction);
        case 'channels':
          return await this.syncChannels(integration, direction);
        case 'messages':
          return await this.syncMessages(integration, direction);
        default:
          throw new Error(`Unsupported entity for Slack sync: ${entity}`);
      }
    } catch (error) {
      this.logger.error(`Slack sync failed for entity ${entity}:`, error);
      throw error;
    }
  }

  /**
   * Handle Slack webhook events
   */
  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    try {
      const { type, event } = payload;

      // Handle URL verification
      if (type === 'url_verification') {
        return {
          event: 'url_verification',
          data: { challenge: payload.challenge },
        };
      }

      // Handle events
      if (type === 'event_callback' && event) {
        switch (event.type) {
          case 'message':
            return await this.handleMessageEvent(integration, event);
          case 'member_joined_channel':
            return await this.handleMemberJoinedEvent(integration, event);
          case 'user_change':
            return await this.handleUserChangeEvent(integration, event);
          default:
            this.logger.log(`Unhandled Slack event: ${event.type}`);
            return { event: event.type, data: event };
        }
      }

      return { event: type, data: payload };
    } catch (error) {
      this.logger.error('Slack webhook handling failed:', error);
      throw error;
    }
  }

  /**
   * Refresh Slack authentication
   */
  async refreshAuth(integration: Integration): Promise<any> {
    // Slack tokens typically don't expire, but we can validate them
    return this.testConnection(integration);
  }

  /**
   * Validate Slack configuration
   */
  async validateConfig(config: any): Promise<boolean> {
    const required = ['scopes'];

    for (const field of required) {
      if (!config[field]) {
        return false;
      }
    }

    // Validate scopes
    const validScopes = [
      'channels:read',
      'chat:write',
      'users:read',
      'files:read',
      'commands',
      'incoming-webhook',
    ];

    if (config.scopes && Array.isArray(config.scopes)) {
      for (const scope of config.scopes) {
        if (!validScopes.includes(scope)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Sync Slack users
   */
  private async syncUsers(integration: Integration, direction: string): Promise<any> {
    if (direction !== 'inbound') {
      throw new Error('Outbound user sync not supported for Slack');
    }

    const response = await firstValueFrom(
      this.httpService.get('https://slack.com/api/users.list', {
        headers: {
          Authorization: `Bearer ${integration.credentials?.accessToken}`,
        },
        params: {
          limit: 1000,
        },
      })
    );

    if (!response.data.ok) {
      throw new Error(`Slack API error: ${response.data.error}`);
    }

    const users = response.data.members
      .filter((user: any) => !user.deleted && !user.is_bot)
      .map((user: any) => ({
        id: user.id,
        name: user.real_name || user.name,
        email: user.profile.email,
        title: user.profile.title,
        phone: user.profile.phone,
        avatar: user.profile.image_512,
        timezone: user.tz,
      }));

    return {
      records: users,
      hasMore: false,
      nextCursor: null,
    };
  }

  /**
   * Sync Slack channels
   */
  private async syncChannels(integration: Integration, direction: string): Promise<any> {
    if (direction !== 'inbound') {
      throw new Error('Outbound channel sync not supported for Slack');
    }

    const response = await firstValueFrom(
      this.httpService.get('https://slack.com/api/conversations.list', {
        headers: {
          Authorization: `Bearer ${integration.credentials?.accessToken}`,
        },
        params: {
          types: 'public_channel,private_channel',
          limit: 1000,
        },
      })
    );

    if (!response.data.ok) {
      throw new Error(`Slack API error: ${response.data.error}`);
    }

    const channels = response.data.channels.map((channel: any) => ({
      id: channel.id,
      name: channel.name,
      topic: channel.topic?.value,
      purpose: channel.purpose?.value,
      memberCount: channel.num_members,
      isPrivate: channel.is_private,
      isArchived: channel.is_archived,
      created: new Date(channel.created * 1000),
    }));

    return {
      records: channels,
      hasMore: false,
      nextCursor: null,
    };
  }

  /**
   * Sync Slack messages (for specific channels)
   */
  private async syncMessages(integration: Integration, direction: string): Promise<any> {
    if (direction !== 'inbound') {
      throw new Error('Outbound message sync not supported for Slack');
    }

    // This would typically sync messages from specific channels
    // For now, return empty result
    return {
      records: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  /**
   * Handle Slack message events
   */
  private async handleMessageEvent(integration: Integration, event: any): Promise<any> {
    return {
      event: 'slack.message',
      data: {
        channel: event.channel,
        user: event.user,
        text: event.text,
        timestamp: event.ts,
        thread: event.thread_ts,
      },
    };
  }

  /**
   * Handle member joined channel events
   */
  private async handleMemberJoinedEvent(integration: Integration, event: any): Promise<any> {
    return {
      event: 'slack.member_joined',
      data: {
        channel: event.channel,
        user: event.user,
        inviter: event.inviter,
      },
    };
  }

  /**
   * Handle user change events
   */
  private async handleUserChangeEvent(integration: Integration, event: any): Promise<any> {
    return {
      event: 'slack.user_changed',
      data: {
        user: event.user,
      },
    };
  }

  /**
   * Send message to Slack
   */
  async sendMessage(integration: Integration, channelId: string, text: string, options?: any): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://slack.com/api/chat.postMessage',
          {
            channel: channelId,
            text,
            ...options,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.credentials?.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      if (!response.data.ok) {
        throw new Error(`Slack API error: ${response.data.error}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send Slack message:', error);
      throw error;
    }
  }

  /**
   * Create Slack slash command
   */
  async createSlashCommand(integration: Integration, command: string, url: string): Promise<any> {
    // This would typically be done through Slack app configuration
    // For now, just return the command configuration
    return {
      command,
      url,
      integration: integration.id,
    };
  }
}