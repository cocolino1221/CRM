import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Contact, ContactStatus, ContactSource } from '../../database/entities/contact.entity';
import { Activity, ActivityType, ActivityDirection, ActivityOutcome } from '../../database/entities/activity.entity';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { User, UserStatus } from '../../database/entities/user.entity';
import { NotificationsService, CreateNotificationDto } from '../../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'image' | 'document' | 'video' | 'audio' | 'interactive';
  content: string;
  template?: {
    name: string;
    language: string;
    parameters?: any[];
  };
  media?: {
    url: string;
    caption?: string;
    filename?: string;
  };
  interactive?: {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
      button?: string;
      sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
    };
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
          interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
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
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Send a notification to all active users in a workspace.
   */
  private async notifyWorkspace(workspaceId: string, dto: Omit<CreateNotificationDto, 'userId'>): Promise<void> {
    try {
      const users = await this.userRepository.find({
        where: { workspaceId, status: UserStatus.ACTIVE },
        select: ['id'],
      });
      await Promise.all(
        users.map(u => this.notificationsService.create(workspaceId, { ...dto, userId: u.id }).catch(() => {})),
      );
    } catch (err) {
      this.logger.warn(`notifyWorkspace failed: ${err.message}`);
    }
  }

  private getCredentials(credentials?: Record<string, any>) {
    return {
      accessToken: credentials?.accessToken || this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '',
      phoneNumberId: credentials?.phoneNumberId || this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '',
    };
  }

  private async findIntegrationForPhone(phoneNumberId: string): Promise<Integration | null> {
    // Accept any non-disabled/non-expired integration — ACTIVE, PENDING, ERROR all work
    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP },
    });

    const usable = integrations.filter(
      i => i.status !== IntegrationStatus.DISABLED && i.status !== IntegrationStatus.EXPIRED && i.status !== IntegrationStatus.SUSPENDED,
    );

    // First try exact match on phoneNumberId
    for (const integration of usable) {
      const storedId = integration.credentials?.phoneNumberId
        || integration.config?.phoneNumberId
        || integration.config?.phoneId;
      if (storedId && storedId === phoneNumberId) return integration;
    }

    // Fall back to first usable integration
    if (usable.length > 0) return usable[0];

    // Last resort: any WhatsApp integration
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
      // Also try without + prefix
      contact = await this.contactRepository.findOne({ where: { workspaceId, phone: waId } });
    }

    if (!contact) {
      const nameParts = (profileName || '').trim().split(' ');
      const newContact = this.contactRepository.create();
      Object.assign(newContact, {
        workspaceId,
        ownerId,
        firstName: nameParts[0] || 'WhatsApp',
        lastName: nameParts.slice(1).join(' ') || 'Contact',
        phone,
        email: `${waId}@whatsapp.placeholder.invalid`,
        status: ContactStatus.LEAD,
        source: ContactSource.WHATSAPP,
      });
      contact = await this.contactRepository.save(newContact);
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
    } else if (message.type === 'interactive') {
      const reply = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
      messageBody = `[Button reply: ${reply}]`;
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

  /**
   * Save outbound message as activity so it shows in inbox
   */
  async saveOutboundActivity(
    to: string,
    messageBody: string,
    messageType: string,
    workspaceId: string,
    userId: string,
    whatsappMessageId?: string,
  ): Promise<void> {
    try {
      const phone = to.startsWith('+') ? to : `+${to}`;
      const contact = await this.contactRepository.findOne({ where: { workspaceId, phone } });
      // Also try without +
      const contact2 = contact || await this.contactRepository.findOne({ where: { workspaceId, phone: to } });

      const activity = this.activityRepository.create({
        workspaceId,
        contactId: contact2?.id || undefined,
        userId,
        type: ActivityType.WHATSAPP_MESSAGE,
        title: `WhatsApp to ${contact2 ? `${contact2.firstName} ${contact2.lastName}` : phone}`,
        description: messageBody,
        direction: ActivityDirection.OUTBOUND,
        outcome: ActivityOutcome.SUCCESSFUL,
        occurredAt: new Date(),
        metadata: {
          whatsappMessageId: whatsappMessageId || undefined,
          waId: to,
          messageType,
          messageStatus: 'sent',
        },
      });

      await this.activityRepository.save(activity);
    } catch (error) {
      this.logger.warn(`Failed to save outbound activity: ${error.message}`);
    }
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

  async sendDocumentMessage(to: string, documentUrl: string, caption?: string, filename?: string): Promise<any> {
    return this.sendMessage({ to, type: 'document', content: '', media: { url: documentUrl, caption, filename } });
  }

  async sendVideoMessage(to: string, videoUrl: string, caption?: string): Promise<any> {
    return this.sendMessage({ to, type: 'video', content: '', media: { url: videoUrl, caption } });
  }

  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: string,
    footer?: string,
  ): Promise<any> {
    return this.sendMessage({
      to,
      type: 'interactive',
      content: '',
      interactive: {
        type: 'button',
        ...(header ? { header: { type: 'text', text: header } } : {}),
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          buttons: buttons.slice(0, 3).map(b => ({ type: 'reply' as const, reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  async sendInteractiveList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    header?: string,
    footer?: string,
  ): Promise<any> {
    return this.sendMessage({
      to,
      type: 'interactive',
      content: '',
      interactive: {
        type: 'list',
        ...(header ? { header: { type: 'text', text: header } } : {}),
        body: { text: body },
        ...(footer ? { footer: { text: footer } } : {}),
        action: {
          button: buttonText,
          sections,
        },
      },
    });
  }

  async handleWebhook(webhook: WhatsAppWebhook): Promise<any> {
    try {
      this.logger.log(`Received WhatsApp webhook: ${JSON.stringify(webhook).substring(0, 200)}`);

      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          const { value } = change;

          // Handle message status updates (sent → delivered → read)
          if (value.statuses?.length) {
            for (const status of value.statuses) {
              await this.updateMessageStatus(status);
            }
          }

          if (!value.messages?.length) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          const integration = await this.findIntegrationForPhone(phoneNumberId);

          if (!integration) {
            this.logger.warn(`No WhatsApp integration found for phoneNumberId: ${phoneNumberId} — skipping message`);
            continue;
          }
          this.logger.log(`Processing message for integration ${integration.id} (workspace: ${integration.workspaceId}, status: ${integration.status})`);

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
            await this.autoRespond(message, profileName, integration);

            // Notify all workspace users about the new inbound message
            const senderName = profileName || contact.firstName || `+${message.from}`;
            const msgPreview = message.text?.body || message.type || 'media';
            await this.notifyWorkspace(integration.workspaceId, {
              type: NotificationType.WHATSAPP,
              title: 'New WhatsApp message',
              message: `${senderName}: ${msgPreview.substring(0, 80)}`,
              link: '/whatsapp',
            });
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
   * Update message status (sent → delivered → read) from webhook status callbacks
   */
  private async updateMessageStatus(status: { id: string; status: string; timestamp: string; recipient_id: string }): Promise<void> {
    try {
      const activity = await this.activityRepository.findOne({
        where: { metadata: { whatsappMessageId: status.id } as any },
      });
      if (activity && activity.metadata) {
        activity.metadata.messageStatus = status.status;
        await this.activityRepository.save(activity);
      }
    } catch (error) {
      // Silently ignore - status updates are best-effort
    }
  }

  private async autoRespond(message: any, profileName: string | undefined, integration: Integration): Promise<void> {
    if (message.type !== 'text' || !message.text) return;
    const text = message.text.body.toLowerCase();
    const name = profileName ? ` ${profileName.split(' ')[0]}` : '';
    const credentials = integration.credentials || {};

    // Use custom auto-responses if configured, otherwise use defaults
    const customRules: Array<{ keywords: string[]; response: string; enabled: boolean }> =
      integration.config?.autoResponses || [];

    if (customRules.length > 0) {
      for (const rule of customRules) {
        if (rule.enabled === false) continue;
        const matches = (rule.keywords || []).some((kw: string) => text.includes(kw.toLowerCase()));
        if (matches) {
          const reply = rule.response.replace('{{name}}', name);
          try {
            await this.sendTextMessage(message.from, reply, credentials);
          } catch (err) {
            this.logger.warn(`Auto-respond failed: ${err.message}`);
          }
          return;
        }
      }
    } else if (integration.config?.autoRespondEnabled !== false) {
      // Default responses (only if not explicitly disabled)
      let reply: string | null = null;
      if (text.includes('hello') || text.includes('hi') || text.includes('hey') || text.includes('salut') || text.includes('buna')) {
        reply = `Hello${name}! Thank you for contacting us. How can we help you today?`;
      } else if (text.includes('pricing') || text.includes('price') || text.includes('cost') || text.includes('pret')) {
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
  }

  async getAutoResponses(workspaceId: string): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return {
      enabled: integration?.config?.autoRespondEnabled !== false,
      rules: integration?.config?.autoResponses || [],
    };
  }

  async saveAutoResponses(workspaceId: string, enabled: boolean, rules: any[]): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    integration.config = {
      ...(integration.config || {}),
      autoRespondEnabled: enabled,
      autoResponses: rules,
    };
    await this.integrationRepository.save(integration);
  }

  async verifyWebhookToken(mode: string, token: string, challenge: string): Promise<string | null> {
    if (mode !== 'subscribe') return null;

    const envToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (envToken && token === envToken) return challenge;

    // Accept any WhatsApp integration (not just ACTIVE) for token verification
    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP },
    });
    for (const integration of integrations) {
      const storedToken = integration.credentials?.verifyToken || integration.config?.verifyToken;
      if (storedToken && token === storedToken) return challenge;
    }

    this.logger.warn('Webhook verification failed: token mismatch');
    return null;
  }

  /**
   * Returns webhook configuration for display in the UI
   */
  async getWebhookSetupInfo(appUrl: string, workspaceId?: string): Promise<any> {
    const envToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    // Strip any trailing /api/v1 or /api so APP_URL can be set with or without the path suffix
    const baseUrl = appUrl.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const webhookUrl = `${baseUrl}/api/v1/integrations/whatsapp/webhook`;

    let integrationToken: string | null = null;
    let integrationTokenFull: string | null = null;
    if (workspaceId) {
      const integration = await this.integrationRepository.findOne({
        where: { type: IntegrationType.WHATSAPP, workspaceId },
      });
      integrationToken = integration?.config?.verifyToken || integration?.credentials?.verifyToken || null;
      if (integrationToken) {
        integrationTokenFull = integrationToken; // Return full token so user can copy it into Meta
      }
    }

    const activeToken = integrationToken || envToken;
    return {
      webhookUrl,
      verifyTokenConfigured: !!activeToken,
      // Show hint of env token (we don't expose it fully), but DO expose the integration-stored one
      verifyTokenHint: activeToken ? (integrationTokenFull || `${envToken!.substring(0, 4)}...`) : null,
      // If there's an integration-stored token, the user can see the full value to copy
      verifyTokenExact: integrationTokenFull,
      instructions: [
        '1. Go to Meta for Developers → Your App → WhatsApp → Configuration',
        `2. Set Callback URL to: ${webhookUrl}`,
        '3. Set Verify Token to the value shown below',
        '4. Click "Verify and Save"',
        '5. Under Webhook fields, subscribe to: messages',
        '6. Switch your Meta app to Live mode (App Settings → Basic → Status)',
      ],
    };
  }

  /**
   * Save a custom verify token for this workspace's WhatsApp integration
   */
  async setVerifyToken(workspaceId: string, token: string): Promise<void> {
    if (!token || token.length < 8) {
      throw new BadRequestException('Verify token must be at least 8 characters');
    }
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    integration.config = {
      ...(integration.config || {}),
      verifyToken: token,
    };
    await this.integrationRepository.save(integration);
    this.logger.log(`Verify token updated for workspace ${workspaceId}`);
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
      case 'text': return { ...base, type: 'text', text: { preview_url: true, body: message.content } };
      case 'template': return {
        ...base, type: 'template',
        template: { name: message.template!.name, language: { code: message.template!.language }, components: message.template!.parameters || [] },
      };
      case 'image': return { ...base, type: 'image', image: { link: message.media!.url, caption: message.media!.caption } };
      case 'document': return {
        ...base, type: 'document',
        document: { link: message.media!.url, caption: message.media!.caption, filename: message.media!.filename },
      };
      case 'video': return { ...base, type: 'video', video: { link: message.media!.url, caption: message.media!.caption } };
      case 'audio': return { ...base, type: 'audio', audio: { link: message.media!.url } };
      case 'interactive': return { ...base, type: 'interactive', interactive: message.interactive };
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

  /**
   * List message templates from Meta (requires WABA ID)
   */
  async listTemplates(workspaceId: string): Promise<any[]> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    const { accessToken } = this.getCredentials(integration?.credentials);
    const wabaId = integration?.credentials?.wabaId || integration?.config?.wabaId
      || this.configService.get<string>('WHATSAPP_WABA_ID');
    if (!wabaId) return [];
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.warn(`Failed to fetch templates: ${error.message}`);
      return [];
    }
  }

  /**
   * Create/submit a message template to Meta for approval
   */
  async createTemplate(workspaceId: string, template: {
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>;
  }): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    const { accessToken } = this.getCredentials(integration?.credentials);
    const wabaId = integration?.credentials?.wabaId || integration?.config?.wabaId
      || this.configService.get<string>('WHATSAPP_WABA_ID');
    if (!wabaId) throw new BadRequestException('WABA ID not configured. Add it in your WhatsApp integration settings.');
    if (!accessToken) throw new BadRequestException('WhatsApp access token not configured');

    const components: any[] = [];
    if (template.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: template.headerText });
    }
    components.push({ type: 'BODY', text: template.bodyText });
    if (template.footerText) {
      components.push({ type: 'FOOTER', text: template.footerText });
    }
    if (template.buttons?.length) {
      components.push({
        type: 'BUTTONS',
        buttons: template.buttons.map(b => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
          return { type: b.type, text: b.text };
        }),
      });
    }

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiUrl}/${wabaId}/message_templates`,
        { name: template.name, language: template.language, category: template.category, components },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      ),
    );
    return response.data;
  }

  /**
   * Delete a template from Meta
   */
  async deleteTemplate(workspaceId: string, templateName: string): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    const { accessToken } = this.getCredentials(integration?.credentials);
    const wabaId = integration?.credentials?.wabaId || integration?.config?.wabaId
      || this.configService.get<string>('WHATSAPP_WABA_ID');
    if (!wabaId) throw new BadRequestException('WABA ID not configured');
    const response = await firstValueFrom(
      this.httpService.delete(
        `${this.apiUrl}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );
    return response.data;
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

  /**
   * Get WhatsApp Business API limits info
   */
  getApiLimits(): any {
    return {
      messaging: {
        businessInitiated: '1,000 unique contacts/24h (Tier 1). Scales to 10K, 100K, unlimited with quality.',
        userInitiated: 'Unlimited within 24h window',
        templateMessages: 'Must be pre-approved by Meta. Marketing, Utility, or Authentication category.',
        sessionWindow: '24 hours from last customer message for free-form replies',
      },
      media: {
        image: { maxSize: '5 MB', formats: 'JPEG, PNG' },
        video: { maxSize: '16 MB', formats: 'MP4, 3GPP' },
        audio: { maxSize: '16 MB', formats: 'AAC, MP4, MPEG, AMR, OGG' },
        document: { maxSize: '100 MB', formats: 'PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT' },
      },
      interactive: {
        buttons: { max: 3, titleMaxLength: 20 },
        list: { maxSections: 10, maxRowsPerSection: 10, rowTitleMaxLength: 24 },
      },
      rateLimit: '80 messages/second per phone number',
      pricing: 'Business-initiated: ~$0.05-0.15/msg. User-initiated: ~$0.01-0.05/msg. Varies by country.',
    };
  }

  // ─── Contact Auto-Send ──────────────────────────────────────────────────────

  /**
   * Get auto-send config for this workspace
   */
  async getAutoSend(workspaceId: string): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return integration?.config?.autoSend || {
      enabled: false,
      templateName: 'hello_world',
      language: 'en',
      includeNameParam: true,
      conditions: { sources: [], statuses: [], requirePhone: true },
    };
  }

  /**
   * Save auto-send config for this workspace
   */
  async saveAutoSend(workspaceId: string, config: any): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    integration.config = { ...(integration.config || {}), autoSend: config };
    await this.integrationRepository.save(integration);
    this.logger.log(`Auto-send config updated for workspace ${workspaceId}`);
  }

  // ─── Bulk / Broadcast ───────────────────────────────────────────────────────

  /**
   * Send an approved template message to all contacts matching a filter.
   * filter.tags: contact must have ALL specified tags
   * filter.status: contact status must be IN the list
   * filter.source: contact source must be IN the list
   */
  async broadcastTemplate(
    workspaceId: string,
    filter: { tags?: string[]; status?: string[]; source?: string[] },
    template: { name: string; language: string; params?: any[] },
  ): Promise<{ total: number; sent: number; failed: number; results: any[] }> {
    const where: any = { workspaceId };
    if (filter.status?.length) where.status = In(filter.status);
    if (filter.source?.length) where.source = In(filter.source);

    let contacts = await this.contactRepository.find({ where, take: 1000 });

    // Filter by tags in memory (simple-array columns don't support SQL LIKE easily)
    if (filter.tags?.length) {
      contacts = contacts.filter(c => {
        const contactTags = c.tags || [];
        return filter.tags!.every(t => contactTags.includes(t));
      });
    }

    // Only contacts that have a phone number
    contacts = contacts.filter(c => c.phone);

    const results: any[] = [];
    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      const phone = contact.phone!.replace(/[^0-9+]/g, '');
      try {
        const msgResult = await this.sendTemplateMessage(phone, template.name, template.language, template.params || []);
        const msgId = msgResult?.messages?.[0]?.id;
        await this.saveOutboundActivity(phone, `[Broadcast template: ${template.name}]`, 'template', workspaceId, contact.ownerId || '', msgId);
        results.push({ phone, contactId: contact.id, success: true });
        sent++;
      } catch (err) {
        results.push({ phone, contactId: contact.id, success: false, error: err.message });
        failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.logger.log(`Broadcast "${template.name}" to ${sent}/${contacts.length} contacts in workspace ${workspaceId}`);
    return { total: contacts.length, sent, failed, results };
  }

  /**
   * Import contacts from CSV rows and optionally send a template to each.
   * rows: { phone, firstName?, lastName?, tags? }[]
   * options.addTags: tags to add to every imported contact
   * options.sendTemplate: if set, sends template after import
   */
  async csvImportAndSend(
    workspaceId: string,
    ownerId: string,
    rows: Array<{ phone: string; firstName?: string; lastName?: string; tags?: string[] }>,
    options: { addTags?: string[]; sendTemplate?: { name: string; language: string; params?: any[] } },
  ): Promise<{ imported: number; created: number; updated: number; sent: number; failed: number; results: any[] }> {
    let created = 0;
    let updated = 0;
    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const row of rows) {
      const rawPhone = (row.phone || '').trim();
      if (!rawPhone) { results.push({ phone: rawPhone, status: 'skipped', reason: 'empty phone' }); continue; }

      // Normalise: ensure + prefix
      const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone.replace(/[^0-9]/g, '')}`;

      let contact = await this.contactRepository.findOne({ where: { workspaceId, phone } });
      if (!contact) contact = await this.contactRepository.findOne({ where: { workspaceId, phone: rawPhone } });

      let isNew = false;
      if (!contact) {
        contact = this.contactRepository.create();
        Object.assign(contact, {
          workspaceId,
          ownerId,
          firstName: row.firstName || 'Contact',
          lastName: row.lastName || '',
          phone,
          email: `${rawPhone.replace(/[^0-9]/g, '')}@whatsapp.placeholder.invalid`,
          status: ContactStatus.LEAD,
          source: ContactSource.WHATSAPP,
        });
        isNew = true;
      } else {
        if (row.firstName) contact.firstName = row.firstName;
        if (row.lastName) contact.lastName = row.lastName;
      }

      // Merge tags
      const existingTags: string[] = contact.tags || [];
      const newTags = [...(row.tags || []), ...(options.addTags || [])];
      const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
      if (mergedTags.length) contact.tags = mergedTags;

      contact = await this.contactRepository.save(contact);
      if (isNew) { created++; } else { updated++; }

      const resultEntry: any = { phone, contactId: contact.id, status: isNew ? 'created' : 'updated' };

      if (options.sendTemplate) {
        try {
          const msgResult = await this.sendTemplateMessage(phone, options.sendTemplate.name, options.sendTemplate.language, options.sendTemplate.params || []);
          const msgId = msgResult?.messages?.[0]?.id;
          await this.saveOutboundActivity(phone, `[CSV import template: ${options.sendTemplate.name}]`, 'template', workspaceId, ownerId, msgId);
          resultEntry.sent = true;
          sent++;
        } catch (err) {
          resultEntry.sent = false;
          resultEntry.sendError = err.message;
          failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      results.push(resultEntry);
    }

    this.logger.log(`CSV import: ${created} created, ${updated} updated, ${sent} sent in workspace ${workspaceId}`);
    return { imported: created + updated, created, updated, sent, failed, results };
  }

  /**
   * Listen for contact creation events and auto-send WhatsApp template if configured
   */
  @OnEvent('contact.created')
  async handleContactCreated(payload: { contact: any; workspaceId: string }): Promise<void> {
    const { contact, workspaceId } = payload;
    try {
      // Always notify workspace users about the new contact/lead
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'New contact';
      await this.notifyWorkspace(workspaceId, {
        type: NotificationType.LEAD,
        title: 'New lead added',
        message: `${fullName} was added${contact.source ? ` via ${contact.source}` : ''}`,
        link: '/contacts',
      });

      const integration = await this.integrationRepository.findOne({
        where: { type: IntegrationType.WHATSAPP, workspaceId },
      });
      if (!integration) return;

      const autoSend = integration.config?.autoSend;
      if (!autoSend?.enabled) return;

      // Check conditions
      const conditions = autoSend.conditions || {};

      // Phone is required for WhatsApp — strip all non-digits; `+40712` → `40712`
      const rawPhone = contact.phone || '';
      const phone = rawPhone.replace(/[^0-9]/g, '');
      if (!phone || phone.length < 10) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: no phone or too short ("${rawPhone}")`);
        return;
      }

      // Filter by source (if any sources are specified)
      if (conditions.sources?.length > 0 && !conditions.sources.includes(contact.source)) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: source "${contact.source}" not in [${conditions.sources.join(',')}]`);
        return;
      }

      // Filter by status (if any statuses are specified)
      if (conditions.statuses?.length > 0 && !conditions.statuses.includes(contact.status)) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: status "${contact.status}" not in [${conditions.statuses.join(',')}]`);
        return;
      }

      // Send template
      const templateName = autoSend.templateName || 'hello_world';
      const language = autoSend.language || 'en';
      const params: any[] = [];
      if (autoSend.includeNameParam && contact.firstName) {
        params.push({ type: 'body', parameters: [{ type: 'text', text: contact.firstName }] });
      }

      this.logger.log(`Auto-send: template="${templateName}" to phone="${phone}" (raw="${rawPhone}") contact=${contact.id} source=${contact.source}`);
      await this.sendTemplateMessage(phone, templateName, language, params);
      this.logger.log(`Auto-send SUCCESS: template "${templateName}" sent to ${phone} for contact ${contact.id}`);
    } catch (err) {
      this.logger.warn(`Auto-send FAILED for contact ${payload.contact?.id}: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // ─── Conversation Assignments ────────────────────────────────────────────────

  /**
   * Returns { [waId]: { userId, userName, color, assignedAt } } for this workspace
   */
  async getConversationAssignments(workspaceId: string): Promise<Record<string, any>> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return integration?.config?.conversationAssignments || {};
  }

  /**
   * Assign (or unassign) a user to a conversation.
   * Passing userId=null removes the assignment.
   */
  async assignConversation(
    workspaceId: string,
    waId: string,
    assignment: { userId: string | null; userName: string; color: string } | null,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const current = integration.config?.conversationAssignments || {};
    if (assignment) {
      current[waId] = { ...assignment, assignedAt: new Date().toISOString() };
    } else {
      delete current[waId];
    }
    integration.config = { ...(integration.config || {}), conversationAssignments: current };
    await this.integrationRepository.save(integration);
  }

  /**
   * Delete all WhatsApp activities for a specific waId (phone number) in a workspace.
   * This removes the conversation from the inbox.
   */
  async deleteConversation(workspaceId: string, waId: string): Promise<{ deleted: number }> {
    const result = await this.activityRepository
      .createQueryBuilder()
      .delete()
      .where(
        `workspace_id = :workspaceId AND type = :type AND metadata->>'waId' = :waId`,
        { workspaceId, type: ActivityType.WHATSAPP_MESSAGE, waId },
      )
      .execute();
    return { deleted: result.affected || 0 };
  }
}
