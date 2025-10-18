import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface TypeformWebhookPayload {
  event_id: string;
  event_type: 'form_response';
  form_response: {
    form_id: string;
    token: string;
    landed_at: string;
    submitted_at: string;
    definition: {
      id: string;
      title: string;
      fields: any[];
    };
    answers: TypeformAnswer[];
    calculated?: {
      score: number;
    };
  };
}

interface TypeformAnswer {
  type: string;
  field: {
    id: string;
    type: string;
    ref: string;
  };
  [key: string]: any; // Dynamic answer fields
}

/**
 * Typeform integration handler
 * Handles webhooks and form submissions
 */
@Injectable()
export class TypeformIntegrationHandler {
  private readonly logger = new Logger(TypeformIntegrationHandler.name);
  private readonly TYPEFORM_API_URL = 'https://api.typeform.com';

  constructor(private configService: ConfigService) {}

  /**
   * Test Typeform API connection
   */
  async testConnection(integration: any): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const apiKey = integration.credentials?.apiKey || this.configService.get<string>('TYPEFORM_API_KEY');

      if (!apiKey) {
        return {
          success: false,
          message: 'API key not configured',
        };
      }

      // Test by fetching user profile
      const response = await axios.get(`${this.TYPEFORM_API_URL}/me`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return {
        success: true,
        message: 'Connected to Typeform successfully',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Typeform connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Sync data from Typeform (fetch forms and responses)
   */
  async syncData(integration: any, options?: any): Promise<any> {
    try {
      const apiKey = integration.credentials?.apiKey || this.configService.get<string>('TYPEFORM_API_KEY');

      if (!apiKey) {
        throw new BadRequestException('API key not configured');
      }

      const syncType = options?.type || 'responses';

      if (syncType === 'forms') {
        // Fetch all forms
        const response = await axios.get(`${this.TYPEFORM_API_URL}/forms`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        return {
          records: response.data.items || [],
          hasMore: false,
        };
      } else if (syncType === 'responses' && options?.formId) {
        // Fetch responses for a specific form
        return await this.getFormResponses(options.formId);
      }

      return { records: [], hasMore: false };
    } catch (error) {
      this.logger.error(`Typeform sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  /**
   * Handle Typeform webhook
   */
  async handleWebhook(integration: any, payload: TypeformWebhookPayload | any): Promise<any> {
    this.logger.log(`Processing Typeform webhook: ${payload.event_type || 'unknown'}`);

    if (payload.event_type !== 'form_response') {
      this.logger.warn(`Unsupported event type: ${payload.event_type}`);
      return { status: 'ignored' };
    }

    const formResponse = payload.form_response;

    // Extract contact information from answers
    const contactData = this.extractContactData(formResponse.answers);

    // Build metadata
    const metadata = {
      formId: formResponse.form_id,
      formTitle: formResponse.definition.title,
      submittedAt: formResponse.submitted_at,
      responseToken: formResponse.token,
      score: formResponse.calculated?.score,
    };

    return {
      status: 'processed',
      contact: contactData,
      metadata,
      answers: formResponse.answers,
    };
  }

  /**
   * Extract contact information from form answers
   */
  private extractContactData(answers: TypeformAnswer[]): any {
    const contactData: any = {
      source: 'typeform',
      customFields: {},
    };

    answers.forEach(answer => {
      const fieldRef = answer.field.ref.toLowerCase();
      const fieldType = answer.type;

      // Map common field types to contact fields
      if (fieldRef.includes('email') || fieldType === 'email') {
        contactData.email = answer.email;
      } else if (fieldRef.includes('name') || fieldRef.includes('first')) {
        contactData.firstName = answer.text;
      } else if (fieldRef.includes('last')) {
        contactData.lastName = answer.text;
      } else if (fieldRef.includes('phone') || fieldType === 'phone_number') {
        contactData.phone = answer.phone_number;
      } else if (fieldRef.includes('company')) {
        contactData.companyName = answer.text;
      } else {
        // Store other fields as custom fields
        contactData.customFields[answer.field.ref] = this.extractAnswerValue(answer);
      }
    });

    return contactData;
  }

  /**
   * Extract answer value based on type
   */
  private extractAnswerValue(answer: TypeformAnswer): any {
    switch (answer.type) {
      case 'text':
      case 'email':
        return answer.text || answer.email;
      case 'number':
        return answer.number;
      case 'boolean':
        return answer.boolean;
      case 'choice':
        return answer.choice?.label;
      case 'choices':
        return answer.choices?.labels;
      case 'date':
        return answer.date;
      case 'url':
        return answer.url;
      case 'file_url':
        return answer.file_url;
      case 'payment':
        return {
          amount: answer.payment?.amount,
          currency: answer.payment?.currency,
        };
      default:
        return answer.text;
    }
  }

  /**
   * Get form details from Typeform API
   */
  async getFormDetails(formId: string, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.get(`${this.TYPEFORM_API_URL}/forms/${formId}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get form details: ${error.message}`);
      throw new BadRequestException('Failed to fetch Typeform details');
    }
  }

  /**
   * Get form responses
   */
  async getFormResponses(formId: string, limit: number = 25, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.get(`${this.TYPEFORM_API_URL}/forms/${formId}/responses`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        params: {
          page_size: limit,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get form responses: ${error.message}`);
      throw new BadRequestException('Failed to fetch Typeform responses');
    }
  }

  /**
   * Create webhook subscription
   */
  async createWebhook(formId: string, webhookUrl: string, tag?: string, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.put(
        `${this.TYPEFORM_API_URL}/forms/${formId}/webhooks/${tag || 'slackcrm'}`,
        {
          url: webhookUrl,
          enabled: true,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create webhook: ${error.message}`);
      throw new BadRequestException('Failed to create Typeform webhook');
    }
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhook(formId: string, tag: string = 'slackcrm', apiKey?: string): Promise<void> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      await axios.delete(`${this.TYPEFORM_API_URL}/forms/${formId}/webhooks/${tag}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      this.logger.log(`Webhook deleted for form ${formId}`);
    } catch (error) {
      this.logger.error(`Failed to delete webhook: ${error.message}`);
      throw new BadRequestException('Failed to delete Typeform webhook');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature: string, payload: string, secret: string): boolean {
    // Typeform doesn't currently support webhook signatures
    // This is a placeholder for future implementation
    return true;
  }
}
