import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ContactsService } from '../../contacts/contacts.service';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { ContactSource, ContactStatus } from '../../database/entities/contact.entity';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

/**
 * ManyChat integration handler
 *
 * Supports inbound webhook (External Request block → CRM contact creation)
 * and outbound API calls (trigger flows, send messages to subscribers).
 *
 * Webhook payload format (ManyChat External Request block):
 * {
 *   "id": "1234567890",         // ManyChat subscriber ID
 *   "key": "optional_secret",   // optional security key
 *   "first_name": "John",
 *   "last_name": "Doe",
 *   "phone": "+40712345678",    // or in custom_fields
 *   "locale": "en_US",
 *   "timezone": "UTC",
 *   "custom_fields": {          // any custom fields mapped in ManyChat
 *     "email": "john@example.com",
 *     "phone": "+40712345678",
 *     "company": "Acme",
 *     "job_title": "CEO"
 *   }
 * }
 */
@Injectable()
export class ManyChatIntegrationHandler {
  private readonly logger = new Logger(ManyChatIntegrationHandler.name);
  private readonly MANYCHAT_API_URL = 'https://api.manychat.com';

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => ContactsService))
    private contactsService: ContactsService,
    @Inject(forwardRef(() => WhatsAppService))
    private whatsAppService: WhatsAppService,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private pipelineStageRepository: Repository<PipelineStage>,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
  ) {}

  /**
   * Test connection by calling the ManyChat /fb/page endpoint
   */
  async testConnection(integration: any): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const apiKey = this.getApiKey(integration);
      if (!apiKey) {
        return { success: false, message: 'API key not configured. Add your ManyChat API key in the integration settings.' };
      }

      const response = await axios.get(`${this.MANYCHAT_API_URL}/fb/page`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      });

      const pageName = response.data?.data?.name;
      return {
        success: true,
        message: `Connected to ManyChat page: ${pageName || 'unknown'}`,
        data: response.data?.data,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }

  /**
   * Handle inbound webhook from ManyChat External Request block.
   * Creates or updates a CRM contact from the subscriber data.
   */
  async handleWebhook(integration: any, payload: any): Promise<any> {
    this.logger.log(`ManyChat webhook received for workspace ${integration.workspaceId}`);

    // Unwrap subscriber object if nested (some setups wrap in { subscriber: {...} })
    const subscriber = payload.subscriber || payload;

    // Optional: verify security key
    const securityKey = integration.config?.securityKey || integration.credentials?.securityKey;
    if (securityKey && payload.key && payload.key !== securityKey) {
      this.logger.warn('ManyChat webhook: security key mismatch — rejecting');
      return { status: 'error', message: 'Invalid security key' };
    }

    // Extract core fields
    const subscriberId: string = String(subscriber.id || '');
    const firstName: string = subscriber.first_name || '';
    const lastName: string = subscriber.last_name || '';
    const customFields: Record<string, any> = subscriber.custom_fields || {};

    // Resolve phone and email (can be top-level or in custom_fields)
    const phone: string = subscriber.phone || customFields.phone || customFields.Phone || '';
    const email: string = subscriber.email || customFields.email || customFields.Email || '';

    if (!email && !phone) {
      this.logger.warn(`ManyChat webhook: subscriber ${subscriberId} has no email or phone — skipping`);
      return { status: 'skipped', message: 'No email or phone to identify contact' };
    }

    // Build customFields stored on the contact
    const contactCustomFields: Record<string, any> = {
      ...customFields,
      manychatSubscriberId: subscriberId,
      manychatMetadata: {
        subscriberId,
        locale: subscriber.locale,
        timezone: subscriber.timezone,
        gender: subscriber.gender,
        lastInputText: subscriber.last_input_text,
        subscribedAt: subscriber.subscribed,
        liveChatUrl: subscriber.live_chat_url,
        syncedAt: new Date().toISOString(),
      },
    };

    // Determine pipeline to use
    const workspaceId: string = integration.workspaceId;
    let pipelineId: string | undefined = integration.config?.pipelineId;
    let pipelineStageId: string | undefined = integration.config?.pipelineStageId;

    if (!pipelineId) {
      const defaultPipeline = await this.pipelineRepository.findOne({
        where: { workspaceId, isDefault: true },
        relations: ['stages'],
      });
      if (defaultPipeline) {
        pipelineId = defaultPipeline.id;
        if (!pipelineStageId && defaultPipeline.stages?.length > 0) {
          pipelineStageId = defaultPipeline.stages[0].id;
        }
      }
    }

    try {
      const contact = await this.contactsService.create(workspaceId, {
        firstName: firstName || 'ManyChat',
        lastName: lastName || 'Subscriber',
        email: email || undefined,
        phone: phone || undefined,
        jobTitle: customFields.job_title || customFields.jobTitle || undefined,
        status: ContactStatus.ACTIVE,
        source: ContactSource.MANYCHAT,
        customFields: contactCustomFields,
        tags: ['manychat', ...(integration.config?.tags || [])],
        pipelineId,
        pipelineStageId,
        notes: `Contact from ManyChat${subscriber.last_input_text ? ` — last message: "${subscriber.last_input_text}"` : ''}`,
      } as any);

      this.logger.log(`ManyChat: created contact ${contact.id} (${firstName} ${lastName} | ${email || phone})`);

      // Auto-send WhatsApp welcome message if enabled and phone present
      // Uses the WhatsApp integration's credentials (not global env vars)
      let whatsAppSent = false;
      const whatsappConfig = integration.config?.whatsApp;
      if (whatsappConfig?.enabled && phone) {
        try {
          const cleanPhone = phone.replace(/[^0-9]/g, '');
          if (cleanPhone.length >= 7) {
            const templateName = whatsappConfig.templateName || 'hello_world';
            const rawLang = whatsappConfig.language || 'en_US';
            const language = rawLang === 'en' ? 'en_US' : rawLang;
            // Skip name param for hello_world (it has 0 params — Meta #132000 error)
            const params: any[] = [];
            if (whatsappConfig.includeNameParam && firstName && templateName !== 'hello_world') {
              params.push({ type: 'body', parameters: [{ type: 'text', text: firstName }] });
            }
            // Get WhatsApp integration credentials
            const waIntegration = await this.integrationRepository.findOne({
              where: { type: IntegrationType.WHATSAPP, workspaceId },
            });
            if (waIntegration?.credentials) {
              await this.whatsAppService.sendMessageWithCredentials(waIntegration.credentials, {
                to: cleanPhone,
                type: 'template',
                content: '',
                template: { name: templateName, language, parameters: params },
              });
              whatsAppSent = true;
              this.logger.log(`ManyChat: WhatsApp auto-send SUCCESS to ${cleanPhone}`);
            } else {
              this.logger.warn('ManyChat: No WhatsApp integration credentials found');
            }
          }
        } catch (err) {
          const metaError = err.response?.data?.error;
          this.logger.warn(`ManyChat: WhatsApp auto-send failed: ${metaError?.message || err.message}`);
        }
      }

      return {
        status: 'success',
        contactId: contact.id,
        action: 'created',
        whatsAppSent,
      };
    } catch (error) {
      this.logger.error(`ManyChat: failed to create contact: ${error.message}`);

      if (error.message?.includes('already exists')) {
        return {
          status: 'duplicate',
          message: 'Contact already exists',
          email: email || phone,
        };
      }

      return { status: 'error', message: error.message };
    }
  }

  /**
   * Sync — ManyChat doesn't expose bulk subscriber export in most plans.
   * Just validates the API connection and returns page info.
   */
  async syncData(integration: any, _options?: any): Promise<any> {
    return this.testConnection(integration);
  }

  // ─── Outbound API helpers ───────────────────────────────────

  /**
   * Trigger a ManyChat flow for a specific subscriber
   * @param apiKey - ManyChat API key
   * @param subscriberId - ManyChat subscriber ID (stored in contact.customFields.manychatSubscriberId)
   * @param flowNs - Flow namespace (from ManyChat flow URL, e.g. "content20211021175758_123456")
   */
  async triggerFlow(apiKey: string, subscriberId: string, flowNs: string): Promise<any> {
    const response = await axios.post(
      `${this.MANYCHAT_API_URL}/fb/sending/sendFlow`,
      { subscriber_id: subscriberId, flow_ns: flowNs },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );
    return response.data;
  }

  /**
   * Send a text message to a ManyChat subscriber
   */
  async sendTextToSubscriber(apiKey: string, subscriberId: string, text: string): Promise<any> {
    const response = await axios.post(
      `${this.MANYCHAT_API_URL}/fb/sending/sendContent`,
      {
        subscriber_id: subscriberId,
        data: {
          version: 'v2',
          content: {
            messages: [{ type: 'text', text }],
            actions: [],
            quick_replies: [],
          },
        },
        message_tag: 'ACCOUNT_UPDATE',
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    );
    return response.data;
  }

  /**
   * Get ManyChat subscriber info by ID
   */
  async getSubscriberInfo(apiKey: string, subscriberId: string): Promise<any> {
    const response = await axios.get(
      `${this.MANYCHAT_API_URL}/fb/subscriber/getInfo?subscriber_id=${subscriberId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return response.data;
  }

  /**
   * Find ManyChat subscriber by phone number
   */
  async findSubscriberByPhone(apiKey: string, phone: string): Promise<any> {
    const response = await axios.get(
      `${this.MANYCHAT_API_URL}/fb/subscriber/findBySystemField?field=phone&value=${encodeURIComponent(phone)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    return response.data;
  }

  private getApiKey(integration: any): string {
    return (
      integration.credentials?.apiKey ||
      integration.credentials?.apiToken ||
      integration.config?.apiKey ||
      integration.config?.apiToken ||
      this.configService.get<string>('MANYCHAT_API_KEY') ||
      ''
    );
  }
}
