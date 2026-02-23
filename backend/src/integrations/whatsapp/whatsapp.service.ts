import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
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
import { WhatsAppAIService } from './whatsapp-ai.service';
import { normalizePhoneDigits, normalizePhoneE164 } from '../../common/utils/phone.util';

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
    url?: string;
    id?: string;  // Meta media_id from upload
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
          reaction?: { message_id: string; emoji: string };
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

type AutoSendHeaderMediaType = 'image' | 'video' | 'document';

interface AutoSendConditions {
  sources?: string[];
  statuses?: string[];
  requirePhone?: boolean;
}

interface AutoSendConfig {
  enabled: boolean;
  templateName: string;
  language: string;
  includeNameParam: boolean;
  headerMediaType?: AutoSendHeaderMediaType;
  headerMediaId?: string;
  headerMediaUrl?: string;
  conditions: AutoSendConditions;
}

interface AutoSendRule extends AutoSendConfig {
  id: string;
  name: string;
  priority: number;
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
    private readonly whatsAppAIService: WhatsAppAIService,
    private readonly eventEmitter: EventEmitter2,
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

  private getDefaultAutoSendConfig(): AutoSendConfig {
    return {
      enabled: false,
      templateName: 'hello_world',
      language: 'en_US',
      includeNameParam: false,
      headerMediaType: undefined,
      headerMediaId: undefined,
      headerMediaUrl: undefined,
      conditions: { sources: [], statuses: [], requirePhone: true },
    };
  }

  private sanitizeStringArray(value: any): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry: any) => String(entry || '').trim())
      .filter((entry: string) => entry.length > 0);
  }

  private sanitizeAutoSendConfig(config: any): AutoSendConfig {
    const defaults = this.getDefaultAutoSendConfig();
    const headerMediaType = String(config?.headerMediaType || '').trim().toLowerCase();
    const isValidHeaderMediaType = ['image', 'video', 'document'].includes(headerMediaType);

    return {
      enabled: Boolean(config?.enabled),
      templateName: String(config?.templateName || defaults.templateName).trim() || defaults.templateName,
      language: String(config?.language || defaults.language).trim() || defaults.language,
      includeNameParam: Boolean(config?.includeNameParam),
      headerMediaType: isValidHeaderMediaType ? (headerMediaType as AutoSendHeaderMediaType) : undefined,
      headerMediaId: String(config?.headerMediaId || '').trim() || undefined,
      headerMediaUrl: String(config?.headerMediaUrl || '').trim() || undefined,
      conditions: {
        sources: this.sanitizeStringArray(config?.conditions?.sources),
        statuses: this.sanitizeStringArray(config?.conditions?.statuses),
        requirePhone: config?.conditions?.requirePhone !== false,
      },
    };
  }

  private ruleToAutoSendConfig(rule: AutoSendRule): AutoSendConfig {
    return this.sanitizeAutoSendConfig(rule);
  }

  private sanitizeAutoSendRule(rule: any, index = 0): AutoSendRule {
    const fallbackName = String(rule?.templateName || 'Auto-send').trim() || 'Auto-send';
    const baseConfig = this.sanitizeAutoSendConfig(rule);

    return {
      ...baseConfig,
      id: String(rule?.id || `rule_${Date.now()}_${index}`).trim() || `rule_${Date.now()}_${index}`,
      name: String(rule?.name || fallbackName).trim() || fallbackName,
      priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : index,
    };
  }

  private getAutoSendRulesFromConfig(config: any): AutoSendRule[] {
    const rawRules = Array.isArray(config?.autoSendRules) ? config.autoSendRules : [];
    if (rawRules.length > 0) {
      return rawRules
        .map((rule: any, index: number) => this.sanitizeAutoSendRule(rule, index))
        .sort((a, b) => a.priority - b.priority);
    }

    if (config?.autoSend) {
      return [this.sanitizeAutoSendRule({ ...config.autoSend, id: 'legacy', name: 'Default rule', priority: 0 }, 0)];
    }

    return [];
  }

  private matchesAutoSendRule(contact: any, rule: AutoSendRule): boolean {
    const conditions = rule.conditions || {};
    const contactSource = String(contact?.source || '').trim();
    const contactStatus = String(contact?.status || '').trim();

    if (conditions.sources?.length && !conditions.sources.includes(contactSource)) {
      return false;
    }

    if (conditions.statuses?.length && !conditions.statuses.includes(contactStatus)) {
      return false;
    }

    return true;
  }

  private selectAutoSendRule(contact: any, config: any): AutoSendRule | null {
    const rules = this.getAutoSendRulesFromConfig(config).filter(rule => rule.enabled);
    if (!rules.length) return null;
    return rules.find(rule => this.matchesAutoSendRule(contact, rule)) || null;
  }

  private isValidUuid(value?: string): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async notifyAutoSendSuccess(
    workspaceId: string,
    contact: any,
    templateName: string,
    targetUserId?: string,
  ): Promise<void> {
    try {
      const fullName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || 'Unknown contact';
      const contactPhone = contact?.phone || 'unknown';
      const notification = {
        type: NotificationType.WHATSAPP,
        title: 'Auto-send delivered',
        message: `Template "${templateName}" sent to ${fullName} (${contactPhone})`,
        link: '/whatsapp',
        metadata: {
          contactId: contact?.id,
          templateName,
          waId: normalizePhoneDigits(contactPhone),
        },
      };

      if (this.isValidUuid(targetUserId)) {
        await this.notificationsService.create(workspaceId, { ...notification, userId: targetUserId! });
        return;
      }

      await this.notifyWorkspace(workspaceId, notification);
    } catch (err) {
      this.logger.warn(`Auto-send success notification failed: ${err.message}`);
    }
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

  private async findContactByPhone(workspaceId: string, phone?: string): Promise<Contact | null> {
    const normalized = normalizePhoneE164(phone);
    const digits = normalizePhoneDigits(phone);
    if (!normalized || !digits) return null;

    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere(
        `(
          contact.phoneNormalized = :normalized
          OR regexp_replace(COALESCE(contact.phone, ''), '[^0-9]', '', 'g') = :digits
        )`,
        { normalized, digits },
      )
      .orderBy('contact.createdAt', 'DESC')
      .getOne();
  }

  private async findOrCreateContact(
    waId: string,
    profileName: string | undefined,
    workspaceId: string,
    ownerId: string,
  ): Promise<Contact> {
    const phone = normalizePhoneE164(waId) || `+${waId}`;
    let contact = await this.findContactByPhone(workspaceId, phone);
    if (!contact) contact = await this.findContactByPhone(workspaceId, waId);

    if (!contact) {
      const nameParts = (profileName || '').trim().split(' ');
      const newContact = this.contactRepository.create();
      Object.assign(newContact, {
        workspaceId,
        ownerId,
        firstName: nameParts[0] || 'WhatsApp',
        lastName: nameParts.slice(1).join(' ') || 'Contact',
        phone,
        phoneNormalized: normalizePhoneE164(phone) || undefined,
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
    const mediaMetadata: Record<string, any> = {};
    let messageBody = '';
    if (message.type === 'text' && message.text) {
      messageBody = message.text.body;
    } else if (message.type === 'image') {
      messageBody = `[Image] ${message.image?.caption || ''}`.trim();
      mediaMetadata.mediaId = message.image?.id;
      mediaMetadata.mediaMimeType = message.image?.mime_type;
      mediaMetadata.mediaCaption = message.image?.caption;
    } else if (message.type === 'document') {
      messageBody = `[Document: ${message.document?.filename || 'file'}] ${message.document?.caption || ''}`.trim();
      mediaMetadata.mediaId = message.document?.id;
      mediaMetadata.mediaMimeType = message.document?.mime_type;
      mediaMetadata.mediaCaption = message.document?.caption;
      mediaMetadata.fileName = message.document?.filename;
    } else if (message.type === 'audio') {
      messageBody = '[Voice message]';
      mediaMetadata.mediaId = message.audio?.id;
      mediaMetadata.mediaMimeType = message.audio?.mime_type;
    } else if (message.type === 'video') {
      messageBody = `[Video] ${message.video?.caption || ''}`.trim();
      mediaMetadata.mediaId = message.video?.id;
      mediaMetadata.mediaMimeType = message.video?.mime_type;
      mediaMetadata.mediaCaption = message.video?.caption;
    } else if (message.type === 'interactive') {
      const reply = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
      messageBody = `[Button reply: ${reply}]`;
    } else if (message.type === 'reaction') {
      const emoji = String(message.reaction?.emoji || '').trim();
      messageBody = emoji ? `[Reaction] ${emoji}` : '[Reaction]';
      mediaMetadata.reactionEmoji = emoji || undefined;
      mediaMetadata.reactionMessageId = message.reaction?.message_id || undefined;
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
      // Use server receive time — Meta test messages often carry stale timestamps (e.g. Sep 2023)
      occurredAt: new Date(),
      metadata: {
        whatsappMessageId: message.id,
        waId: message.from,
        messageType: message.type,
        metaTimestamp: message.timestamp, // keep original for reference
        ...mediaMetadata,
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
    userId?: string,
    whatsappMessageId?: string,
    mediaMetadata?: Record<string, any>,
  ): Promise<void> {
    try {
      const phone = normalizePhoneE164(to) || (to.startsWith('+') ? to : `+${to}`);
      const contact2 = await this.findContactByPhone(workspaceId, phone) || await this.findContactByPhone(workspaceId, to);
      const normalizedUserId = userId?.trim() || undefined;

      const activity = this.activityRepository.create({
        workspaceId,
        contactId: contact2?.id || undefined,
        userId: normalizedUserId,
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
          ...(mediaMetadata || {}),
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
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/${phoneNumberId}/messages`, payload, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        }),
      );
      return response.data;
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      if (metaError) {
        const details = metaError.error_data?.details ? ` (${metaError.error_data.details})` : '';
        throw new BadRequestException(
          `WhatsApp API error ${metaError.code || ''}: ${metaError.message || 'Unknown error'}${details}`.trim(),
        );
      }
      throw error;
    }
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
    return this.sendMessage({
      to,
      type: 'template',
      content: '',
      template: { name: templateName, language, parameters: this.normalizeTemplateComponents(parameters) },
    });
  }

  async sendTemplateMessageForWorkspace(
    workspaceId: string,
    to: string,
    templateName: string,
    language = 'en',
    parameters: any[] = [],
  ): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return this.sendMessageWithCredentials(integration?.credentials || {}, {
      to,
      type: 'template',
      content: '',
      template: { name: templateName, language, parameters: this.normalizeTemplateComponents(parameters) },
    });
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

            const messageEventPayload = {
              workspaceId: integration.workspaceId,
              integrationId: integration.id,
              contactId: contact.id,
              waId: message.from,
              messageId: message.id,
              messageType: message.type,
              occurredAt: new Date().toISOString(),
            };
            this.eventEmitter.emit('message_received', messageEventPayload);
            this.eventEmitter.emit('whatsapp.message.received', messageEventPayload);

            const interactiveReply = message.interactive?.button_reply || message.interactive?.list_reply;
            if (message.type === 'interactive' && interactiveReply) {
              const buttonEventPayload = {
                ...messageEventPayload,
                buttonId: interactiveReply.id,
                buttonTitle: interactiveReply.title,
              };
              this.eventEmitter.emit('button_clicked', buttonEventPayload);
              this.eventEmitter.emit('whatsapp.button.clicked', buttonEventPayload);
            }

            // Conversation flows take priority over auto-responses
            const flowHandled = await this.checkFlowTrigger(message, message.from, integration);
            if (!flowHandled) {
              await this.autoRespond(message, profileName, integration);
            }

            // Notify all workspace users about the new inbound message
            const senderName = profileName || contact.firstName || `+${message.from}`;
            const msgPreview = message.text?.body || message.type || 'media';
            await this.notifyWorkspace(integration.workspaceId, {
              type: NotificationType.WHATSAPP,
              title: 'New WhatsApp message',
              message: `${senderName}: ${msgPreview.substring(0, 80)}`,
              link: '/whatsapp',
              metadata: {
                contactId: contact.id,
                waId: message.from,
                messageType: message.type,
              },
            });
          }
        }
      }

      return { status: 'success' };
    } catch (error) {
      // Always return 200 to Meta so it doesn't stop sending webhooks.
      // Log the error for debugging but don't propagate it.
      this.logger.error(`Failed to process WhatsApp webhook: ${error.message}`, error.stack);
      return { status: 'error', message: error.message };
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
    } else if (integration.config?.autoRespondEnabled === true) {
      // Default responses (only if explicitly enabled)
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
        return;
      }
    }

    // AI auto-reply fallback: if no keyword rule matched, try AI
    try {
      const aiReply = await this.whatsAppAIService.generateReply(
        integration.workspaceId,
        message.from,
        message.text.body,
        profileName || 'Customer',
      );
      if (aiReply) {
        await this.sendTextMessage(message.from, aiReply, credentials);
        this.logger.log(`AI auto-reply sent to ${message.from}`);
      }
    } catch (err) {
      this.logger.warn(`AI auto-reply failed: ${err.message}`);
    }
  }

  async getAutoResponses(workspaceId: string): Promise<any> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return {
      enabled: integration?.config?.autoRespondEnabled === true,
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
      case 'image': {
        const img: any = { caption: message.media!.caption };
        if (message.media!.id) img.id = message.media!.id; else img.link = message.media!.url;
        return { ...base, type: 'image', image: img };
      }
      case 'document': {
        const doc: any = { caption: message.media!.caption, filename: message.media!.filename };
        if (message.media!.id) doc.id = message.media!.id; else doc.link = message.media!.url;
        return { ...base, type: 'document', document: doc };
      }
      case 'video': {
        const vid: any = { caption: message.media!.caption };
        if (message.media!.id) vid.id = message.media!.id; else vid.link = message.media!.url;
        return { ...base, type: 'video', video: vid };
      }
      case 'audio': {
        const aud: any = {};
        if (message.media!.id) aud.id = message.media!.id; else aud.link = message.media!.url;
        return { ...base, type: 'audio', audio: aud };
      }
      case 'interactive': return { ...base, type: 'interactive', interactive: message.interactive };
      default: throw new BadRequestException(`Unsupported message type: ${message.type}`);
    }
  }

  private normalizeTemplateComponents(parameters: any[] = []): any[] {
    if (!Array.isArray(parameters) || parameters.length === 0) return [];

    const components: any[] = [];
    const bodyParams: any[] = [];

    for (const item of parameters) {
      const componentType = String(item?.type || '').toLowerCase();
      const isComponent = ['header', 'body', 'button'].includes(componentType) && Array.isArray(item?.parameters);

      if (isComponent) {
        components.push({ ...item, type: componentType });
        continue;
      }

      if (typeof item === 'string') {
        bodyParams.push({ type: 'text', text: item });
      } else if (item && typeof item === 'object') {
        bodyParams.push(item);
      }
    }

    if (bodyParams.length > 0) {
      const existingBody = components.find((c) => c.type === 'body');
      if (existingBody) {
        existingBody.parameters = [...(existingBody.parameters || []), ...bodyParams];
      } else {
        components.push({ type: 'body', parameters: bodyParams });
      }
    }

    return components;
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

  async downloadMediaForWorkspace(
    workspaceId: string,
    mediaId: string,
  ): Promise<{ buffer: Buffer; contentType: string; fileName?: string }> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    const { accessToken } = this.getCredentials(integration?.credentials);
    if (!accessToken) {
      throw new BadRequestException('WhatsApp credentials not configured');
    }

    let mediaInfo: any;
    try {
      const mediaInfoRes = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${mediaId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'id,mime_type,url' },
        }),
      );
      mediaInfo = mediaInfoRes.data || {};
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      if (metaError) {
        throw new BadRequestException(`Unable to fetch media info: ${metaError.message || 'Unknown error'}`);
      }
      throw error;
    }

    if (!mediaInfo?.url) {
      throw new BadRequestException('Media URL is missing');
    }

    const mediaFileResponse = await firstValueFrom(
      this.httpService.get(mediaInfo.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      }),
    );

    const contentType = String(mediaFileResponse.headers?.['content-type'] || mediaInfo.mime_type || 'application/octet-stream');
    const disposition = String(mediaFileResponse.headers?.['content-disposition'] || '');
    const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
    let fileName: string | undefined;
    if (fileNameMatch?.[1]) {
      const rawName = fileNameMatch[1].replace(/\"/g, '');
      try {
        fileName = decodeURIComponent(rawName);
      } catch {
        fileName = rawName;
      }
    }

    return {
      buffer: Buffer.from(mediaFileResponse.data),
      contentType,
      fileName,
    };
  }

  /**
   * Upload media to Meta WhatsApp Media API
   * Returns { id: media_id } which can be used in messages
   */
  async uploadMedia(
    workspaceId: string,
    file: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<{ id: string }> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    const { accessToken, phoneNumberId } = this.getCredentials(integration?.credentials);

    // Build FormData for Meta upload
    const FormData = require('form-data');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', file, { filename, contentType: mimeType });
    form.append('type', mimeType);

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.apiUrl}/${phoneNumberId}/media`,
        form,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...form.getHeaders(),
          },
          maxContentLength: 64 * 1024 * 1024, // 64MB
          maxBodyLength: 64 * 1024 * 1024,
        },
      ),
    );

    this.logger.log(`Media uploaded: ${response.data.id} (${mimeType}, ${filename})`);
    return { id: response.data.id };
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
    headerType?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    headerText?: string;
    headerMediaUrl?: string;
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
    const headerType = template.headerType || (template.headerText ? 'TEXT' : 'NONE');

    if (headerType === 'TEXT' && template.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: template.headerText });
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      const headerComp: any = { type: 'HEADER', format: headerType };
      if (template.headerMediaUrl) {
        headerComp.example = { header_handle: [template.headerMediaUrl] };
      }
      components.push(headerComp);
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
    // Fetch without TypeORM relation JOIN to avoid silent exclusion on Neon/Postgres FK edge cases
    const activities = await this.activityRepository.find({
      where: { workspaceId, type: ActivityType.WHATSAPP_MESSAGE },
      order: { occurredAt: 'DESC' },
      take: limit,
    });

    // Manually hydrate contacts
    if (activities.length > 0) {
      const contactIds = [...new Set(activities.map(a => a.contactId).filter(Boolean))] as string[];
      if (contactIds.length > 0) {
        const contacts = await this.contactRepository.find({ where: { id: In(contactIds) } });
        const contactMap = new Map(contacts.map(c => [c.id, c]));
        for (const activity of activities) {
          (activity as any).contact = activity.contactId ? (contactMap.get(activity.contactId) ?? null) : null;
        }
      } else {
        for (const activity of activities) {
          (activity as any).contact = null;
        }
      }
    }

    this.logger.log(`getWhatsAppActivities: found ${activities.length} activities for workspace ${workspaceId}`);
    return activities;
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
    const config = integration?.config || {};
    const legacyConfig = this.sanitizeAutoSendConfig(config.autoSend || this.getDefaultAutoSendConfig());
    const rules = this.getAutoSendRulesFromConfig(config);

    return {
      ...legacyConfig,
      autoSendRules: rules,
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

    const rawRules = Array.isArray(config?.autoSendRules)
      ? config.autoSendRules
      : (Array.isArray(config?.rules) ? config.rules : null);

    const normalizedConfig = { ...(integration.config || {}) } as any;
    if (rawRules) {
      const rules = rawRules
        .map((rule: any, index: number) => this.sanitizeAutoSendRule(rule, index))
        .sort((a: AutoSendRule, b: AutoSendRule) => a.priority - b.priority);
      normalizedConfig.autoSendRules = rules;
      normalizedConfig.autoSend = rules.length
        ? this.ruleToAutoSendConfig(rules[0])
        : this.getDefaultAutoSendConfig();
    } else {
      const legacyConfig = this.sanitizeAutoSendConfig(config);
      normalizedConfig.autoSend = legacyConfig;
      normalizedConfig.autoSendRules = [this.sanitizeAutoSendRule({ ...legacyConfig, id: 'legacy', name: 'Default rule', priority: 0 }, 0)];
    }

    integration.config = normalizedConfig;
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
    filter: { tags?: string[]; status?: string[]; source?: string[]; selectedContactIds?: string[] },
    template: { name: string; language: string; params?: any[] },
  ): Promise<{ total: number; sent: number; failed: number; results: any[] }> {
    const where: any = { workspaceId };
    const selectedIds = Array.isArray(filter.selectedContactIds)
      ? Array.from(new Set(filter.selectedContactIds.filter(Boolean)))
      : [];
    if (filter.status?.length) where.status = In(filter.status);
    if (filter.source?.length) where.source = In(filter.source);
    if (selectedIds.length) where.id = In(selectedIds);

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
      const phone = normalizePhoneE164(contact.phone) || contact.phone!.replace(/[^0-9+]/g, '');
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

      const phone = normalizePhoneE164(rawPhone);
      if (!phone) {
        results.push({ phone: rawPhone, status: 'skipped', reason: 'invalid phone' });
        continue;
      }

      let contact = await this.findContactByPhone(workspaceId, phone);
      if (!contact) contact = await this.findContactByPhone(workspaceId, rawPhone);

      let isNew = false;
      if (!contact) {
        contact = this.contactRepository.create();
        Object.assign(contact, {
          workspaceId,
          ownerId,
          firstName: row.firstName || 'Contact',
          lastName: row.lastName || '',
          phone,
          phoneNormalized: normalizePhoneE164(phone) || undefined,
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
    return this.handleContactCreatedEvent(payload);
  }

  @OnEvent('contact.external_duplicate')
  async handleExternalDuplicateContact(payload: { contact: any; workspaceId: string; source?: string }): Promise<void> {
    return this.handleContactCreatedEvent(payload);
  }

  private async handleContactCreatedEvent(payload: { contact: any; workspaceId: string }): Promise<void> {
    const { contact, workspaceId } = payload;
    this.logger.log(`handleContactCreated: contact=${contact.id} phone="${contact.phone}" source=${contact.source} workspace=${workspaceId}`);
    try {
      // Always notify workspace users about the new contact/lead
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'New contact';
      await this.notifyWorkspace(workspaceId, {
        type: NotificationType.LEAD,
        title: 'New lead added',
        message: `${fullName} was added${contact.source ? ` via ${contact.source}` : ''}`,
        link: '/contacts',
        metadata: { contactId: contact.id },
      });

      const integration = await this.integrationRepository.findOne({
        where: { type: IntegrationType.WHATSAPP, workspaceId },
      });
      if (!integration) {
        this.logger.log(`Auto-send skipped: no WhatsApp integration in workspace ${workspaceId}`);
        return;
      }

      const matchedRule = this.selectAutoSendRule(contact, integration.config || {});
      if (!matchedRule) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: no matching enabled rule`);
        return;
      }

      const conditions = matchedRule.conditions || {};
      const rawPhone = contact.phone || '';
      const phone = rawPhone.replace(/[^0-9]/g, '');
      if (!phone || phone.length < 7) {
        this.logger.log(
          `Auto-send skipped for contact ${contact.id}: invalid phone ("${rawPhone}" → "${phone}", len=${phone.length}, requirePhone=${conditions.requirePhone !== false})`,
        );
        return;
      }

      // Send template — use integration's stored credentials (not global env vars)
      const templateName = matchedRule.templateName || 'hello_world';
      // Normalize: 'en' → 'en_US' (Meta rejects the short code for hello_world and most templates)
      const rawLang = matchedRule.language || 'en';
      // Meta hello_world is en_US; custom templates may exist only in en.
      const language = rawLang === 'en' && templateName === 'hello_world' ? 'en_US' : rawLang;
      // Build template components dynamically (header/body).
      // Media header templates require runtime header params.
      const params: any[] = [];
      const headerMediaType = String(matchedRule.headerMediaType || '').toLowerCase();
      const headerMediaId = String(matchedRule.headerMediaId || '').trim();
      const headerMediaUrl = String(matchedRule.headerMediaUrl || '').trim();

      if (['image', 'video', 'document'].includes(headerMediaType) && !headerMediaId && !headerMediaUrl) {
        this.logger.warn(`Auto-send skipped for contact ${contact.id}: template header media is required but not configured`);
        return;
      }

      if (['image', 'video', 'document'].includes(headerMediaType) && (headerMediaId || headerMediaUrl)) {
        const headerParam: any = { type: headerMediaType };
        headerParam[headerMediaType] = headerMediaId ? { id: headerMediaId } : { link: headerMediaUrl };
        params.push({ type: 'header', parameters: [headerParam] });
      }

      // Only add name param if the template actually accepts body parameters.
      // hello_world and many basic templates have ZERO params — sending params causes #132000
      if (matchedRule.includeNameParam && contact.firstName && templateName !== 'hello_world') {
        params.push({ type: 'body', parameters: [{ type: 'text', text: contact.firstName }] });
      }

      this.logger.log(
        `Auto-send: rule="${matchedRule.name}" template="${templateName}" lang="${language}" to phone="${phone}" (raw="${rawPhone}") contact=${contact.id} source=${contact.source}`,
      );
      const msgResult = await this.sendMessageWithCredentials(integration.credentials || {}, {
        to: phone,
        type: 'template',
        content: '',
        template: { name: templateName, language, parameters: params },
      });
      const msgId = msgResult?.messages?.[0]?.id;
      // Save as outbound activity so it appears in the WhatsApp inbox
      const ownerId = this.isValidUuid(String(contact.ownerId || '')) ? String(contact.ownerId) : undefined;
      const fallbackUserId = this.isValidUuid(String(integration.userId || '')) ? String(integration.userId) : undefined;
      await this.saveOutboundActivity(
        phone,
        `[Auto-send template: ${templateName}]`,
        'template',
        workspaceId,
        ownerId || fallbackUserId,
        msgId,
        {
          mediaType: ['image', 'video', 'document'].includes(headerMediaType) ? headerMediaType : undefined,
          mediaId: headerMediaId || undefined,
          mediaUrl: headerMediaUrl || undefined,
        },
      );
      await this.armAfterAutoSendFlow(workspaceId, phone, integration);
      await this.notifyAutoSendSuccess(workspaceId, contact, templateName, ownerId || fallbackUserId);
      this.logger.log(`Auto-send SUCCESS: template "${templateName}" sent to ${phone} for contact ${contact.id} msgId=${msgId}`);
    } catch (err) {
      const metaError = err.response?.data?.error;
      this.logger.warn(`Auto-send FAILED for contact ${payload.contact?.id}: ${metaError?.message || err.message} (code=${metaError?.code}, subcode=${metaError?.error_subcode})`);
      if (err.response?.data) {
        this.logger.warn(`Auto-send error details: ${JSON.stringify(err.response.data)}`);
      }
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
   * Test webhook verification by making an internal HTTP GET to the public webhook endpoint.
   * This tells the user definitively whether Meta would be able to verify the webhook.
   */
  async testVerification(appUrl: string, workspaceId?: string): Promise<Record<string, any>> {
    const baseUrl = appUrl.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const webhookUrl = `${baseUrl}/api/v1/integrations/whatsapp/webhook`;
    const challenge = 'test_challenge_' + Math.random().toString(36).slice(2, 10);

    // Find the active verify token
    const envToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    let token = envToken || '';

    if (workspaceId) {
      const integration = await this.integrationRepository.findOne({
        where: { type: IntegrationType.WHATSAPP, workspaceId },
      });
      const storedToken = integration?.credentials?.verifyToken || integration?.config?.verifyToken;
      if (storedToken) token = storedToken; // prefer integration-stored token
    }

    if (!token) {
      return {
        working: false,
        reason: 'No verify token configured. Set one using the form below and click Save Token.',
        webhookUrl,
        challenge,
      };
    }

    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${encodeURIComponent(challenge)}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(testUrl, { responseType: 'text' }),
      );
      const body = String(response.data || '').trim().replace(/^"(.*)"$/, '$1'); // strip JSON quotes if any
      const working = body === challenge;
      return {
        working,
        reason: working
          ? 'Webhook verification is working correctly. Meta can verify your webhook.'
          : `Verification returned unexpected body: "${body}" (expected "${challenge}")`,
        webhookUrl,
        testedToken: token.substring(0, 4) + '...',
        statusCode: response.status,
      };
    } catch (err: any) {
      const statusCode = err.response?.status;
      return {
        working: false,
        reason: statusCode === 400
          ? `Verification endpoint returned 400 — the token in Meta does NOT match your saved token. Update the verify token in Meta to: ${token}`
          : `HTTP error ${statusCode || err.message}`,
        webhookUrl,
        testedToken: token.substring(0, 4) + '...',
        statusCode,
        fullToken: token, // return full token so UI can show it
      };
    }
  }

  /**
   * Public diagnostic — shows what's configured for WhatsApp without exposing secrets.
   * Used by the frontend "Webhook Setup" panel to show live status.
   */
  async getDiagnostic(workspaceId?: string): Promise<Record<string, any>> {
    const envToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');
    const envAccessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const envPhoneId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    // Count total WhatsApp integrations
    const allIntegrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP },
    });

    let workspaceIntegration: Integration | null = null;
    if (workspaceId) {
      workspaceIntegration = await this.integrationRepository.findOne({
        where: { type: IntegrationType.WHATSAPP, workspaceId },
      });
    }

    // Last received message
    let lastMessageAt: string | null = null;
    let totalMessagesIn24h = 0;
    if (workspaceId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentActivities = await this.activityRepository.find({
        where: { workspaceId, type: ActivityType.WHATSAPP_MESSAGE },
        order: { occurredAt: 'DESC' },
        take: 100,
      });
      if (recentActivities.length > 0) {
        lastMessageAt = recentActivities[0].occurredAt?.toISOString?.() || String(recentActivities[0].occurredAt);
      }
      totalMessagesIn24h = recentActivities.filter(a => new Date(a.occurredAt) > since).length;
    }

    const integrationStatus = workspaceIntegration?.status || 'NOT_CONFIGURED';
    const hasIntegrationToken = !!(workspaceIntegration?.credentials?.verifyToken || workspaceIntegration?.config?.verifyToken);
    const hasEnvToken = !!envToken;
    const hasVerifyToken = hasIntegrationToken || hasEnvToken;
    const hasAccessToken = !!(workspaceIntegration?.credentials?.accessToken || envAccessToken);
    const hasPhoneNumberId = !!(workspaceIntegration?.credentials?.phoneNumberId || workspaceIntegration?.config?.phoneNumberId || envPhoneId);

    return {
      status: integrationStatus,
      integrationCount: allIntegrations.length,
      checks: {
        verifyToken: hasVerifyToken,
        accessToken: hasAccessToken,
        phoneNumberId: hasPhoneNumberId,
        integrationExists: !!workspaceIntegration,
      },
      messages: {
        lastReceivedAt: lastMessageAt,
        receivedInLast24h: totalMessagesIn24h,
      },
      metaChecklist: [
        { step: 1, label: 'Webhook URL set in Meta', hint: 'Meta App → WhatsApp → Configuration → Webhook → Callback URL' },
        { step: 2, label: 'Webhook verified (Verify and Save clicked)', hint: 'The verify token must match exactly' },
        { step: 3, label: '"messages" field subscribed', hint: 'Under Webhook fields, click Manage and enable "messages"' },
        { step: 4, label: 'App is in Live mode', hint: 'Meta App → Settings → Basic → App Mode = Live (not Development)' },
        { step: 5, label: 'WHATSAPP_ACCESS_TOKEN configured on server', hint: hasAccessToken ? '✅ Configured' : '❌ Missing — set in Fly.io secrets' },
        { step: 6, label: 'WHATSAPP_PHONE_NUMBER_ID configured on server', hint: hasPhoneNumberId ? '✅ Configured' : '❌ Missing — set in Fly.io secrets' },
      ],
    };
  }

  /**
   * Delete all WhatsApp activities for a specific waId (phone number) in a workspace.
   * This removes the conversation from the inbox.
   */
  async deleteConversation(workspaceId: string, waId: string): Promise<{ deleted: number }> {
    // Use two-step: find by workspaceId+type (TypeORM handles column mapping),
    // then filter in-memory for the waId JSONB field, then delete by id.
    const toDelete = await this.activityRepository.find({
      where: { workspaceId, type: ActivityType.WHATSAPP_MESSAGE },
      select: ['id', 'metadata'],
    });
    const ids = toDelete
      .filter(a => (a.metadata as any)?.waId === waId)
      .map(a => a.id);
    if (ids.length === 0) return { deleted: 0 };
    await this.activityRepository.delete(ids);
    return { deleted: ids.length };
  }

  // ─── Campaign Management ───────────────────────────────────────

  async getCampaigns(workspaceId: string): Promise<any[]> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return [];
    return (integration.config?.campaigns || []).sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async createCampaign(
    workspaceId: string,
    campaign: { name: string; templateName: string; language: string; filter: any },
  ): Promise<any> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) throw new Error('WhatsApp integration not found');

    const newCampaign = {
      id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: campaign.name,
      templateName: campaign.templateName,
      language: campaign.language,
      filter: campaign.filter || {},
      status: 'draft',
      createdAt: new Date().toISOString(),
      sentAt: null,
      results: null,
    };

    integration.config = {
      ...(integration.config || {}),
      campaigns: [...(integration.config?.campaigns || []), newCampaign],
    };
    await this.integrationRepository.save(integration);
    return newCampaign;
  }

  async previewCampaignAudience(
    workspaceId: string,
    filter: { tags?: string[]; status?: string[]; source?: string[]; selectedContactIds?: string[] },
  ): Promise<{ count: number; sample: Array<{ id: string; name: string; phone: string }> }> {
    const where: any = { workspaceId };
    const selectedIds = Array.isArray(filter.selectedContactIds)
      ? Array.from(new Set(filter.selectedContactIds.filter(Boolean)))
      : [];
    if (filter.status?.length) where.status = In(filter.status);
    if (filter.source?.length) where.source = In(filter.source);
    if (selectedIds.length) where.id = In(selectedIds);

    let contacts = await this.contactRepository.find({ where, take: 1000 });
    if (filter.tags?.length) {
      contacts = contacts.filter(c => {
        const contactTags = c.tags || [];
        return filter.tags!.every(t => contactTags.includes(t));
      });
    }
    contacts = contacts.filter(c => c.phone);

    return {
      count: contacts.length,
      sample: contacts.slice(0, 10).map(c => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        phone: c.phone!,
      })),
    };
  }

  async sendCampaign(workspaceId: string, campaignId: string): Promise<any> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) throw new Error('WhatsApp integration not found');

    const campaigns: any[] = integration.config?.campaigns || [];
    const campaign = campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'sent') throw new Error('Campaign already sent');

    campaign.status = 'sending';
    await this.integrationRepository.save(integration);

    try {
      const results = await this.broadcastTemplate(
        workspaceId,
        campaign.filter || {},
        { name: campaign.templateName, language: campaign.language },
      );

      campaign.status = 'sent';
      campaign.sentAt = new Date().toISOString();
      campaign.results = {
        total: results.total,
        sent: results.sent,
        failed: results.failed,
      };
      await this.integrationRepository.save(integration);

      this.logger.log(`Campaign "${campaign.name}" sent: ${results.sent}/${results.total}`);
      return { ...campaign, detailedResults: results.results };
    } catch (err) {
      campaign.status = 'failed';
      campaign.results = { error: err.message };
      await this.integrationRepository.save(integration);
      throw err;
    }
  }

  async deleteCampaign(workspaceId: string, campaignId: string): Promise<void> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return;

    integration.config = {
      ...(integration.config || {}),
      campaigns: (integration.config?.campaigns || []).filter((c: any) => c.id !== campaignId),
    };
    await this.integrationRepository.save(integration);
  }

  private async findIntegrationForWorkspace(workspaceId: string): Promise<any> {
    return this.integrationRepository.findOne({
      where: { workspaceId, type: IntegrationType.WHATSAPP },
    });
  }

  // ─── Conversation Flows (Chatbot) ──────────────────────────────────────────

  /**
   * Get all conversation flows for a workspace
   */
  async getFlows(workspaceId: string): Promise<any[]> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    return integration?.config?.conversationFlows || [];
  }

  /**
   * Save conversation flows for a workspace
   */
  async saveFlows(workspaceId: string, flows: any[]): Promise<void> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    integration.config = {
      ...(integration.config || {}),
      conversationFlows: flows,
    };
    await this.integrationRepository.save(integration);
    this.logger.log(`Saved ${flows.length} conversation flows for workspace ${workspaceId}`);
  }

  /**
   * Send a flow step message.
   * - type "template": sends an approved Meta template (for initiating conversations)
   * - default: sends interactive buttons or plain text (within 24h session)
   */
  private async sendFlowStep(
    step: {
      id: string;
      message: string;
      type?: 'template' | 'interactive';
      templateName?: string;
      templateLanguage?: string;
      templateParams?: string[];
      headerMediaUrl?: string;
      headerMediaType?: string;
      mediaUrl?: string;
      mediaId?: string;
      mediaType?: 'image' | 'video' | 'document' | 'audio';
      buttons?: Array<{ id: string; title: string; nextStepId: string }>;
    },
    waId: string,
    credentials: Record<string, any>,
    workspaceId: string,
  ): Promise<void> {
    const stepMessage = (step.message || '').trim();
    if (step.type === 'template' && step.templateName) {
      // Send approved template (can initiate conversations outside 24h window)
      const components: any[] = [];
      if (step.headerMediaUrl && step.headerMediaType) {
        const mt = step.headerMediaType.toLowerCase();
        components.push({ type: 'header', parameters: [{ type: mt, [mt]: { link: step.headerMediaUrl } }] });
      }
      if (step.templateParams?.length) {
        components.push({ type: 'body', parameters: step.templateParams.map(p => ({ type: 'text', text: p })) });
      }
      await this.sendMessageWithCredentials(credentials, {
        to: waId,
        type: 'template',
        content: '',
        template: { name: step.templateName, language: step.templateLanguage || 'en_US', parameters: components },
      });
      const btnLabels = step.buttons?.map(b => b.title).join(', ') || '';
      await this.saveOutboundActivity(waId, `[Flow template: ${step.templateName}]${btnLabels ? ` [${btnLabels}]` : ''}`, 'template', workspaceId, '', undefined);
    } else if (step.buttons?.length) {
      // Send media first if attached, then interactive buttons
      const hasMedia = (step.mediaUrl || step.mediaId) && step.mediaType;
      if (hasMedia) {
        const mediaResult = await this.sendMessageWithCredentials(credentials, {
          to: waId,
          type: step.mediaType!,
          content: '',
          media: { url: step.mediaUrl, id: step.mediaId, caption: stepMessage || undefined },
        });
        const mediaMsgId = mediaResult?.messages?.[0]?.id;
        await this.saveOutboundActivity(
          waId,
          `[${step.mediaType}] ${stepMessage || step.mediaUrl || 'uploaded media'}`,
          step.mediaType!,
          workspaceId,
          '',
          mediaMsgId,
          {
            mediaId: step.mediaId || undefined,
            mediaUrl: step.mediaUrl || undefined,
            mediaCaption: stepMessage || undefined,
          },
        );
      }
      const buttons = step.buttons.slice(0, 3).map(b => ({ id: b.id, title: b.title.slice(0, 20) }));
      const prompt = stepMessage || 'Please choose an option:';
      await this.sendMessageWithCredentials(credentials, {
        to: waId,
        type: 'interactive',
        content: '',
        interactive: {
          type: 'button',
          body: { text: hasMedia ? 'Please choose an option:' : prompt },
          action: { buttons: buttons.map(b => ({ type: 'reply' as const, reply: { id: b.id, title: b.title } })) },
        },
      });
      const btnLabels = buttons.map(b => b.title).join(', ');
      await this.saveOutboundActivity(waId, `[Flow buttons: ${btnLabels}] ${prompt}`, 'interactive', workspaceId, '', undefined);
    } else if ((step.mediaUrl || step.mediaId) && step.mediaType) {
      // Send media message (end of flow or media-only step)
      await this.sendMessageWithCredentials(credentials, {
        to: waId,
        type: step.mediaType,
        content: '',
        media: { url: step.mediaUrl, id: step.mediaId, caption: stepMessage || undefined },
      });
      await this.saveOutboundActivity(
        waId,
        `[${step.mediaType}] ${stepMessage || step.mediaUrl || 'uploaded media'}`,
        step.mediaType,
        workspaceId,
        '',
        undefined,
        {
          mediaId: step.mediaId || undefined,
          mediaUrl: step.mediaUrl || undefined,
          mediaCaption: stepMessage || undefined,
        },
      );
    } else {
      // Send plain text (end of flow)
      const text = stepMessage || 'Thank you!';
      await this.sendTextMessage(waId, text, credentials);
      await this.saveOutboundActivity(waId, text, 'text', workspaceId, '', undefined);
    }
    this.logger.log(`Flow step "${step.id}" sent to ${waId}`);
  }

  /**
   * Start a conversation flow for a contact
   */
  async startFlow(workspaceId: string, waId: string, flowId: string, integration: Integration): Promise<boolean> {
    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === flowId && f.enabled);
    if (!flow || !flow.steps?.length) return false;

    const firstStep = flow.steps[0];
    const delayMs = this.getFlowStepDelayMs(firstStep);
    const credentials = integration.credentials || {};

    try {
      // Save flow state for this contact
      const nowIso = new Date().toISOString();
      const flowStates = integration.config?.flowStates || {};
      flowStates[waId] = {
        flowId: flow.id,
        currentStepId: firstStep.id,
        startedAt: nowIso,
        lastInteractionAt: nowIso,
      };

      if (delayMs > 0) {
        flowStates[waId] = {
          ...flowStates[waId],
          pendingDelay: {
            flowId: flow.id,
            nextStepId: firstStep.id,
            dueAt: new Date(Date.now() + delayMs).toISOString(),
          },
        };
        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
        this.scheduleDelayedFlowStep(workspaceId, waId, flow.id, firstStep.id, delayMs);
        this.logger.log(`Flow "${flow.name}" scheduled for ${waId} in ${delayMs}ms`);
        return true;
      }

      await this.sendFlowStep(firstStep, waId, credentials, workspaceId);

      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);

      this.logger.log(`Flow "${flow.name}" started for ${waId} at step ${firstStep.id}`);
      return true;
    } catch (err) {
      this.logger.warn(`Failed to start flow "${flow.name}" for ${waId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Resolve flow state by exact waId or loose phone match.
   * This handles test numbers entered without country code.
   */
  private resolveFlowState(
    flowStates: Record<string, any>,
    waId: string,
  ): { stateKey: string; state: any } | null {
    if (flowStates[waId]) {
      return { stateKey: waId, state: flowStates[waId] };
    }

    const normalize = (value: string) => (value || '').replace(/\D/g, '');
    const normalizedWaId = normalize(waId);
    if (!normalizedWaId) return null;

    const matchedKey = Object.keys(flowStates).find((key) => {
      const normalizedKey = normalize(key);
      if (!normalizedKey) return false;
      return (
        normalizedWaId === normalizedKey ||
        normalizedWaId.endsWith(normalizedKey) ||
        normalizedKey.endsWith(normalizedWaId)
      );
    });

    if (!matchedKey) return null;
    return { stateKey: matchedKey, state: flowStates[matchedKey] };
  }

  /**
   * Normalize button payload/title text so matching is resilient to
   * punctuation, casing, spacing, and diacritics.
   */
  private normalizeReplyToken(value?: string): string {
    return (value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private tokensMatch(a?: string, b?: string): boolean {
    const na = this.normalizeReplyToken(a);
    const nb = this.normalizeReplyToken(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  private getErrorMessage(err: any): string {
    return err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Unknown error';
  }

  private getFlowStepDelayMs(step: any): number {
    const raw = Number(step?.delayMs ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    // Keep runtime timers bounded and safe for Node setTimeout.
    return Math.min(Math.floor(raw), 6 * 60 * 60 * 1000);
  }

  private async armAfterAutoSendFlow(workspaceId: string, waId: string, integration: Integration): Promise<void> {
    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.enabled && f.trigger === 'after_auto_send' && f.steps?.length > 0);
    if (!flow) return;

    const firstStep = flow.steps[0];
    const nowIso = new Date().toISOString();
    const flowStates = integration.config?.flowStates || {};

    flowStates[waId] = {
      flowId: flow.id,
      currentStepId: firstStep.id,
      startedAt: nowIso,
      lastInteractionAt: nowIso,
      armedAfterAutoSend: true,
    };

    integration.config = { ...(integration.config || {}), flowStates };
    await this.integrationRepository.save(integration);
    this.logger.log(`Flow "${flow.name}" armed after auto-send for ${waId}`);
  }

  private scheduleDelayedFlowStep(
    workspaceId: string,
    waId: string,
    flowId: string,
    stepId: string,
    delayMs: number,
  ): void {
    setTimeout(async () => {
      try {
        const integration = await this.findIntegrationForWorkspace(workspaceId);
        if (!integration) return;

        const flowStates = integration.config?.flowStates || {};
        const resolved = this.resolveFlowState(flowStates, waId);
        if (!resolved) return;
        const { stateKey, state } = resolved;

        const pending = state?.pendingDelay;
        if (!pending || pending.flowId !== flowId || pending.nextStepId !== stepId) {
          return;
        }

        const flows: any[] = integration.config?.conversationFlows || [];
        const flow = flows.find((f: any) => f.id === flowId && f.enabled);
        const nextStep = flow?.steps?.find((s: any) => s.id === stepId);
        if (!flow || !nextStep) {
          const clearedState = { ...state };
          delete clearedState.pendingDelay;
          flowStates[waId] = clearedState;
          if (stateKey !== waId) delete flowStates[stateKey];
          integration.config = { ...(integration.config || {}), flowStates };
          await this.integrationRepository.save(integration);
          return;
        }

        await this.sendFlowStep(nextStep, waId, integration.credentials || {}, workspaceId);

        if (nextStep.buttons?.length) {
          const nowIso = new Date().toISOString();
          const nextState = {
            ...state,
            currentStepId: nextStep.id,
            lastInteractionAt: nowIso,
            armedAfterAutoSend: false,
          };
          delete nextState.pendingDelay;
          flowStates[waId] = nextState;
          if (stateKey !== waId) delete flowStates[stateKey];
        } else {
          delete flowStates[stateKey];
          if (stateKey !== waId) delete flowStates[waId];
        }

        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
        this.logger.log(`Flow "${flow.name}": delayed step "${stepId}" sent to ${waId}`);
      } catch (err) {
        this.logger.warn(`Flow delayed step failed for ${waId}: ${this.getErrorMessage(err)}`);
      }
    }, delayMs);
  }

  /**
   * Handle a button reply within a conversation flow.
   * Looks up the current flow state, finds the next step, sends it.
   * Returns true if handled (caller should skip auto-respond).
   */
  async handleButtonReply(
    workspaceId: string,
    waId: string,
    buttonId: string,
    integration: Integration,
    buttonTitle?: string,
  ): Promise<boolean> {
    const flowStates = integration.config?.flowStates || {};
    const resolved = this.resolveFlowState(flowStates, waId);
    if (!resolved) {
      this.logger.warn(`Flow: no active state for ${waId} on button id="${buttonId}" title="${buttonTitle || ''}"`);
      return false;
    }
    const { stateKey, state } = resolved;
    if (state?.pendingDelay?.nextStepId) {
      this.logger.log(`Flow: delayed step pending for ${waId}, button reply ignored`);
      return true;
    }

    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === state.flowId);
    if (!flow) {
      // Flow was deleted — clean up state
      delete flowStates[stateKey];
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      return false;
    }

    // Find the current step and the button that was pressed
    const currentStep = flow.steps.find((s: any) => s.id === state.currentStepId);
    if (!currentStep?.buttons?.length) {
      // Current step has no buttons — flow is over, clean up
      delete flowStates[stateKey];
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      return false;
    }

    const idCandidate = this.normalizeReplyToken(buttonId);
    const titleCandidate = this.normalizeReplyToken(buttonTitle);
    const button = currentStep.buttons.find((b: any) => {
      const id = this.normalizeReplyToken(b.id);
      const title = this.normalizeReplyToken(b.title);
      return (
        (idCandidate && (id === idCandidate || id.includes(idCandidate) || idCandidate.includes(id))) ||
        (titleCandidate && (title === titleCandidate || title.includes(titleCandidate) || titleCandidate.includes(title)))
      );
    });
    if (!button) {
      this.logger.warn(
        `Flow: button id="${buttonId}" title="${buttonTitle || ''}" not found in step "${state.currentStepId}" for ${waId}`,
      );
      return false;
    }

    // Find the next step
    const nextStep = flow.steps.find((s: any) => s.id === button.nextStepId);
    if (!nextStep) {
      this.logger.warn(`Flow: nextStepId "${button.nextStepId}" not found in flow "${flow.id}"`);
      return false;
    }

    const credentials = integration.credentials || {};
    try {
      const delayMs = this.getFlowStepDelayMs(nextStep);
      if (delayMs > 0) {
        flowStates[waId] = {
          ...state,
          pendingDelay: {
            flowId: flow.id,
            nextStepId: nextStep.id,
            dueAt: new Date(Date.now() + delayMs).toISOString(),
          },
          lastInteractionAt: new Date().toISOString(),
          armedAfterAutoSend: false,
        };
        if (stateKey !== waId) {
          delete flowStates[stateKey];
        }
        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
        this.scheduleDelayedFlowStep(workspaceId, waId, flow.id, nextStep.id, delayMs);
        this.logger.log(`Flow "${flow.name}": scheduled step "${nextStep.id}" for ${waId} in ${delayMs}ms`);
        return true;
      }

      await this.sendFlowStep(nextStep, waId, credentials, workspaceId);

      // Update flow state
      if (nextStep.buttons?.length) {
        // More steps to go
        const nextState = {
          ...state,
          currentStepId: nextStep.id,
          lastInteractionAt: new Date().toISOString(),
          armedAfterAutoSend: false,
        };
        delete nextState.pendingDelay;
        flowStates[waId] = nextState;
        if (stateKey !== waId) {
          delete flowStates[stateKey];
        }
      } else {
        // End of flow — clean up state
        delete flowStates[stateKey];
        if (stateKey !== waId) {
          delete flowStates[waId];
        }
      }
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);

      this.logger.log(`Flow "${flow.name}": ${waId} → button "${button.title}" → step "${nextStep.id}"`);
      return true;
    } catch (err) {
      this.logger.warn(`Flow step send failed for ${waId}: ${this.getErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Handle a template quick reply button press.
   * Template QUICK_REPLY buttons send payload/text (not button IDs).
   * We match by button title text to find the nextStepId.
   */
  async handleTemplateButtonReply(
    workspaceId: string,
    waId: string,
    buttonPayload: string,
    integration: Integration,
    buttonText?: string,
  ): Promise<boolean> {
    const flowStates = integration.config?.flowStates || {};
    const resolved = this.resolveFlowState(flowStates, waId);
    if (!resolved) return false;
    const { stateKey, state } = resolved;
    if (state?.pendingDelay?.nextStepId) return true;

    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === state.flowId);
    if (!flow) {
      delete flowStates[stateKey];
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      return false;
    }

    const currentStep = flow.steps.find((s: any) => s.id === state.currentStepId);
    if (!currentStep?.buttons?.length) {
      delete flowStates[stateKey];
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      return false;
    }

    // Match template button by payload, text, or legacy/random id.
    // This keeps older saved flows compatible even if ids were not payload-based.
    const candidates = [buttonPayload, buttonText]
      .map((v) => this.normalizeReplyToken(v))
      .filter(Boolean);
    const button = currentStep.buttons.find((b: any) => {
      const title = this.normalizeReplyToken(b.title);
      const id = this.normalizeReplyToken(b.id);
      return candidates.some((candidate) => this.tokensMatch(candidate, title) || this.tokensMatch(candidate, id));
    });
    if (!button) {
      this.logger.warn(
        `Flow: template button payload="${buttonPayload}" text="${buttonText || ''}" not matched in step "${state.currentStepId}"`,
      );
      return false;
    }

    const nextStep = flow.steps.find((s: any) => s.id === button.nextStepId);
    if (!nextStep) return false;

    const credentials = integration.credentials || {};
    try {
      const delayMs = this.getFlowStepDelayMs(nextStep);
      if (delayMs > 0) {
        flowStates[waId] = {
          ...state,
          pendingDelay: {
            flowId: flow.id,
            nextStepId: nextStep.id,
            dueAt: new Date(Date.now() + delayMs).toISOString(),
          },
          lastInteractionAt: new Date().toISOString(),
          armedAfterAutoSend: false,
        };
        if (stateKey !== waId) {
          delete flowStates[stateKey];
        }
        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
        this.scheduleDelayedFlowStep(workspaceId, waId, flow.id, nextStep.id, delayMs);
        this.logger.log(`Flow "${flow.name}": scheduled step "${nextStep.id}" for ${waId} in ${delayMs}ms`);
        return true;
      }

      await this.sendFlowStep(nextStep, waId, credentials, workspaceId);
      if (nextStep.buttons?.length) {
        const nextState = {
          ...state,
          currentStepId: nextStep.id,
          lastInteractionAt: new Date().toISOString(),
          armedAfterAutoSend: false,
        };
        delete nextState.pendingDelay;
        flowStates[waId] = nextState;
        if (stateKey !== waId) {
          delete flowStates[stateKey];
        }
      } else {
        delete flowStates[stateKey];
        if (stateKey !== waId) {
          delete flowStates[waId];
        }
      }
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      this.logger.log(
        `Flow "${flow.name}": ${waId} → template button payload="${buttonPayload}" text="${buttonText || ''}" → step "${nextStep.id}"`,
      );
      return true;
    } catch (err) {
      this.logger.warn(`Flow template button failed for ${waId}: ${this.getErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Check if an inbound message should trigger a conversation flow.
   * Called BEFORE autoRespond — if a flow handles the message, skip auto-respond.
   */
  async checkFlowTrigger(message: any, waId: string, integration: Integration): Promise<boolean> {
    const flows: any[] = integration.config?.conversationFlows || [];
    const enabledFlows = flows.filter((f: any) => f.enabled && f.steps?.length > 0);
    if (!enabledFlows.length) return false;

    const workspaceId = integration.workspaceId;

    // 1. Button reply — always check first (active flow interaction)
    // Interactive replies (buttons/lists)
    if (message.type === 'interactive') {
      const interactiveReply =
        message.interactive?.button_reply || message.interactive?.list_reply;
      if (interactiveReply) {
        const buttonId = interactiveReply.id || '';
        const buttonTitle = interactiveReply.title || '';
        const handled = await this.handleButtonReply(workspaceId, waId, buttonId, integration, buttonTitle);
        if (handled) return true;
        // Some template button replies may arrive as interactive payloads.
        return this.handleTemplateButtonReply(workspaceId, waId, buttonId || buttonTitle, integration, buttonTitle);
      }

      // WhatsApp Flows (nfm_reply) or other interactive payloads can arrive
      // without button_reply/list_reply; try to recover a text candidate.
      const nfmBody = message.interactive?.nfm_reply?.body;
      const nfmResponse = message.interactive?.nfm_reply?.response_json;
      const candidates: string[] = [];
      if (typeof nfmBody === 'string' && nfmBody.trim()) candidates.push(nfmBody.trim());
      if (nfmResponse && typeof nfmResponse === 'object') {
        const flattened = Object.values(nfmResponse)
          .map((v) => String(v || '').trim())
          .filter(Boolean);
        candidates.push(...flattened);
      }
      for (const candidate of candidates) {
        const handledByButton = await this.handleButtonReply(
          workspaceId,
          waId,
          candidate,
          integration,
          candidate,
        );
        if (handledByButton) return true;
        const handledByTemplate = await this.handleTemplateButtonReply(
          workspaceId,
          waId,
          candidate,
          integration,
          candidate,
        );
        if (handledByTemplate) return true;
      }
      this.logger.warn(`Flow: interactive reply for ${waId} has no usable payload`);
      return false;
    }
    // Template quick reply buttons (from template messages, step 1)
    if (message.type === 'button' && message.button) {
      const payload = message.button.payload || message.button.text || '';
      const text = message.button.text || '';
      return this.handleTemplateButtonReply(workspaceId, waId, payload, integration, text);
    }

    // 2. Check if user already has an active flow — don't start a new one
    const flowStates = integration.config?.flowStates || {};
    const resolvedState = this.resolveFlowState(flowStates, waId);
    if (resolvedState) {
      // User is in an active flow but sent a text instead of pressing a button.
      // Expire stale flows (>24h — outside session window anyway)
      const { stateKey, state } = resolvedState;
      if (state?.pendingDelay?.nextStepId) {
        this.logger.log(`Flow: delayed step "${state.pendingDelay.nextStepId}" is pending for ${waId}`);
        return true;
      }
      const lastInteraction = new Date(state.lastInteractionAt || state.startedAt).getTime();
      if (Date.now() - lastInteraction > 24 * 60 * 60 * 1000) {
        delete flowStates[stateKey];
        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
      } else {
        // Some clients may send button presses as plain text. Try matching by text.
        if (message.type === 'text' && message.text?.body) {
          const replyText = message.text.body.trim();
          const flows: any[] = integration.config?.conversationFlows || [];
          const flow = flows.find((f: any) => f.id === state.flowId && f.enabled);
          const currentStep = flow?.steps?.find((s: any) => s.id === state.currentStepId);

          const shouldFallbackToFirstButton = Boolean(state.armedAfterAutoSend) || Boolean(currentStep?.fallbackOnTextReply);
          if (shouldFallbackToFirstButton && currentStep?.buttons?.length) {
            const fallbackButton = currentStep.buttons[0];
            if (fallbackButton?.id || fallbackButton?.title) {
              const handledFallback = await this.handleButtonReply(
                workspaceId,
                waId,
                fallbackButton.id || fallbackButton.title,
                integration,
                fallbackButton.title,
              );
              if (handledFallback) return true;
            }
          }
          const handledByButton = await this.handleButtonReply(
            workspaceId,
            waId,
            replyText,
            integration,
            replyText,
          );
          if (handledByButton) return true;

          const handledByTemplate = await this.handleTemplateButtonReply(
            workspaceId,
            waId,
            replyText,
            integration,
            replyText,
          );
          if (handledByTemplate) return true;
        }

        // Still in flow but message does not map to a button.
        this.logger.warn(`Flow: active state for ${waId} at step "${state.currentStepId}" but message did not match any button`);
        return false;
      }
    }

    // 3. Text message triggers
    if (message.type !== 'text' || !message.text?.body) return false;
    const text = message.text.body.toLowerCase().trim();

    // Check 'first_message' trigger — only if contact has no prior messages
    const firstMsgFlow = enabledFlows.find((f: any) => f.trigger === 'first_message');
    if (firstMsgFlow) {
      const phone = `+${waId}`;
      const priorMessages = await this.activityRepository.count({
        where: { workspaceId, type: ActivityType.WHATSAPP_MESSAGE },
      });
      // If this is the very first message from this waId (approximate: check if they have <=1 activity which is the one we just saved)
      const contactActivities = await this.activityRepository
        .createQueryBuilder('a')
        .where('a.workspaceId = :workspaceId', { workspaceId })
        .andWhere('a.type = :type', { type: ActivityType.WHATSAPP_MESSAGE })
        .andWhere("a.metadata->>'waId' = :waId", { waId })
        .andWhere('a.direction = :direction', { direction: ActivityDirection.INBOUND })
        .getCount();

      if (contactActivities <= 1) {
        return this.startFlow(workspaceId, waId, firstMsgFlow.id, integration);
      }
    }

    // Check 'keyword' triggers
    for (const flow of enabledFlows) {
      if (flow.trigger === 'keyword' && flow.triggerKeyword) {
        const keywords = flow.triggerKeyword.split(',').map((k: string) => k.trim().toLowerCase());
        if (keywords.some((kw: string) => text.includes(kw))) {
          return this.startFlow(workspaceId, waId, flow.id, integration);
        }
      }
    }

    return false;
  }

  /**
   * Test a flow by sending step_0 to a test phone number
   */
  async testFlow(workspaceId: string, flowId: string, testPhone: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return { success: false, message: 'No WhatsApp integration found' };

    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === flowId);
    if (!flow) return { success: false, message: 'Flow not found' };
    if (!flow.steps?.length) return { success: false, message: 'Flow has no steps' };

    const cleanPhone = testPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 7) return { success: false, message: 'Invalid phone number' };

    try {
      const firstStep = flow.steps[0];
      const delayMs = this.getFlowStepDelayMs(firstStep);

      // Set flow state so button replies work
      const flowStates = integration.config?.flowStates || {};
      flowStates[cleanPhone] = {
        flowId: flow.id,
        currentStepId: firstStep.id,
        startedAt: new Date().toISOString(),
        lastInteractionAt: new Date().toISOString(),
      };
      if (delayMs > 0) {
        flowStates[cleanPhone] = {
          ...flowStates[cleanPhone],
          pendingDelay: {
            flowId: flow.id,
            nextStepId: firstStep.id,
            dueAt: new Date(Date.now() + delayMs).toISOString(),
          },
        };
        integration.config = { ...(integration.config || {}), flowStates };
        await this.integrationRepository.save(integration);
        this.scheduleDelayedFlowStep(workspaceId, cleanPhone, flow.id, firstStep.id, delayMs);
        return { success: true, message: `Flow "${flow.name}" scheduled in ${Math.ceil(delayMs / 1000)}s to +${cleanPhone}` };
      }

      await this.sendFlowStep(firstStep, cleanPhone, integration.credentials || {}, workspaceId);

      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);

      return { success: true, message: `Flow "${flow.name}" step 1 sent to +${cleanPhone}` };
    } catch (err) {
      return { success: false, message: `Failed: ${err.response?.data?.error?.message || err.message}` };
    }
  }
}
