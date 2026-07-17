import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration, IntegrationStatus } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class GoogleIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(GoogleIntegrationHandler.name);

  constructor(
    private httpService: HttpService,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
  ) {}

  /**
   * Helper method to make authenticated Google API requests with automatic token refresh
   */
  private async makeAuthenticatedRequest<T = any>(
    integration: Integration,
    url: string,
    params?: any,
    method: 'get' | 'post' = 'get'
  ): Promise<T> {
    let accessToken = integration.credentials?.accessToken;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params,
      };

      const response = method === 'get'
        ? await this.httpService.axiosRef.get(url, config)
        : await this.httpService.axiosRef.post(url, params, { headers: config.headers });

      return response.data;
    } catch (error) {
      // If 401, try refreshing the token and retry
      if (error.response?.status === 401) {
        this.logger.log('Access token expired, refreshing...');
        accessToken = await this.refreshAccessToken(integration);

        // Retry with new token
        const config = {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params,
        };

        const response = method === 'get'
          ? await this.httpService.axiosRef.get(url, config)
          : await this.httpService.axiosRef.post(url, params, { headers: config.headers });

        return response.data;
      }
      throw error;
    }
  }

  /**
   * Helper method to refresh access token when it expires
   */
  private async refreshAccessToken(integration: Integration): Promise<string> {
    try {
      if (!integration.credentials?.refreshToken) {
        this.logger.error(`No refresh token available for Google integration ${integration.id}. User needs to reconnect.`);
        
        // Mark integration as needing reconnection
        integration.status = IntegrationStatus.PENDING;
        integration.recordError('Token refresh failed: No refresh token available. Please reconnect this integration.');
        await this.integrationRepository.save(integration);
        
        throw new Error('No refresh token available. Please reconnect this integration in the integrations page.');
      }

      this.logger.log(`Refreshing Google access token for integration ${integration.id}`);

      const response = await this.httpService.axiosRef.post(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.OAUTH_GOOGLE_CLIENT_ID,
          client_secret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
          refresh_token: integration.credentials.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const newAccessToken = response.data.access_token;
      const expiresIn = response.data.expires_in;

      // Update integration credentials
      integration.credentials = {
        ...integration.credentials,
        accessToken: newAccessToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      };

      // Clear any previous errors
      integration.clearErrors();
      await this.integrationRepository.save(integration);

      this.logger.log(`Successfully refreshed Google access token for integration ${integration.id}`);

      return newAccessToken;
    } catch (error) {
      this.logger.error(`Failed to refresh Google access token: ${error.message}`);
      
      // Mark integration as needing reconnection if refresh token is missing
      if (error.message.includes('No refresh token available')) {
        integration.status = IntegrationStatus.PENDING;
        integration.recordError(`Token refresh failed: ${error.message}`);
        await this.integrationRepository.save(integration);
      }
      
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      // Check if we have access token
      if (!integration.credentials?.accessToken) {
        return {
          success: false,
          message: 'Google connection failed: No access token available. Please reconnect this integration.',
        };
      }

      // Check if token is expired and we don't have refresh token
      const expiresAt = integration.credentials.expiresAt 
        ? new Date(integration.credentials.expiresAt) 
        : null;
      
      if (expiresAt && expiresAt <= new Date() && !integration.credentials.refreshToken) {
        return {
          success: false,
          message: 'Google connection failed: Access token expired and no refresh token available. Please reconnect this integration.',
        };
      }

      const data = await this.makeAuthenticatedRequest(
        integration,
        'https://www.googleapis.com/oauth2/v2/userinfo'
      );

      return {
        success: true,
        message: 'Connected to Google successfully',
        data,
      };
    } catch (error) {
      // Provide more specific error messages
      let errorMessage = error.message;
      
      if (error.message.includes('No refresh token available')) {
        errorMessage = 'Token refresh failed: No refresh token available. Please reconnect this integration.';
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Google connection failed: Access token expired or invalid. Please reconnect this integration.';
      }
      
      return {
        success: false,
        message: `Google connection failed: ${errorMessage}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      if (!integration.credentials?.accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'contacts';
      let records = [];

      switch (syncType) {
        case 'calendar':
          records = await this.syncCalendar(integration);
          break;
        case 'contacts':
          records = await this.syncContacts(integration);
          break;
        case 'drive':
          records = await this.syncDrive(integration, options);
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

  private async syncCalendar(integration: Integration): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest(
        integration,
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          maxResults: 100,
          timeMin: new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        }
      );

      return data.items || [];
    } catch (error) {
      this.logger.error(`Calendar sync failed: ${error.message}`);
      return [];
    }
  }

  private async syncContacts(integration: Integration): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest(
        integration,
        'https://people.googleapis.com/v1/people/me/connections',
        {
          personFields: 'names,emailAddresses,phoneNumbers,organizations',
          pageSize: 100,
        }
      );

      return data.connections || [];
    } catch (error) {
      this.logger.error(`Contacts sync failed: ${error.message}`);
      return [];
    }
  }

  private async syncDrive(integration: Integration, options?: any): Promise<any[]> {
    try {
      const pageSize = options?.pageSize || 100;
      const query = options?.query || '';
      const folderId = options?.folderId;

      // Build query parameters
      const params: any = {
        pageSize,
        fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,owners,shared,parents)',
        orderBy: 'modifiedTime desc',
      };

      // If specific folder is requested
      if (folderId) {
        params.q = `'${folderId}' in parents`;
      } else if (query) {
        params.q = query;
      } else {
        // Get recently modified files
        params.q = "trashed=false";
      }

      const data = await this.makeAuthenticatedRequest(
        integration,
        'https://www.googleapis.com/drive/v3/files',
        params
      );

      return data.files || [];
    } catch (error) {
      this.logger.error(`Drive sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFile(accessToken: string, fileId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            fields: 'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,owners,shared,parents',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Get file failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download file from Google Drive
   */
  async downloadFile(accessToken: string, fileId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            alt: 'media',
          },
          responseType: 'arraybuffer',
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Download file failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List folders in Google Drive
   */
  async listFolders(accessToken: string, parentId?: string): Promise<any[]> {
    try {
      const params: any = {
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id,name,createdTime,modifiedTime,parents)',
        orderBy: 'name',
      };

      if (parentId) {
        params.q += ` and '${parentId}' in parents`;
      }

      const response = await this.httpService.axiosRef.get(
        'https://www.googleapis.com/drive/v3/files',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params,
        }
      );

      return response.data.files || [];
    } catch (error) {
      this.logger.error(`List folders failed: ${error.message}`);
      return [];
    }
  }

  /**
   * List Google Sheets from Drive
   */
  async listSheets(integration: any): Promise<any[]> {
    try {
      const params: any = {
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'files(id,name,createdTime,modifiedTime,webViewLink,iconLink,owners)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
      };

      const data = await this.makeAuthenticatedRequest(
        integration,
        'https://www.googleapis.com/drive/v3/files',
        params
      );

      return data.files || [];
    } catch (error) {
      // Don't mask permission problems as an empty library — the UI needs
      // to distinguish "no sheets" from "no access" (missing Drive scope).
      this.logger.error(`List sheets failed: ${error.message}`);
      const status = error.response?.status;
      if (status === 403 || status === 401) {
        throw new Error(
          'Google denied access to your Drive files. Reconnect Google to grant the Sheets/Drive permission.',
        );
      }
      throw error;
    }
  }

  /**
   * Get spreadsheet data from Google Sheets
   */
  async getSheetData(integration: any, spreadsheetId: string, range?: string): Promise<any> {
    try {
      const sheetRange = range || 'A1:Z1000'; // Default range
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange}`;

      const data = await this.makeAuthenticatedRequest(integration, url);

      return {
        spreadsheetId,
        range: data.range,
        values: data.values || [],
      };
    } catch (error) {
      this.logger.error(`Get sheet data failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get spreadsheet metadata (sheets list, properties)
   */
  async getSpreadsheetMetadata(integration: any, spreadsheetId: string): Promise<any> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

      const data = await this.makeAuthenticatedRequest(integration, url, {
        fields: 'spreadsheetId,properties,sheets(properties)',
      });

      return data;
    } catch (error) {
      this.logger.error(`Get spreadsheet metadata failed: ${error.message}`);
      throw error;
    }
  }

  // ── Sheets write API (used by the Google Sheets 2-way contact sync) ──

  /**
   * Authenticated request with separate query params + JSON body and
   * 401-refresh retry — the Sheets write endpoints need all three.
   */
  private async sheetsRequest<T = any>(
    integration: Integration,
    method: 'put' | 'post',
    url: string,
    query: Record<string, string>,
    body: any,
  ): Promise<T> {
    const send = async (token: string) => {
      const response = await this.httpService.axiosRef.request({
        method,
        url,
        params: query,
        data: body,
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data as T;
    };

    try {
      return await send(integration.credentials?.accessToken);
    } catch (error) {
      if (error.response?.status === 401) {
        const refreshed = await this.refreshAccessToken(integration);
        return send(refreshed);
      }
      throw error;
    }
  }

  /** Overwrite a cell range with values (2D array). */
  async updateSheetValues(
    integration: Integration,
    spreadsheetId: string,
    range: string,
    values: any[][],
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    return this.sheetsRequest(integration, 'put', url, { valueInputOption: 'USER_ENTERED' }, { values });
  }

  /** Append rows after the last row of the given range/table. */
  async appendSheetValues(
    integration: Integration,
    spreadsheetId: string,
    range: string,
    values: any[][],
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`;
    return this.sheetsRequest(
      integration,
      'post',
      url,
      { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
      { values },
    );
  }

  /**
   * Upload a file into Drive (multipart) — used by the CRM-documents backup.
   * Returns the created Drive file ({ id, name, webViewLink }).
   */
  async uploadFileToDrive(
    integration: Integration,
    file: { name: string; mimeType: string; data: Buffer; parentId?: string },
  ): Promise<any> {
    const boundary = `crmdrive${Date.now()}`;
    const metadata = {
      name: file.name,
      ...(file.parentId ? { parents: [file.parentId] } : {}),
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`,
      ),
      file.data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const send = async (token: string) => {
      const response = await this.httpService.axiosRef.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          maxBodyLength: 64 * 1024 * 1024,
        },
      );
      return response.data;
    };

    try {
      return await send(integration.credentials?.accessToken);
    } catch (error) {
      if (error.response?.status === 401) {
        const refreshed = await this.refreshAccessToken(integration);
        return send(refreshed);
      }
      throw error;
    }
  }

  /** Create a Drive folder; returns { id, name }. */
  async createDriveFolder(integration: Integration, name: string, parentId?: string): Promise<any> {
    return this.sheetsRequest(integration, 'post', 'https://www.googleapis.com/drive/v3/files', { fields: 'id,name' }, {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    });
  }

  /** Batch-update multiple disjoint ranges in one call. */
  async batchUpdateSheetValues(
    integration: Integration,
    spreadsheetId: string,
    data: Array<{ range: string; values: any[][] }>,
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    return this.sheetsRequest(integration, 'post', url, {}, {
      valueInputOption: 'USER_ENTERED',
      data,
    });
  }
}