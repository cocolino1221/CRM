import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class DocuSignIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(DocuSignIntegrationHandler.name);
  private readonly basePath = '/restapi/v2.1';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const accessToken = integration.credentials?.accessToken;
      const baseUri = integration.config?.baseUri;

      if (!accessToken) {
        return {
          success: false,
          message: 'Access token not found',
        };
      }

      if (!baseUri) {
        return {
          success: false,
          message: 'Base URI not configured',
        };
      }

      // Get user info to test connection
      const response = await this.httpService.axiosRef.get(
        `${baseUri}${this.basePath}/accounts`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        message: 'Connected to DocuSign successfully',
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`DocuSign connection failed: ${error.message}`);
      return {
        success: false,
        message: `DocuSign connection failed: ${error.response?.data?.message || error.message}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      const baseUri = integration.config?.baseUri;
      const accountId = integration.config?.accountId;

      if (!accessToken || !baseUri || !accountId) {
        throw new Error('Missing required configuration');
      }

      const syncType = options?.type || 'envelopes';
      let records = [];

      switch (syncType) {
        case 'envelopes':
          records = await this.syncEnvelopes(accessToken, baseUri, accountId, options);
          break;
        case 'templates':
          records = await this.syncTemplates(accessToken, baseUri, accountId, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`DocuSign sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing DocuSign webhook');

    // DocuSign Connect webhook events
    const event = {
      type: `docusign.${payload.event}`,
      envelopeId: payload.data?.envelopeId,
      status: payload.data?.envelopeStatus,
      timestamp: new Date(),
      data: payload.data,
    };

    return event;
  }

  async refreshAuth(integration: Integration): Promise<any> {
    try {
      const refreshToken = integration.credentials?.refreshToken;
      const clientId = integration.config?.clientId;
      const clientSecret = integration.config?.clientSecret;

      if (!refreshToken || !clientId || !clientSecret) {
        throw new Error('Missing OAuth credentials');
      }

      const response = await this.httpService.axiosRef.post(
        'https://account.docusign.com/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
      };
    } catch (error) {
      this.logger.error(`Failed to refresh DocuSign token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create an envelope from template
   */
  async createEnvelope(
    accessToken: string,
    baseUri: string,
    accountId: string,
    data: {
      templateId: string;
      emailSubject: string;
      recipients: Array<{
        email: string;
        name: string;
        roleName?: string;
        recipientId?: string;
      }>;
      tabs?: Record<string, any>;
      status?: 'created' | 'sent';
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes`,
        {
          templateId: data.templateId,
          emailSubject: data.emailSubject,
          status: data.status || 'sent',
          templateRoles: data.recipients.map((r, index) => ({
            email: r.email,
            name: r.name,
            roleName: r.roleName || 'Signer',
            recipientId: r.recipientId || String(index + 1),
            tabs: data.tabs || {},
          })),
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
      this.logger.error(`Failed to create DocuSign envelope: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get envelope details
   */
  async getEnvelope(
    accessToken: string,
    baseUri: string,
    accountId: string,
    envelopeId: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes/${envelopeId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get DocuSign envelope: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recipient signing URL
   */
  async getRecipientView(
    accessToken: string,
    baseUri: string,
    accountId: string,
    envelopeId: string,
    data: {
      recipientEmail: string;
      recipientName: string;
      returnUrl: string;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes/${envelopeId}/views/recipient`,
        {
          returnUrl: data.returnUrl,
          authenticationMethod: 'none',
          email: data.recipientEmail,
          userName: data.recipientName,
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
      this.logger.error(`Failed to get DocuSign recipient view: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download completed envelope documents
   */
  async downloadEnvelopeDocuments(
    accessToken: string,
    baseUri: string,
    accountId: string,
    envelopeId: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          responseType: 'arraybuffer',
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to download DocuSign documents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Void an envelope
   */
  async voidEnvelope(
    accessToken: string,
    baseUri: string,
    accountId: string,
    envelopeId: string,
    voidReason: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.put(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes/${envelopeId}`,
        {
          status: 'voided',
          voidedReason: voidReason,
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
      this.logger.error(`Failed to void DocuSign envelope: ${error.message}`);
      throw error;
    }
  }

  /**
   * List templates
   */
  async listTemplates(
    accessToken: string,
    baseUri: string,
    accountId: string,
    options?: { count?: number; startPosition?: number }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${baseUri}${this.basePath}/accounts/${accountId}/templates`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            count: options?.count || 100,
            start_position: options?.startPosition || 0,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to list DocuSign templates: ${error.message}`);
      throw error;
    }
  }

  private async syncEnvelopes(
    accessToken: string,
    baseUri: string,
    accountId: string,
    options?: any
  ): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${baseUri}${this.basePath}/accounts/${accountId}/envelopes`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            count: options?.limit || 100,
            from_date: options?.fromDate,
            status: options?.status,
          },
        }
      );

      return response.data.envelopes || [];
    } catch (error) {
      this.logger.error(`Envelopes sync failed: ${error.message}`);
      return [];
    }
  }

  private async syncTemplates(
    accessToken: string,
    baseUri: string,
    accountId: string,
    options?: any
  ): Promise<any[]> {
    try {
      const templates = await this.listTemplates(accessToken, baseUri, accountId, {
        count: options?.limit || 100,
      });

      return templates.envelopeTemplates || [];
    } catch (error) {
      this.logger.error(`Templates sync failed: ${error.message}`);
      return [];
    }
  }
}
