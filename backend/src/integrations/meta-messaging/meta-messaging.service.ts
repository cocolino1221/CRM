import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import {
  Activity,
  ActivityDirection,
  ActivityOutcome,
  ActivityType,
} from '../../database/entities/activity.entity';
import {
  Contact,
  ContactSource,
  ContactStatus,
} from '../../database/entities/contact.entity';
import {
  Integration,
  IntegrationType,
} from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { NotificationsService } from '../../notifications/notifications.service';

export type MetaChannel = 'messenger' | 'instagram';

type MetaProvider = 'facebook' | 'instagram';

interface MetaSendContext {
  channel: MetaChannel;
  to: string;
  integrationId?: string;
  simulate?: boolean;
}

interface MetaOutboundResult {
  simulated: boolean;
  channel: MetaChannel;
  messageId: string;
  integrationId?: string;
  externalResponse?: any;
}

interface MetaAttachmentInfo {
  url?: string;
  mimeType?: string;
  name?: string;
  type: 'audio' | 'image' | 'video' | 'file';
}

interface MetaActivityMetadata {
  channel: MetaChannel;
  provider: MetaProvider;
  externalUserId: string;
  externalThreadId: string;
  externalMessageId?: string;
  messageType: string;
  senderIntegrationId?: string;
  senderPageId?: string;
  senderPageName?: string;
  senderAccountId?: string;
  senderAccountName?: string;
  senderProfileId?: string;
  senderProfileName?: string;
  attachmentUrl?: string;
  attachmentMimeType?: string;
  attachmentName?: string;
  isSimulated?: boolean;
  messageStatus?: string;
  replyToMessageId?: string;
  [key: string]: any;
}

@Injectable()
export class MetaMessagingService {
  private readonly logger = new Logger(MetaMessagingService.name);
  private readonly facebookApiUrl = 'https://graph.facebook.com/v23.0';
  private readonly instagramApiUrl = 'https://graph.instagram.com/v23.0';

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

  async verifyWebhookToken(
    provider: MetaProvider,
    integrationId: string,
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string | null> {
    if (mode !== 'subscribe') return null;

    const integration = await this.findProviderIntegrationById(provider, integrationId);
    const expectedToken = await this.ensureVerifyToken(integration);

    if (token === expectedToken) {
      return challenge;
    }

    this.logger.warn(
      `Meta webhook verification failed for provider=${provider}, integration=${integrationId}`,
    );
    return null;
  }

  async getSetupInfo(workspaceId: string): Promise<any> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const appUrl = this.getAppBaseUrl();

    return Promise.all(
      integrations.map(async (integration) => {
        const provider = this.getIntegrationProvider(integration);
        const verifyToken = await this.ensureVerifyToken(integration);
        return {
          integrationId: integration.id,
          provider,
          name: integration.name,
          status: integration.status,
          webhookUrl: `${appUrl}/api/v1/integrations/meta-messaging/webhook/${provider}/${integration.id}`,
          verifyToken,
          instructions: [
            `1. In Meta for Developers, open the ${provider === 'facebook' ? 'Messenger' : 'Instagram'} product webhooks`,
            `2. Set Callback URL to ${appUrl}/api/v1/integrations/meta-messaging/webhook/${provider}/${integration.id}`,
            `3. Set Verify Token to ${verifyToken}`,
            '4. Subscribe to message-related webhook events',
          ],
        };
      }),
    );
  }

  async getAccounts(workspaceId: string, refresh = false): Promise<any[]> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const results: any[] = [];

    for (const integration of integrations) {
      const provider = this.getIntegrationProvider(integration);
      let accountSummary: any = null;
      let liveReady = false;
      let warning: string | null = null;

      try {
        if (refresh) {
          if (provider === 'facebook') {
            accountSummary = await this.ensureFacebookPageCredentials(integration);
            liveReady = !!accountSummary.pageId && !!accountSummary.pageAccessToken;
          } else {
            accountSummary = await this.ensureInstagramMessagingCredentials(integration);
            liveReady = !!accountSummary.igUserId && !!accountSummary.pageAccessToken;
          }
        } else {
          accountSummary = this.readAccountSummary(integration, provider);
          liveReady = provider === 'facebook'
            ? !!integration.credentials?.pageAccessToken && !!integration.config?.pageId
            : !!integration.credentials?.pageAccessToken && !!integration.config?.igUserId;
        }
      } catch (error: any) {
        warning = error?.message || 'Could not refresh account details';
      }

      const messageProfile = this.getMessageProfile(integration);

      results.push({
        integrationId: integration.id,
        provider,
        name: integration.name,
        status: integration.status,
        liveReady,
        warning,
        messageProfileId: messageProfile?.id || null,
        messageProfileName: messageProfile?.name || null,
        account: accountSummary,
      });
    }

    return results;
  }

  async getInbox(workspaceId: string, channel?: MetaChannel): Promise<any> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const integrationsById = new Map(integrations.map((integration) => [integration.id, integration]));
    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.contact', 'contact')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.type = :type', { type: ActivityType.OTHER })
      .andWhere("activity.metadata->>'channel' IN ('messenger','instagram')")
      .orderBy('activity.occurredAt', 'ASC');

    if (channel) {
      qb.andWhere("activity.metadata->>'channel' = :channel", { channel });
    }

    const activities = await qb.getMany();
    const conversations = new Map<string, any>();

    for (const activity of activities) {
      const metadata = (activity.metadata || {}) as MetaActivityMetadata;
      const activityChannel = metadata.channel;
      const externalUserId = String(metadata.externalUserId || '').trim();
      if (!activityChannel || !externalUserId) continue;
      const integration = metadata.senderIntegrationId
        ? integrationsById.get(String(metadata.senderIntegrationId))
        : undefined;
      const messageProfile = this.getMessageProfile(integration, metadata, activityChannel);

      const key = this.buildConversationKey(activityChannel, externalUserId, metadata);
      if (!conversations.has(key)) {
        const accountId = this.getConversationAccountId(activityChannel, metadata) || null;
        const accountName = this.getConversationAccountName(activityChannel, metadata, activity, integration) || null;
        conversations.set(key, {
          id: key,
          channel: activityChannel,
          externalUserId,
          externalThreadId: metadata.externalThreadId || externalUserId,
          integrationId: metadata.senderIntegrationId || null,
          accountId,
          accountName,
          messageProfileId: messageProfile?.id || null,
          messageProfileName: messageProfile?.name || null,
          contactId: activity.contact?.id || null,
          contactName: this.getContactDisplayName(activity.contact, activityChannel, externalUserId),
          contactSource: activity.contact?.source || null,
          lastMessage: '',
          lastMessageTime: activity.occurredAt.toISOString(),
          unreadCount: 0,
          messages: [],
        });
      }

      const conversation = conversations.get(key);
      const messageType = String(metadata.messageType || 'text');
      const message = {
        id: activity.id,
        direction: activity.direction,
        description: activity.description || '',
        occurredAt: activity.occurredAt.toISOString(),
        metadata: {
          externalMessageId: metadata.externalMessageId,
          externalThreadId: metadata.externalThreadId,
          externalUserId: metadata.externalUserId,
          messageType,
          attachmentUrl: metadata.attachmentUrl,
          attachmentMimeType: metadata.attachmentMimeType,
          attachmentName: metadata.attachmentName,
          senderPageName: metadata.senderPageName,
          senderAccountName: metadata.senderAccountName,
          isSimulated: !!metadata.isSimulated,
          messageStatus: metadata.messageStatus,
        },
      };

      conversation.messages.push(message);
      conversation.lastMessage = activity.description || `[${messageType}]`;
      conversation.lastMessageTime = activity.occurredAt.toISOString();
      if (activity.direction === ActivityDirection.INBOUND) {
        conversation.unreadCount += 1;
      }
    }

    const conversationList = Array.from(conversations.values()).sort(
      (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
    );

    return { data: conversationList };
  }

  async ensureConversationContact(
    workspaceId: string,
    ownerId: string,
    input: {
      channel: MetaChannel;
      externalUserId: string;
      senderName?: string;
      integrationId?: string;
    },
  ): Promise<{ contact: Contact; linkedActivities: number }> {
    const channel = this.normalizeChannel(input.channel);
    const externalUserId = String(input.externalUserId || '').trim();
    const senderName = String(input.senderName || '').trim();
    const integrationId = String(input.integrationId || '').trim() || undefined;

    if (!externalUserId) {
      throw new BadRequestException('External user id is required');
    }

    const contact = await this.findOrCreateSocialContact(
      workspaceId,
      ownerId,
      channel,
      externalUserId,
      senderName || undefined,
    );

    const updateResult = await this.activityRepository
      .createQueryBuilder()
      .update(Activity)
      .set({ contactId: contact.id })
      .where('workspaceId = :workspaceId', { workspaceId })
      .andWhere('type = :type', { type: ActivityType.OTHER })
      .andWhere("metadata->>'channel' = :channel", { channel })
      .andWhere("metadata->>'externalUserId' = :externalUserId", { externalUserId })
      .andWhere(
        integrationId
          ? "metadata->>'senderIntegrationId' = :integrationId"
          : '1=1',
        integrationId ? { integrationId } : {},
      )
      .andWhere('contactId IS NULL')
      .execute();

    const hydratedContact = await this.contactRepository.findOne({
      where: { id: contact.id, workspaceId },
      relations: ['owner', 'setter', 'caller', 'closer'],
    });

    if (!hydratedContact) {
      throw new NotFoundException('Contact was created but could not be reloaded');
    }

    const leadName = this.getContactDisplayName(hydratedContact, channel, externalUserId);
    const sourceLabel = channel === 'messenger' ? 'Messenger' : 'Instagram';
    try {
      await this.notificationsService.create(workspaceId, {
        type: NotificationType.LEAD,
        title: 'Lead added to CRM',
        message: `${leadName} was added from ${sourceLabel}.`,
        userId: ownerId,
        link: '/contacts',
        metadata: {
          contactId: hydratedContact.id,
          channel,
          externalUserId,
          integrationId: integrationId || null,
          linkedActivities: updateResult.affected || 0,
          source: 'meta-messaging:add-to-lead',
        },
      });
    } catch (error: any) {
      this.logger.warn(`Lead add notification failed: ${error?.message || 'unknown error'}`);
    }

    return {
      contact: hydratedContact,
      linkedActivities: updateResult.affected || 0,
    };
  }

  async simulateInbound(
    workspaceId: string,
    userId: string,
    body: {
      channel: MetaChannel;
      from: string;
      senderName?: string;
      text?: string;
      audioUrl?: string;
      integrationId?: string;
      attachmentName?: string;
    },
  ): Promise<any> {
    const channel = this.normalizeChannel(body.channel);
    const provider = this.channelToProvider(channel);
    const integration = body.integrationId
      ? await this.findProviderIntegrationById(provider, body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, provider);
    const ownerId = userId || integration?.userId || (await this.getWorkspaceOwnerId(workspaceId));

    const senderId = String(body.from || '').trim();
    if (!senderId) {
      throw new BadRequestException('Sender ID is required');
    }

    const contact = await this.findOrCreateSocialContact(
      workspaceId,
      ownerId,
      channel,
      senderId,
      body.senderName,
    );

    const messageType = body.audioUrl ? 'audio' : 'text';
    const description = body.audioUrl
      ? '[Audio message]'
      : String(body.text || '').trim() || '[Empty message]';

    await this.saveInboundActivity(
      workspaceId,
      ownerId,
      contact,
      {
        channel,
        provider,
        externalUserId: senderId,
        externalThreadId: senderId,
        externalMessageId: `sim_${nanoid(16)}`,
        messageType,
        senderIntegrationId: integration?.id,
        senderPageId: String(integration?.config?.pageId || ''),
        senderPageName: String(integration?.config?.pageName || ''),
        senderAccountId: channel === 'instagram' ? String(integration?.config?.igUserId || '') : undefined,
        senderAccountName: channel === 'instagram' ? String(integration?.config?.igUsername || '') : undefined,
        ...this.getMessageProfileMetadata(integration),
        attachmentUrl: body.audioUrl,
        attachmentMimeType: body.audioUrl ? 'audio/mpeg' : undefined,
        attachmentName: body.attachmentName,
        isSimulated: true,
      },
      description,
    );

    return { success: true, simulated: true };
  }

  async sendTextMessage(
    workspaceId: string,
    userId: string,
    body: MetaSendContext & { message: string },
  ): Promise<MetaOutboundResult> {
    const message = String(body.message || '').trim();
    if (!message) {
      throw new BadRequestException('Message is required');
    }

    return this.sendOutboundMessage(workspaceId, userId, body, {
      type: 'text',
      description: message,
      send: async (resolved) => {
        if (resolved.channel === 'messenger') {
          return this.sendMessengerPayload(
            resolved.pageId,
            resolved.accessToken,
            {
              recipient: { id: body.to },
              messaging_type: 'RESPONSE',
              message: { text: message },
            },
          );
        }

        return this.sendInstagramPayload(
          resolved.igUserId,
          resolved.accessToken,
          {
            recipient: { id: body.to },
            message: { text: message },
          },
        );
      },
    });
  }

  async sendAudioMessage(
    workspaceId: string,
    userId: string,
    body: MetaSendContext & { audioUrl: string; attachmentName?: string },
  ): Promise<MetaOutboundResult> {
    const audioUrl = String(body.audioUrl || '').trim();
    if (!audioUrl) {
      throw new BadRequestException('audioUrl is required');
    }

    const attachmentInfo: MetaAttachmentInfo = {
      type: 'audio',
      url: audioUrl,
      mimeType: 'audio/mpeg',
      name: String(body.attachmentName || '').trim() || undefined,
    };

    return this.sendOutboundMessage(workspaceId, userId, body, {
      type: 'audio',
      description: '[Audio message]',
      attachmentInfo,
      send: async (resolved) => {
        if (resolved.channel === 'messenger') {
          return this.sendMessengerPayload(
            resolved.pageId,
            resolved.accessToken,
            {
              recipient: { id: body.to },
              messaging_type: 'RESPONSE',
              message: {
                attachment: {
                  type: 'audio',
                  payload: { url: audioUrl, is_reusable: false },
                },
              },
            },
          );
        }

        return this.sendInstagramPayload(
          resolved.igUserId,
          resolved.accessToken,
          {
            recipient: { id: body.to },
            message: {
              attachment: {
                type: 'audio',
                payload: { url: audioUrl },
              },
            },
          },
        );
      },
    });
  }

  async handleWebhook(
    provider: MetaProvider,
    integrationId: string,
    payload: any,
  ): Promise<{ success: boolean }> {
    const integration = await this.findProviderIntegrationById(provider, integrationId);
    const workspaceId = integration.workspaceId;
    const ownerId = integration.userId || (await this.getWorkspaceOwnerId(workspaceId));

    const entryList = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entryList) {
      const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of messagingEvents) {
        await this.ingestWebhookEvent(provider, integration, workspaceId, ownerId, event);
      }
    }

    return { success: true };
  }

  private async ingestWebhookEvent(
    provider: MetaProvider,
    integration: Integration,
    workspaceId: string,
    ownerId: string,
    event: any,
  ): Promise<void> {
    const channel: MetaChannel = provider === 'facebook' ? 'messenger' : 'instagram';
    const senderId = String(event?.sender?.id || '').trim();
    if (!senderId) return;

    const recipientId = String(event?.recipient?.id || '').trim() || senderId;
    const message = event?.message || {};
    const postback = event?.postback;
    const quickReply = message?.quick_reply;
    const text = String(message?.text || quickReply?.payload || postback?.title || '').trim();
    const attachment = Array.isArray(message?.attachments) ? message.attachments[0] : undefined;
    const attachmentType = this.normalizeInboundAttachmentType(attachment?.type);
    const attachmentUrl = String(attachment?.payload?.url || '').trim() || undefined;
    const description = attachmentType === 'audio'
      ? '[Audio message]'
      : text || `[${attachmentType || 'message'}]`;
    const externalMessageId = String(message?.mid || postback?.mid || `meta_${nanoid(16)}`);

    const senderName = await this.fetchSenderName(provider, integration, senderId);
    const contact = await this.findOrCreateSocialContact(
      workspaceId,
      ownerId,
      channel,
      senderId,
      senderName,
    );

    await this.saveInboundActivity(
      workspaceId,
      ownerId,
      contact,
      {
        channel,
        provider,
        externalUserId: senderId,
        externalThreadId: recipientId,
        externalMessageId,
        messageType: attachmentType || (text ? 'text' : 'event'),
        senderIntegrationId: integration.id,
        senderPageId: String(integration.config?.pageId || recipientId),
        senderPageName: String(integration.config?.pageName || integration.name || ''),
        senderAccountId: provider === 'instagram' ? String(integration.config?.igUserId || recipientId) : undefined,
        senderAccountName: provider === 'instagram' ? String(integration.config?.igUsername || integration.name || '') : undefined,
        ...this.getMessageProfileMetadata(integration),
        attachmentUrl,
        attachmentMimeType: this.guessMimeTypeFromUrl(attachmentUrl, attachmentType),
        attachmentName: this.extractFilename(attachmentUrl),
        rawEvent: event,
      },
      description,
    );
  }

  private async sendOutboundMessage(
    workspaceId: string,
    userId: string,
    body: MetaSendContext,
    options: {
      type: string;
      description: string;
      attachmentInfo?: MetaAttachmentInfo;
      send: (resolved: {
        channel: MetaChannel;
        accessToken: string;
        pageId: string;
        pageName?: string;
        igUserId: string;
        igUsername?: string;
        integration: Integration;
      }) => Promise<any>;
    },
  ): Promise<MetaOutboundResult> {
    const channel = this.normalizeChannel(body.channel);
    const to = String(body.to || '').trim();
    if (!to) {
      throw new BadRequestException('Recipient ID is required');
    }

    const provider = this.channelToProvider(channel);
    const integration = body.integrationId
      ? await this.findProviderIntegrationById(provider, body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, provider);

    const ownerId = userId || integration?.userId || (await this.getWorkspaceOwnerId(workspaceId));
    const liveConfig = channel === 'messenger'
      ? {
          ...(await this.ensureFacebookPageCredentials(integration)),
          igUserId: '',
          igUsername: undefined as string | undefined,
        }
      : await this.ensureInstagramMessagingCredentials(integration);

    const simulated = !!body.simulate;
    let externalResponse: any = null;
    let externalMessageId = `sim_${nanoid(16)}`;

    if (!simulated) {
      externalResponse = await options.send({
        channel,
        accessToken: liveConfig.pageAccessToken,
        pageId: liveConfig.pageId,
        pageName: liveConfig.pageName,
        igUserId: liveConfig.igUserId || '',
        igUsername: liveConfig.igUsername,
        integration,
      });
      externalMessageId = String(
        externalResponse?.message_id ||
        externalResponse?.messageId ||
        externalResponse?.messages?.[0]?.id ||
        externalResponse?.recipient_id ||
        `meta_${nanoid(16)}`,
      );
    }

    await this.saveOutboundActivity(
      workspaceId,
      ownerId,
      {
        channel,
        provider,
        externalUserId: to,
        externalThreadId: to,
        externalMessageId,
        messageType: options.type,
        senderIntegrationId: integration.id,
        senderPageId: liveConfig.pageId,
        senderPageName: liveConfig.pageName,
        senderAccountId: channel === 'instagram' ? liveConfig.igUserId : undefined,
        senderAccountName: channel === 'instagram' ? liveConfig.igUsername : undefined,
        ...this.getMessageProfileMetadata(integration),
        attachmentUrl: options.attachmentInfo?.url,
        attachmentMimeType: options.attachmentInfo?.mimeType,
        attachmentName: options.attachmentInfo?.name,
        isSimulated: simulated,
        messageStatus: simulated ? 'simulated' : 'sent',
      },
      options.description,
      to,
    );

    return {
      simulated,
      channel,
      integrationId: integration.id,
      messageId: externalMessageId,
      externalResponse,
    };
  }

  private async saveInboundActivity(
    workspaceId: string,
    ownerId: string,
    contact: Contact,
    metadata: MetaActivityMetadata,
    description: string,
  ): Promise<void> {
    const titlePrefix = metadata.channel === 'messenger' ? 'Messenger' : 'Instagram';
    const activity = this.activityRepository.create({
      workspaceId,
      userId: ownerId,
      contactId: contact.id,
      type: ActivityType.OTHER,
      title: `${titlePrefix} from ${contact.firstName} ${contact.lastName}`.trim(),
      description,
      direction: ActivityDirection.INBOUND,
      outcome: ActivityOutcome.SUCCESSFUL,
      occurredAt: new Date(),
      metadata,
    });

    await this.activityRepository.save(activity);
  }

  private async saveOutboundActivity(
    workspaceId: string,
    ownerId: string,
    metadata: MetaActivityMetadata,
    description: string,
    recipientExternalUserId: string,
  ): Promise<void> {
    const contact = await this.findExistingSocialContact(
      workspaceId,
      metadata.channel,
      recipientExternalUserId,
    );
    const titlePrefix = metadata.channel === 'messenger' ? 'Messenger' : 'Instagram';
    const titleTarget = contact
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : recipientExternalUserId;

    const activity = this.activityRepository.create({
      workspaceId,
      userId: ownerId,
      contactId: contact?.id,
      type: ActivityType.OTHER,
      title: `${titlePrefix} to ${titleTarget}`,
      description,
      direction: ActivityDirection.OUTBOUND,
      outcome: ActivityOutcome.SUCCESSFUL,
      occurredAt: new Date(),
      metadata,
    });

    await this.activityRepository.save(activity);
  }

  private async findOrCreateSocialContact(
    workspaceId: string,
    ownerId: string,
    channel: MetaChannel,
    externalUserId: string,
    senderName?: string,
  ): Promise<Contact> {
    let contact = await this.findExistingSocialContact(workspaceId, channel, externalUserId);
    if (contact) return contact;

    const nameParts = String(senderName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0]
      || (channel === 'messenger' ? 'Messenger' : 'Instagram');
    const lastName = nameParts.slice(1).join(' ') || 'Contact';
    const placeholderEmail = `${channel}.${externalUserId}@meta.placeholder.invalid`;

    const customFields: Record<string, any> = {
      ...(channel === 'messenger' ? { messengerPsid: externalUserId } : {}),
      ...(channel === 'instagram' ? { instagramScopedId: externalUserId } : {}),
    };

    contact = this.contactRepository.create({
      workspaceId,
      ownerId,
      firstName,
      lastName,
      email: placeholderEmail,
      status: ContactStatus.LEAD,
      source: channel === 'messenger' ? ContactSource.FACEBOOK : ContactSource.INSTAGRAM,
      customFields,
    });

    return this.contactRepository.save(contact);
  }

  private async findExistingSocialContact(
    workspaceId: string,
    channel: MetaChannel,
    externalUserId: string,
  ): Promise<Contact | null> {
    const fieldName = channel === 'messenger' ? 'messengerPsid' : 'instagramScopedId';

    const byCustomField = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`"contact"."customFields"->>'${fieldName}' = :externalUserId`, { externalUserId })
      .orderBy('contact.createdAt', 'DESC')
      .getOne();

    if (byCustomField) return byCustomField;

    const placeholderEmail = `${channel}.${externalUserId}@meta.placeholder.invalid`;
    return this.contactRepository.findOne({
      where: { workspaceId, email: placeholderEmail },
      order: { createdAt: 'DESC' },
    });
  }

  private async findMetaIntegrations(workspaceId: string): Promise<Integration[]> {
    const rows = await this.integrationRepository.find({
      where: { workspaceId, type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    return rows.filter((integration) => {
      const provider = this.getIntegrationProvider(integration);
      return provider === 'facebook' || provider === 'instagram';
    });
  }

  private async findProviderIntegrationById(
    provider: MetaProvider,
    integrationId: string,
    workspaceId?: string,
  ): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: {
        id: integrationId,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });

    if (!integration || integration.type !== IntegrationType.API) {
      throw new NotFoundException('Meta integration not found');
    }

    if (this.getIntegrationProvider(integration) !== provider) {
      throw new BadRequestException('Integration/provider mismatch');
    }

    return integration;
  }

  private async findDefaultProviderIntegration(
    workspaceId: string,
    provider: MetaProvider,
  ): Promise<Integration> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const integration = integrations.find((row) => this.getIntegrationProvider(row) === provider);

    if (!integration) {
      throw new BadRequestException(
        `${provider === 'facebook' ? 'Facebook Messenger' : 'Instagram'} integration is not connected for this workspace`,
      );
    }

    return integration;
  }

  private getIntegrationProvider(integration: Integration): MetaProvider {
    const provider = String(integration.config?.provider || integration.externalId || '')
      .trim()
      .toLowerCase();
    if (provider === 'facebook') return 'facebook';
    return 'instagram';
  }

  private channelToProvider(channel: MetaChannel): MetaProvider {
    return channel === 'messenger' ? 'facebook' : 'instagram';
  }

  private normalizeChannel(channel: string): MetaChannel {
    const normalized = String(channel || '').trim().toLowerCase();
    if (normalized === 'messenger' || normalized === 'facebook') return 'messenger';
    if (normalized === 'instagram' || normalized === 'ig') return 'instagram';
    throw new BadRequestException('Unsupported channel');
  }

  private async ensureVerifyToken(integration: Integration): Promise<string> {
    const existing = String(integration.config?.verifyToken || '').trim();
    if (existing) return existing;

    integration.config = {
      ...(integration.config || {}),
      verifyToken: `meta_${nanoid(24)}`,
    };
    await this.integrationRepository.save(integration);
    return String(integration.config.verifyToken);
  }

  private async ensureFacebookPageCredentials(integration: Integration): Promise<{
    pageId: string;
    pageName?: string;
    pageAccessToken: string;
  }> {
    const existingPageId = String(integration.config?.pageId || '').trim();
    const existingPageAccessToken = String(integration.credentials?.pageAccessToken || '').trim();
    const existingPageName = String(integration.config?.pageName || '').trim() || undefined;

    if (existingPageId && existingPageAccessToken) {
      return {
        pageId: existingPageId,
        pageName: existingPageName,
        pageAccessToken: existingPageAccessToken,
      };
    }

    const userAccessToken = String(integration.credentials?.accessToken || '').trim();
    if (!userAccessToken) {
      throw new BadRequestException('Facebook integration is missing an access token');
    }

    const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/me/accounts`, {
      params: {
        fields: 'id,name,access_token',
        access_token: userAccessToken,
      },
      timeout: 15000,
    });

    const pages = Array.isArray(response.data?.data) ? response.data.data : [];
    const selectedPage = pages.find((page: any) => String(page?.id || '') === existingPageId) || pages[0];

    if (!selectedPage?.id || !selectedPage?.access_token) {
      throw new BadRequestException('No Facebook Page with messaging access was found');
    }

    integration.config = {
      ...(integration.config || {}),
      pageId: String(selectedPage.id),
      pageName: String(selectedPage.name || integration.name || 'Facebook Page'),
    };
    integration.credentials = {
      ...(integration.credentials || {}),
      pageAccessToken: String(selectedPage.access_token),
    };
    await this.integrationRepository.save(integration);

    return {
      pageId: String(selectedPage.id),
      pageName: String(selectedPage.name || integration.name || 'Facebook Page'),
      pageAccessToken: String(selectedPage.access_token),
    };
  }

  private async ensureInstagramMessagingCredentials(integration: Integration): Promise<{
    pageId: string;
    pageName?: string;
    pageAccessToken: string;
    igUserId: string;
    igUsername?: string;
  }> {
    const existingPageId = String(integration.config?.pageId || '').trim();
    const existingPageAccessToken = String(integration.credentials?.pageAccessToken || '').trim();
    const existingIgUserId = String(integration.config?.igUserId || '').trim();
    const existingPageName = String(integration.config?.pageName || '').trim() || undefined;
    const existingIgUsername = String(integration.config?.igUsername || '').trim() || undefined;

    if (existingPageId && existingPageAccessToken && existingIgUserId) {
      return {
        pageId: existingPageId,
        pageName: existingPageName,
        pageAccessToken: existingPageAccessToken,
        igUserId: existingIgUserId,
        igUsername: existingIgUsername,
      };
    }

    const userAccessToken = String(integration.credentials?.accessToken || '').trim();
    if (!userAccessToken) {
      throw new BadRequestException('Instagram integration is missing an access token');
    }

    const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/me/accounts`, {
      params: {
        fields: 'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}',
        access_token: userAccessToken,
      },
      timeout: 15000,
    });

    const pages = Array.isArray(response.data?.data) ? response.data.data : [];
    const selectedPage = pages.find((page: any) => {
      if (existingPageId && String(page?.id || '') !== existingPageId) return false;
      return !!(page?.instagram_business_account?.id || page?.connected_instagram_account?.id);
    }) || pages.find((page: any) => !!(page?.instagram_business_account?.id || page?.connected_instagram_account?.id));

    const igAccount = selectedPage?.instagram_business_account || selectedPage?.connected_instagram_account;
    if (!selectedPage?.id || !selectedPage?.access_token || !igAccount?.id) {
      throw new BadRequestException('No Instagram Business account linked to a managed Facebook Page was found');
    }

    integration.config = {
      ...(integration.config || {}),
      pageId: String(selectedPage.id),
      pageName: String(selectedPage.name || 'Facebook Page'),
      igUserId: String(igAccount.id),
      igUsername: String(igAccount.username || integration.name || 'Instagram'),
    };
    integration.credentials = {
      ...(integration.credentials || {}),
      pageAccessToken: String(selectedPage.access_token),
    };
    await this.integrationRepository.save(integration);

    return {
      pageId: String(selectedPage.id),
      pageName: String(selectedPage.name || 'Facebook Page'),
      pageAccessToken: String(selectedPage.access_token),
      igUserId: String(igAccount.id),
      igUsername: String(igAccount.username || integration.name || 'Instagram'),
    };
  }

  private async sendMessengerPayload(pageId: string, accessToken: string, payload: any): Promise<any> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.facebookApiUrl}/${pageId}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    return response.data;
  }

  private async sendInstagramPayload(igUserId: string, accessToken: string, payload: any): Promise<any> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.instagramApiUrl}/${igUserId}/messages`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    return response.data;
  }

  private async fetchSenderName(
    provider: MetaProvider,
    integration: Integration,
    senderId: string,
  ): Promise<string | undefined> {
    try {
      if (provider === 'facebook') {
        const { pageAccessToken } = await this.ensureFacebookPageCredentials(integration);
        const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/${senderId}`, {
          params: {
            fields: 'first_name,last_name',
            access_token: pageAccessToken,
          },
          timeout: 10000,
        });
        const firstName = String(response.data?.first_name || '').trim();
        const lastName = String(response.data?.last_name || '').trim();
        return `${firstName} ${lastName}`.trim() || undefined;
      }

      const { pageAccessToken } = await this.ensureInstagramMessagingCredentials(integration);
      const response = await this.httpService.axiosRef.get(`${this.instagramApiUrl}/${senderId}`, {
        params: {
          fields: 'username,name',
          access_token: pageAccessToken,
        },
        timeout: 10000,
      });
      return String(response.data?.name || response.data?.username || '').trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private readAccountSummary(integration: Integration, provider: MetaProvider): any {
    if (provider === 'facebook') {
      return {
        pageId: integration.config?.pageId || null,
        pageName: integration.config?.pageName || null,
      };
    }

    return {
      pageId: integration.config?.pageId || null,
      pageName: integration.config?.pageName || null,
      igUserId: integration.config?.igUserId || null,
      igUsername: integration.config?.igUsername || null,
    };
  }

  private getContactDisplayName(
    contact: Contact | undefined,
    channel: MetaChannel,
    externalUserId: string,
  ): string {
    const fullName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim();
    if (fullName) return fullName;
    return channel === 'messenger'
      ? `Messenger ${externalUserId}`
      : `Instagram ${externalUserId}`;
  }

  private buildConversationKey(
    channel: MetaChannel,
    externalUserId: string,
    metadata: MetaActivityMetadata,
  ): string {
    const accountKey =
      this.getConversationAccountId(channel, metadata)
      || String(metadata.senderIntegrationId || '').trim()
      || 'default';
    return `${channel}:${accountKey}:${externalUserId}`;
  }

  private getConversationAccountId(
    channel: MetaChannel,
    metadata: MetaActivityMetadata,
  ): string {
    if (channel === 'instagram') {
      return String(
        metadata.senderAccountId
        || metadata.senderPageId
        || metadata.senderIntegrationId
        || '',
      ).trim();
    }

    return String(metadata.senderPageId || metadata.senderIntegrationId || '').trim();
  }

  private getConversationAccountName(
    channel: MetaChannel,
    metadata: MetaActivityMetadata,
    activity?: Activity,
    integration?: Integration,
  ): string {
    if (channel === 'instagram') {
      return String(
        integration?.config?.igUsername
        || integration?.config?.pageName
        || metadata.senderAccountName
        || metadata.senderPageName
        || activity?.title
        || '',
      ).trim();
    }

    return String(
      integration?.config?.pageName
      || integration?.name
      || metadata.senderPageName
      || metadata.senderAccountName
      || activity?.title
      || '',
    ).trim();
  }

  private getMessageProfile(
    integration?: Integration,
    metadata?: MetaActivityMetadata,
    channel?: MetaChannel,
  ): { id: string; name: string } | null {
    const currentProfile = integration?.config?.messageProfile;
    const profileId = String(currentProfile?.id || metadata?.senderProfileId || '').trim();
    const profileName = String(currentProfile?.name || metadata?.senderProfileName || '').trim();

    if (!profileId && !profileName) {
      return null;
    }

    return {
      id: profileId || this.buildSyntheticProfileId(channel || 'messenger', profileName),
      name: profileName || 'Message profile',
    };
  }

  private getMessageProfileMetadata(
    integration?: Integration,
  ): Pick<MetaActivityMetadata, 'senderProfileId' | 'senderProfileName'> {
    const profile = this.getMessageProfile(integration);

    return {
      senderProfileId: profile?.id,
      senderProfileName: profile?.name,
    };
  }

  private buildSyntheticProfileId(channel: MetaChannel, profileName: string): string {
    const normalized = String(profileName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${channel}:${normalized || 'default-profile'}`;
  }

  private normalizeInboundAttachmentType(type: string): string | undefined {
    const normalized = String(type || '').trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'audio') return 'audio';
    if (normalized === 'image') return 'image';
    if (normalized === 'video') return 'video';
    return 'file';
  }

  private guessMimeTypeFromUrl(url?: string, type?: string): string | undefined {
    if (!url) return undefined;
    const lower = url.toLowerCase();
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.mp4')) return type === 'audio' ? 'audio/mp4' : 'video/mp4';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    return undefined;
  }

  private extractFilename(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      const parsed = new URL(url);
      const candidate = parsed.pathname.split('/').pop();
      return candidate || undefined;
    } catch {
      const candidate = url.split('/').pop();
      return candidate || undefined;
    }
  }

  private async getWorkspaceOwnerId(workspaceId: string): Promise<string> {
    const owner = await this.userRepository.findOne({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    if (!owner?.id) {
      throw new BadRequestException('No workspace owner found');
    }
    return owner.id;
  }

  private getAppBaseUrl(): string {
    const configured = String(
      this.configService.get('APP_URL') ||
      this.configService.get('BACKEND_URL') ||
      'http://localhost:4000',
    ).trim();
    return configured.replace(/\/$/, '');
  }
}
