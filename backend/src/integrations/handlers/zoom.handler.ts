import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class ZoomIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(ZoomIntegrationHandler.name);
  private readonly apiUrl = 'https://api.zoom.us/v2';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      // Get access token (either stored or generate new one)
      let accessToken = integration.credentials?.accessToken;

      // If no access token, try to get one using Server-to-Server OAuth
      if (!accessToken && integration.credentials?.accountId && integration.credentials?.clientId && integration.credentials?.clientSecret) {
        try {
          accessToken = await this.getServerToServerToken(
            integration.credentials.accountId,
            integration.credentials.clientId,
            integration.credentials.clientSecret
          );
        } catch (tokenError) {
          this.logger.error(`Failed to get Zoom access token: ${tokenError.message}`);
          return {
            success: false,
            message: `Failed to authenticate with Zoom: ${tokenError.message}. Please check your Account ID, Client ID, and Client Secret.`
          };
        }
      }

      if (!accessToken) {
        return {
          success: false,
          message: 'No access token available. Please provide valid Zoom credentials.'
        };
      }

      const response = await this.httpService.axiosRef.get(`${this.apiUrl}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        success: true,
        message: 'Connected to Zoom successfully',
        data: {
          id: response.data.id,
          email: response.data.email,
          firstName: response.data.first_name,
          lastName: response.data.last_name,
          type: response.data.type,
        }
      };
    } catch (error) {
      this.logger.error(`Zoom test connection failed: ${error.response?.data || error.message}`);
      return {
        success: false,
        message: `Zoom connection failed: ${error.response?.data?.message || error.message}`
      };
    }
  }

  /**
   * Create a Zoom meeting for a workspace's connected Zoom integration,
   * resolving a fresh Server-to-Server token internally (S2S tokens are
   * short-lived — fetching one right before use is the normal pattern,
   * not a cached/refreshed credential). Returns the raw Zoom meeting
   * object; caller reads `join_url`.
   */
  async createMeetingForIntegration(
    integration: Integration,
    meetingData: Parameters<ZoomIntegrationHandler['createMeeting']>[1],
  ): Promise<any> {
    const { accountId, clientId, clientSecret, accessToken: storedToken } = integration.credentials || {};
    let accessToken = storedToken;
    if (accountId && clientId && clientSecret) {
      accessToken = await this.getServerToServerToken(accountId, clientId, clientSecret);
    }
    if (!accessToken) {
      throw new Error('Zoom integration has no usable credentials (Server-to-Server accountId/clientId/clientSecret or accessToken)');
    }
    return this.createMeeting(accessToken, meetingData);
  }

  /**
   * Get Server-to-Server OAuth token
   */
  private async getServerToServerToken(accountId: string, clientId: string, clientSecret: string): Promise<string> {
    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await this.httpService.axiosRef.post(
        'https://zoom.us/oauth/token',
        new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: accountId,
        }),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data.access_token;
    } catch (error) {
      this.logger.error(`Failed to get Zoom S2S token: ${error.response?.data || error.message}`);
      throw new Error(error.response?.data?.reason || 'Failed to authenticate with Zoom');
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'meetings';
      let records = [];

      switch (syncType) {
        case 'meetings':
          records = await this.syncMeetings(accessToken, options);
          break;
        case 'users':
          records = await this.syncUsers(accessToken, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`Zoom sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing Zoom webhook');

    // Zoom sends various event types
    if (payload.event) {
      const event = {
        type: `zoom.${payload.event}`,
        payload: payload.payload,
        timestamp: new Date(payload.event_ts),
      };

      // Handle specific event types
      switch (payload.event) {
        case 'meeting.started':
        case 'meeting.ended':
        case 'meeting.participant_joined':
        case 'meeting.participant_left':
          return {
            event: event.type,
            meetingId: payload.payload?.object?.id,
            data: payload.payload,
          };
        default:
          return { event: event.type, data: payload };
      }
    }

    return { event: 'zoom.webhook', data: payload };
  }

  /**
   * Sync meetings from Zoom
   */
  private async syncMeetings(accessToken: string, options?: any): Promise<any[]> {
    try {
      const type = options?.meetingType || 'scheduled'; // scheduled, live, upcoming
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/users/me/meetings`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            type,
            page_size: options?.limit || 100,
          },
        }
      );

      return response.data.meetings.map((meeting: any) => ({
        id: meeting.id,
        topic: meeting.topic,
        type: meeting.type,
        startTime: meeting.start_time,
        duration: meeting.duration,
        timezone: meeting.timezone,
        agenda: meeting.agenda,
        joinUrl: meeting.join_url,
        password: meeting.password,
        status: meeting.status,
        createdAt: meeting.created_at,
      }));
    } catch (error) {
      this.logger.error(`Meetings sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync users from Zoom
   */
  private async syncUsers(accessToken: string, options?: any): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/users`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            status: options?.status || 'active',
            page_size: options?.limit || 100,
          },
        }
      );

      return response.data.users.map((user: any) => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        type: user.type,
        status: user.status,
        department: user.dept,
        timezone: user.timezone,
        createdAt: user.created_at,
      }));
    } catch (error) {
      this.logger.error(`Users sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a Zoom meeting
   */
  async createMeeting(
    accessToken: string,
    meetingData: {
      topic: string;
      type?: 1 | 2 | 3 | 8; // 1=instant, 2=scheduled, 3=recurring no fixed time, 8=recurring fixed time
      startTime?: string; // ISO 8601 format
      duration?: number; // in minutes
      timezone?: string;
      agenda?: string;
      password?: string;
      settings?: {
        hostVideo?: boolean;
        participantVideo?: boolean;
        joinBeforeHost?: boolean;
        muteUponEntry?: boolean;
        waitingRoom?: boolean;
        autoRecording?: 'local' | 'cloud' | 'none';
      };
    }
  ): Promise<any> {
    try {
      const meeting = {
        topic: meetingData.topic,
        type: meetingData.type || 2,
        start_time: meetingData.startTime,
        duration: meetingData.duration || 60,
        timezone: meetingData.timezone || 'UTC',
        agenda: meetingData.agenda,
        password: meetingData.password,
        settings: {
          host_video: meetingData.settings?.hostVideo ?? true,
          participant_video: meetingData.settings?.participantVideo ?? true,
          join_before_host: meetingData.settings?.joinBeforeHost ?? false,
          mute_upon_entry: meetingData.settings?.muteUponEntry ?? false,
          waiting_room: meetingData.settings?.waitingRoom ?? true,
          auto_recording: meetingData.settings?.autoRecording || 'none',
        },
      };

      const response = await this.httpService.axiosRef.post(
        `${this.apiUrl}/users/me/meetings`,
        meeting,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(accessToken: string, meetingId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/meetings/${meetingId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a Zoom meeting
   */
  async updateMeeting(
    accessToken: string,
    meetingId: string,
    updates: Record<string, any>
  ): Promise<any> {
    try {
      await this.httpService.axiosRef.patch(
        `${this.apiUrl}/meetings/${meetingId}`,
        updates,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true, id: meetingId };
    } catch (error) {
      this.logger.error(`Failed to update meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a Zoom meeting
   */
  async deleteMeeting(accessToken: string, meetingId: string): Promise<any> {
    try {
      await this.httpService.axiosRef.delete(
        `${this.apiUrl}/meetings/${meetingId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return { success: true, message: 'Meeting deleted successfully' };
    } catch (error) {
      this.logger.error(`Failed to delete meeting: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get meeting participants
   */
  async getMeetingParticipants(accessToken: string, meetingId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/past_meetings/${meetingId}/participants`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data.participants || [];
    } catch (error) {
      this.logger.error(`Failed to get meeting participants: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get meeting recordings
   */
  async getMeetingRecordings(accessToken: string, meetingId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/meetings/${meetingId}/recordings`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get meeting recordings: ${error.message}`);
      throw error;
    }
  }
}