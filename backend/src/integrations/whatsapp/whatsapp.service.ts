import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Contact, ContactStatus, ContactSource } from '../../database/entities/contact.entity';
import { Activity, ActivityType, ActivityDirection, ActivityOutcome } from '../../database/entities/activity.entity';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';

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
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; caption?: string };
          document?: { id: string; filename: string; mime_type: string; sha256: string; caption?: string };
          audio?: { id: string; mime_type: string };
          video?: { id: string; mime_type: string; sha256: string; caption?: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
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

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private getCredentials(credentials?: Record<string, any>) {
    return {
      accessToken: credentials?.accessToken || this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '',
      phoneNumberId: credentials?.phoneNumberId || this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '',
    };
  }

  private async findIntegrationForPhone(phoneNumberId: string): Promise<Integration | null> {
    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP, status: IntegrationStatus.ACTIVE },
    });
    for (const integration of integrations) {
      const storedId = integration.credentials?.phoneNumberId || integration.config?.phoneNumberId;
      if (storedId === phoneNumberId) return integration;
    }
    return integrations[0] || null;
  }

  private async findOrCreateContact(
    waId: string,
    profileName: string | undefined,
    workspaceId: string,
    ownerId: string,
  ): Promise<Contact> {
    const phone = `+${waId}`;
    let contact = await this.contactRepository.findOne({ where: { workspaceId, phone } });

    if (!contact) {
      const nameParts = (profileName || '').trim().split(' ');
      contact = this.contactRepository.create({
        workspaceId,
        ownerId,
        firstName: nameParts[0] || 'WhatsApp',
        lastName: nameParts.slice(1).join(' ') || 'Contact',
        phone,
        status: ContactStatus.LEAD,
        source: ContactSource.WHATSAPP,
        metadata: { whatsappId: waId },
      });
      contact = await this.contactRepository.save(contact);
      this.logger.log(`Created new contact from WhatsApp: ${phone}`);
    }

    return contact;
  }

  private async saveMessageActivity(
    contact: Contact,
    message: any,
    workspaceId: string,
    ownerId: string,
  ): Promise<void> {
    let messageBody = '';
    if (message.type === 'text' && message.text) {
      messageBody = message.text.body;
    } else if (message.type === 'image') {
      messageBody = `[Image] ${message.image?.caption || ''}`.trim();
    } else if (message.type === 'document') {
      messageBody = `[Document: ${message.document?.filename || 'file'}] ${message.document?.caption || ''}`.trim();
    } else if (message.type === 'audio') {
      messageBody = '[Voice message]';
    } else if (message.type === 'video') {
      messageBody = `[Video] ${message.video?.caption || ''}`.trim();
    } else {
      messageBody = `[${message.type}]`;
    }

    const activity = this.activityRepository.create({
      workspaceId,
      contactId: contact.id,
      userId: ownerId,
      type: ActivityType.WHATSAPP_MESSAGE,
      title: `WhatsApp from ${contact.firstName} ${contact.lastName}`,
      description: messageBody,
      direction: ActivityDirection.INBOUND,
      outcome: ActivityOutcome.SUCCESSFUL,
      occurredAt: new Date(parseInt(message.timestamp) * 1000),
      metadata: {
        whatsappMessageId: message.id,
        waId: message.from,
        messageType: message.type,
      },
    });

    await this.activityRepository.save(activity);
  }

  async sendMessageWithCredentials(credentials: Record<string, any>, message: WhatsAppMessage): Promise<any> {
    const { accessToken, phoneNumberId } = this.getCredentials(credentials);
    if (!accessToken || !phoneNumberId) throw new BadRequestException('WhatsApp credentials not configured');

    const payload = this.buildMessagePayload(message);
    const response = await firstValueFrom(
      this.httpService.post(`${this.apiUrl}/${phoneNumberId}/messages`, payload, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
    );
    return response.data;
  }

  async sendMessage(message: WhatsAppMessage): Promise<any> {
    try {
      return await this.sendMessageWithCredentials({}, message);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      throw error;
    }
  }

  async sendTemplateMessage(to: string, templateName: string, language = 'en', parameters: any[] = []): Promise<any> {
    return this.sendMessage({ to, type: 'template', content: '', template: { name: templateName, language, parameters } });
  }

  async sendTextMessage(to: string, text: string, credentials?: Record<string, any>): Promise<any> {
    const msg: WhatsAppMessage = { to, type: 'text', content: text };
    return credentials ? this.sendMessageWithCredentials(credentials, msg) : this.sendMessage(msg);
  }

  async sendImageMessage(to: string, imageUrl: string, caption?: string): Promise<any> {
    return this.sendMessage({ to, type: 'image', content: '', media: { url: imageUrl, caption } });
  }

  async sendDocumentMessage(to: string, documentUrl: string, caption?: string): Promise<any> {
    return this.sendMessage({ to, type: 'document', content: '', media: { url: documentUrl, caption } });
  }

  async handleWebhook(webhook: WhatsAppWebhook): Promise<any> {
    try {
      this.logger.log('Received WhatsApp webhook');

      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          const { value } = change;
          if (!value.messages?.length) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          const integration = await this.findIntegrationForPhone(phoneNumberId);

          if (!integration) {
            this.logger.warn(`No active WhatsApp integration found for phoneNumberId: ${phoneNumberId}`);
            continue;
          }

          const owner = await this.userRepository.findOne({
            where: { workspaceId: integration.workspaceId },
            order: { createdAt: 'ASC' },
          });
          const ownerId = owner?.id || integration.userId;

          for (const message of value.messages) {
            const contactProfile = value.contacts?.find(c => c.wa_id === message.from);
            const profileName = contactProfile?.profile?.name;

            const contact = await this.findOrCreateContact(
              message.from, profileName, integration.workspaceId, ownerId,
            );

            await this.saveMessageActivity(contact, message, integration.workspaceId, ownerId);
            await this.markMessageAsRead(message.id, integration.credentials);
            await this.autoRespond(message, profileName, integration.credentials || {});
          }
        }
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error(`Failed to process WhatsApp webhook: ${error.message}`);
      throw error;
    }
  }

  private async autoRespond(message: any, profileName: string | undefined, credentials: Record<string, any>): Promise<void> {
    if (message.type !== 'text' || !message.text) return;
    const text = message.text.body.toLowerCase();
    const name = profileName ? ` ${profileName.split(' ')[0]}` : '';
    let reply: string | null = null;

    if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
      reply = `Hello${name}! Thank you for contacting us. How can we help you today?`;
    } else if (text.includes('pricing') || text.includes('price') || text.includes('cost')) {
      reply = `Thank you for your interest${name}! A team member will get back to you with pricing details shortly.`;
    }

    if (reply) {
      try {
        await this.sendTextMessage(message.from, reply, credentials);
      } catch (err) {
        this.logger.warn(`Auto-respond failed: ${err.message}`);
      }
    }
  }

  async verifyWebhookToken(mode: string, token: string, challenge: string): Promise<string | null> {
    if (mode !== 'subscribe') return null;

    const envToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (envToken && token === envToken) return challenge;

    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP, status: IntegrationStatus.ACTIVE },
    });
    for (const integration of integrations) {
      const storedToken = integration.credentials?.verifyToken || integration.config?.verifyToken;
      if (storedToken && token === storedToken) return challenge;
    }

    this.logger.warn('Webhook verification failed: token mismatch');
    return null;
  }

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'your_verify_token';
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    return null;
  }

  async markMessageAsRead(messageId: string, credentials?: Record<string, any>): Promise<void> {
    try {
      const { accessToken, phoneNumberId } = this.getCredentials(credentials);
      if (!accessToken || !phoneNumberId) return;
      await firstValueFrom(
        this.httpService.post(
          `${this.apiUrl}/${phoneNumberId}/messages`,
          { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
        ),
      );
    } catch (error) {
      this.logger.warn(`Failed to mark message as read: ${error.message}`);
    }
  }

  private buildMessagePayload(message: WhatsAppMessage): any {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: message.to };
    switch (message.type) {
      case 'text': return { ...base, type: 'text', text: { preview_url: false, body: message.content } };
      case 'template': return {
        ...base, type: 'template',
        template: { name: message.template!.name, language: { code: message.template!.language }, components: message.template!.parameters || [] },
      };
      case 'image': return { ...base, type: 'image', image: { link: message.media!.url, caption: message.media!.caption } };
      case 'document': return { ...base, type: 'document', document: { link: message.media!.url, caption: message.media!.caption } };
      default: throw new BadRequestException(`Unsupported message type: ${message.type}`);
    }
  }

  async sendBulkMessages(recipients: string[], message: Omit<WhatsAppMessage, 'to'>): Promise<any[]> {
    const results = [];
    for (const recipient of recipients) {
      try {
        const result = await this.sendMessage({ ...message, to: recipient });
        results.push({ recipient, success: true, messageId: result.messages[0].id });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
    }
    return results;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const { accessToken } = this.getCredentials();
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/${mediaId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
    );
    return response.data.url;
  }

  async getGroups(): Promise<any[]> {
    try {
      const { accessToken, phoneNumberId } = this.getCredentials();
      if (!accessToken || !phoneNumberId) throw new BadRequestException('WhatsApp credentials not configured');
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${phoneNumberId}/groups`, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Failed to fetch groups: ${error.message}`);
      return [];
    }
  }

  async getGroupInfo(groupId: string): Promise<any> {
    const { accessToken, phoneNumberId } = this.getCredentials();
    if (!accessToken || !phoneNumberId) throw new BadRequestException('WhatsApp credentials not configured');
    const response = await firstValueFrom(
      this.httpService.get(`${this.apiUrl}/${phoneNumberId}/groups/${groupId}`, { headers: { 'Authorization': `Bearer ${accessToken}` } }),
    );
    return response.data;
  }

  async getWhatsAppActivities(workspaceId: string, limit = 50): Promise<Activity[]> {
    return this.activityRepository.find({
      where: { workspaceId, type: ActivityType.WHATSAPP_MESSAGE },
      relations: ['contact'],
      order: { occurredAt: 'DESC' },
      take: limit,
    });
  }
}
