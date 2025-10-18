import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'image' | 'document';
  content: string;
  template?: {
    name: string;
    language: string;
    parameters?: any[];
  };
  media?: {
    url: string;
    caption?: string;
  };
}

export interface WhatsAppWebhook {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: {
            body: string;
          };
        }>;
      };
      field: string;
    }>;
  }>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';
  private accessToken: string;
  private phoneNumberId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
  }

  /**
   * Send a text message via WhatsApp Business API
   */
  async sendMessage(message: WhatsAppMessage): Promise<any> {
    try {
      if (!this.accessToken || !this.phoneNumberId) {
        throw new BadRequestException('WhatsApp credentials not configured');
      }

      const payload = this.buildMessagePayload(message);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/${this.phoneNumberId}/messages`,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`WhatsApp message sent to ${message.to}: ${response.data.messages[0].id}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a template message (for notifications)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    language: string = 'en',
    parameters: any[] = [],
  ): Promise<any> {
    return this.sendMessage({
      to,
      type: 'template',
      content: '',
      template: {
        name: templateName,
        language,
        parameters,
      },
    });
  }

  /**
   * Send a simple text message
   */
  async sendTextMessage(to: string, text: string): Promise<any> {
    return this.sendMessage({
      to,
      type: 'text',
      content: text,
    });
  }

  /**
   * Send an image message
   */
  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<any> {
    return this.sendMessage({
      to,
      type: 'image',
      content: '',
      media: {
        url: imageUrl,
        caption,
      },
    });
  }

  /**
   * Send a document message
   */
  async sendDocumentMessage(to: string, documentUrl: string, caption?: string): Promise<any> {
    return this.sendMessage({
      to,
      type: 'document',
      content: '',
      media: {
        url: documentUrl,
        caption,
      },
    });
  }

  /**
   * Handle incoming webhook from WhatsApp
   */
  async handleWebhook(webhook: WhatsAppWebhook): Promise<any> {
    try {
      this.logger.log('Received WhatsApp webhook');

      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          const { value } = change;

          if (value.messages) {
            for (const message of value.messages) {
              await this.processIncomingMessage(message, value.contacts?.[0]);
            }
          }
        }
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Failed to process WhatsApp webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify webhook (required by WhatsApp)
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'your_verify_token';

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('Webhook verification failed');
    return null;
  }

  /**
   * Mark a message as read
   */
  async markMessageAsRead(messageId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/${this.phoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to mark message as read: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build message payload based on type
   */
  private buildMessagePayload(message: WhatsAppMessage): any {
    const basePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.to,
    };

    switch (message.type) {
      case 'text':
        return {
          ...basePayload,
          type: 'text',
          text: {
            preview_url: false,
            body: message.content,
          },
        };

      case 'template':
        return {
          ...basePayload,
          type: 'template',
          template: {
            name: message.template!.name,
            language: {
              code: message.template!.language,
            },
            components: message.template!.parameters || [],
          },
        };

      case 'image':
        return {
          ...basePayload,
          type: 'image',
          image: {
            link: message.media!.url,
            caption: message.media!.caption,
          },
        };

      case 'document':
        return {
          ...basePayload,
          type: 'document',
          document: {
            link: message.media!.url,
            caption: message.media!.caption,
          },
        };

      default:
        throw new BadRequestException(`Unsupported message type: ${message.type}`);
    }
  }

  /**
   * Process incoming message from WhatsApp
   */
  private async processIncomingMessage(message: any, contact: any): Promise<void> {
    this.logger.log(`Processing message from ${message.from}: ${message.type}`);

    // Mark message as read
    await this.markMessageAsRead(message.id);

    // Here you can add logic to:
    // 1. Save message to database
    // 2. Create/update contact
    // 3. Trigger automated responses
    // 4. Notify team members via Slack

    if (message.type === 'text') {
      const text = message.text.body.toLowerCase();

      // Auto-respond to common queries
      if (text.includes('hello') || text.includes('hi')) {
        await this.sendTextMessage(
          message.from,
          `Hello! Thank you for contacting us. How can we help you today?`,
        );
      } else if (text.includes('pricing') || text.includes('price')) {
        await this.sendTextMessage(
          message.from,
          `Thank you for your interest in our pricing. A team member will get back to you shortly.`,
        );
      }
    }
  }

  /**
   * Send bulk messages (for campaigns)
   */
  async sendBulkMessages(recipients: string[], message: Omit<WhatsAppMessage, 'to'>): Promise<any[]> {
    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await this.sendMessage({
          ...message,
          to: recipient,
        });
        results.push({ recipient, success: true, messageId: result.messages[0].id });

        // Rate limiting: wait 1 second between messages
        await this.sleep(1000);
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get media URL from WhatsApp
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${mediaId}`, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }),
      );

      return response.data.url;
    } catch (error) {
      this.logger.error(`Failed to get media URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
