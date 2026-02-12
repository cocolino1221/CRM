import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class PandaDocIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(PandaDocIntegrationHandler.name);
  private readonly baseUrl = 'https://api.pandadoc.com/public/v1';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const apiKey = integration.credentials?.apiKey;
      if (!apiKey) {
        return {
          success: false,
          message: 'API key not found',
        };
      }

      // Test PandaDoc API connection by fetching user info
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/users/me`,
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        message: 'Connected to PandaDoc successfully',
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`PandaDoc connection failed: ${error.message}`);
      return {
        success: false,
        message: `PandaDoc connection failed: ${error.response?.data?.detail || error.message}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const apiKey = integration.credentials?.apiKey;
      if (!apiKey) {
        throw new Error('API key not found');
      }

      const syncType = options?.type || 'documents';
      let records = [];

      switch (syncType) {
        case 'documents':
          records = await this.syncDocuments(apiKey, options);
          break;
        case 'templates':
          records = await this.syncTemplates(apiKey, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`PandaDoc sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing PandaDoc webhook');

    // PandaDoc webhook events
    const event = {
      type: `pandadoc.${payload.event}`,
      documentId: payload.data?.id,
      status: payload.data?.status,
      timestamp: new Date(),
      data: payload.data,
    };

    return event;
  }

  /**
   * Create a document from template
   */
  async createDocument(
    apiKey: string,
    data: {
      name: string;
      templateId: string;
      recipients: Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
      }>;
      tokens?: Array<{
        name: string;
        value: string;
      }>;
      fields?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/documents`,
        {
          name: data.name,
          template_uuid: data.templateId,
          recipients: data.recipients.map((r, index) => ({
            email: r.email,
            first_name: r.firstName,
            last_name: r.lastName,
            role: r.role || 'Client',
            signing_order: index + 1,
          })),
          tokens: data.tokens || [],
          fields: data.fields || {},
          metadata: data.metadata || {},
        },
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create PandaDoc document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a document for signing
   */
  async sendDocument(
    apiKey: string,
    documentId: string,
    options?: {
      message?: string;
      subject?: string;
      silent?: boolean;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/documents/${documentId}/send`,
        {
          message: options?.message || '',
          subject: options?.subject || 'Please sign this document',
          silent: options?.silent || false,
        },
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send PandaDoc document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get document details
   */
  async getDocument(apiKey: string, documentId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/documents/${documentId}/details`,
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get PandaDoc document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download completed document
   */
  async downloadDocument(apiKey: string, documentId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/documents/${documentId}/download`,
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
          },
          responseType: 'arraybuffer',
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to download PandaDoc document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Void a document
   */
  async voidDocument(apiKey: string, documentId: string): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}/documents/${documentId}/void`,
        {},
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to void PandaDoc document: ${error.message}`);
      throw error;
    }
  }

  /**
   * List templates
   */
  async listTemplates(apiKey: string, options?: { page?: number; count?: number }): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/templates`,
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          params: {
            page: options?.page || 1,
            count: options?.count || 100,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to list PandaDoc templates: ${error.message}`);
      throw error;
    }
  }

  private async syncDocuments(apiKey: string, options?: any): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}/documents`,
        {
          headers: {
            'Authorization': `API-Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          params: {
            count: options?.limit || 100,
            status: options?.status,
          },
        }
      );

      return response.data.results || [];
    } catch (error) {
      this.logger.error(`Documents sync failed: ${error.message}`);
      return [];
    }
  }

  private async syncTemplates(apiKey: string, options?: any): Promise<any[]> {
    try {
      const templates = await this.listTemplates(apiKey, {
        count: options?.limit || 100,
      });

      return templates.results || [];
    } catch (error) {
      this.logger.error(`Templates sync failed: ${error.message}`);
      return [];
    }
  }
}
