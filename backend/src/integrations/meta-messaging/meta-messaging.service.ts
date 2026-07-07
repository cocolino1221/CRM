import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { createReadStream, promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
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
  IntegrationStatus,
  IntegrationType,
} from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { Workspace } from '../../database/entities/workspace.entity';
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

export interface MetaOutboundResult {
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

export interface MetaAudioTemplate {
  id: string;
  name: string;
  attachmentId: string;
  channel: MetaChannel;
  createdAt: string;
}

export interface MetaUploadedAudioFile {
  path: string;
  mimetype?: string;
  originalname?: string;
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
  attachmentTitle?: string;
  isSimulated?: boolean;
  messageStatus?: string;
  replyToMessageId?: string;
  [key: string]: any;
}

@Injectable()
export class MetaMessagingService {
  private readonly logger = new Logger(MetaMessagingService.name);
  private readonly facebookApiUrl = 'https://graph.facebook.com/v23.0';
  // In-memory dedup for webhook deliveries. Meta retries/echoes the same
  // message id, sometimes near-simultaneously — the async DB check can't catch
  // that race. A synchronous check+mark (before any await) closes it on a
  // single instance. mid -> last-seen epoch ms.
  private readonly recentMessageIds = new Map<string, number>();
  private static readonly RECENT_ID_TTL_MS = 10 * 60 * 1000;

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
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  static readonly STREAM_EVENT = 'meta.message';

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

  async verifyProviderWebhookToken(
    provider: MetaProvider,
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string | null> {
    if (mode !== 'subscribe') return null;

    const integrations = await this.findAllProviderIntegrations(provider);
    const normalizedToken = String(token || '').trim();
    const match = integrations.find(
      (integration) => String(integration.config?.verifyToken || '').trim() === normalizedToken,
    );

    if (match) {
      return challenge;
    }

    this.logger.warn(`Shared Meta webhook verification failed for provider=${provider}`);
    return null;
  }

  async getSetupInfo(workspaceId: string): Promise<any> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const appUrl = this.getAppBaseUrl();
    const grouped = new Map<MetaProvider, Integration[]>();

    for (const integration of integrations) {
      const provider = this.getIntegrationProvider(integration);
      if (!provider) continue;
      const bucket = grouped.get(provider) || [];
      bucket.push(integration);
      grouped.set(provider, bucket);
    }

    return Promise.all(
      Array.from(grouped.entries()).map(async ([provider, providerIntegrations]) => {
        const verifyToken = await this.ensureProviderVerifyToken(providerIntegrations);
        const channelLabel = provider === 'facebook' ? 'Messenger' : 'Instagram';
        const webhookUrl = `${appUrl}/api/v1/integrations/meta-messaging/webhook/${provider}`;
        const accountNames = providerIntegrations
          .map((integration) => String(integration.config?.igUsername || integration.config?.pageName || integration.name || '').trim())
          .filter(Boolean);

        return {
          integrationId: `provider:${provider}`,
          provider,
          name: `${channelLabel} webhook`,
          status: providerIntegrations.some((integration) => integration.status === IntegrationStatus.ACTIVE)
            ? IntegrationStatus.ACTIVE
            : providerIntegrations[0]?.status || 'pending',
          webhookUrl,
          verifyToken,
          accountCount: providerIntegrations.length,
          accounts: accountNames,
          instructions: [
            `1. In Meta for Developers, open the ${channelLabel} webhook settings`,
            `2. Set Callback URL to ${webhookUrl}`,
            `3. Set Verify Token to ${verifyToken}`,
            '4. Subscribe to message-related webhook events',
            '5. Only new incoming messages appear automatically; old history is not imported yet',
          ],
        };
      }),
    );
  }

  private integrationHasUsableToken(integration?: Integration | null): boolean {
    return (
      !!String(integration?.credentials?.accessToken || '').trim() ||
      !!String(integration?.credentials?.pageAccessToken || '').trim()
    );
  }

  async getAccounts(workspaceId: string, refresh = false): Promise<any[]> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const results: any[] = [];
    const seenAccounts = new Set<string>();

    for (const integration of integrations) {
      const provider = this.getIntegrationProvider(integration);
      if (!provider) {
        continue;
      }

      // Skip orphan/incomplete connections (e.g. an aborted OAuth that left a
      // bare "Custom API" row). Without any token they can never hydrate, so
      // they'd only show as a dead "Needs reconnect" card.
      if (!this.integrationHasUsableToken(integration)) {
        continue;
      }

      let accountSummary: any = null;
      let liveReady = false;
      let warning: string | null = null;

      try {
        const needsHydration = provider === 'facebook'
          ? !integration.config?.pageId || !integration.credentials?.pageAccessToken
          : !integration.config?.pageId || !integration.credentials?.pageAccessToken || !integration.config?.igUserId;

        if (refresh || needsHydration) {
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
      const dedupeKey = provider === 'facebook'
        ? `facebook:${String(accountSummary?.pageId || integration.config?.pageId || integration.id).trim()}`
        : `instagram:${String(accountSummary?.igUserId || integration.config?.igUserId || accountSummary?.pageId || integration.id).trim()}`;

      if (seenAccounts.has(dedupeKey)) {
        continue;
      }
      seenAccounts.add(dedupeKey);

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

    this.logger.log(
      `[inbox] getAccounts ws=${workspaceId} total=${results.length} providers=[${results.map((r) => `${r.provider}:${r.liveReady ? 'live' : 'off'}`).join(', ')}]`,
    );
    return results;
  }

  async getInbox(workspaceId: string, channel?: MetaChannel): Promise<any> {
    const integrations = await this.findMetaIntegrations(workspaceId);
    const integrationsById = new Map(integrations.map((integration) => [integration.id, integration]));
    const reads = await this.getInboxReads(workspaceId);
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
    this.logger.log(`[inbox] getInbox ws=${workspaceId} channel=${channel || 'all'} activities=${activities.length}`);
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
          readAt: reads[key] ? new Date(reads[key]).getTime() : 0,
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
          attachmentTitle: metadata.attachmentTitle,
          senderPageName: metadata.senderPageName,
          senderAccountName: metadata.senderAccountName,
          isSimulated: !!metadata.isSimulated,
          messageStatus: metadata.messageStatus,
        },
      };

      conversation.messages.push(message);
      conversation.lastMessage = activity.description || `[${messageType}]`;
      conversation.lastMessageTime = activity.occurredAt.toISOString();
      if (
        activity.direction === ActivityDirection.INBOUND &&
        activity.occurredAt.getTime() > (conversation.readAt as number)
      ) {
        conversation.unreadCount += 1;
      }
    }

    const conversationList = Array.from(conversations.values())
      .map(({ readAt, ...conversation }) => conversation)
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());

    return { data: conversationList };
  }

  private async getInboxReads(workspaceId: string): Promise<Record<string, string>> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    const raw = (workspace?.settings as any)?.metaInboxReads;
    return raw && typeof raw === 'object' ? (raw as Record<string, string>) : {};
  }

  async markConversationRead(
    workspaceId: string,
    conversationId: string,
    read = true,
  ): Promise<{ success: boolean; unread: boolean }> {
    const key = String(conversationId || '').trim();
    if (!key) throw new BadRequestException('conversationId is required');

    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');

    const reads: Record<string, string> = { ...((workspace.settings as any)?.metaInboxReads || {}) };
    if (read) {
      reads[key] = new Date().toISOString();
    } else {
      // Marking unread drops the marker so newer inbound messages count again.
      delete reads[key];
    }

    workspace.settings = { ...(workspace.settings || ({} as any)), metaInboxReads: reads };
    await this.workspaceRepository.save(workspace);
    return { success: true, unread: !read };
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

  async deleteConversation(
    workspaceId: string,
    input: { channel: MetaChannel; externalUserId: string; integrationId?: string },
  ): Promise<{ deleted: number }> {
    const channel = this.normalizeChannel(input.channel);
    const externalUserId = String(input.externalUserId || '').trim();
    const integrationId = String(input.integrationId || '').trim() || undefined;

    if (!externalUserId) {
      throw new BadRequestException('External user id is required');
    }

    const qb = this.activityRepository
      .createQueryBuilder()
      .delete()
      .from(Activity)
      .where('workspaceId = :workspaceId', { workspaceId })
      .andWhere('type = :type', { type: ActivityType.OTHER })
      .andWhere("metadata->>'channel' = :channel", { channel })
      .andWhere("metadata->>'externalUserId' = :externalUserId", { externalUserId });

    if (integrationId) {
      qb.andWhere("metadata->>'senderIntegrationId' = :integrationId", { integrationId });
    }

    const result = await qb.execute();
    this.emitInboxDeletion(workspaceId, { channel, externalUserId });
    return { deleted: result.affected || 0 };
  }

  async deleteMessage(workspaceId: string, activityId: string): Promise<{ deleted: number }> {
    const activity = await this.activityRepository.findOne({
      where: { id: activityId, workspaceId, type: ActivityType.OTHER },
    });

    if (!activity) {
      throw new NotFoundException('Message not found');
    }

    const channel = String((activity.metadata as MetaActivityMetadata)?.channel || '');
    if (channel !== 'messenger' && channel !== 'instagram') {
      throw new BadRequestException('Not a Messenger/Instagram message');
    }

    await this.activityRepository.delete({ id: activityId, workspaceId });
    this.emitInboxDeletion(workspaceId, { messageId: activityId, channel: channel as MetaChannel });
    return { deleted: 1 };
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
          resolved.pageId,
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
          resolved.pageId,
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

  // Converts any audio file to mp3 and uploads it to Meta as a REUSABLE
  // attachment. Returns an attachment_id that renders as an inline audio
  // player on Messenger and survives deploys (Meta hosts the file, not us).
  private async uploadMessengerAudioAttachment(
    integration: Integration,
    filePath: string,
  ): Promise<string> {
    const { pageId, pageAccessToken } = await this.ensureFacebookPageCredentials(integration);

    const convertedPath = join(tmpdir(), `meta_audio_${Date.now()}_${nanoid(8)}.mp3`);
    try {
      await execFileAsync('ffmpeg', [
        '-i', filePath,
        '-vn',
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        '-ac', '1',
        '-y',
        convertedPath,
      ]);
    } catch (convErr: any) {
      this.logger.error(`Messenger audio ffmpeg conversion failed: ${convErr?.message || convErr}`);
      throw new BadRequestException('Audio conversion failed — ffmpeg error');
    }

    try {
      const FormData = require('form-data');
      const form = new FormData();
      form.append(
        'message',
        JSON.stringify({ attachment: { type: 'audio', payload: { is_reusable: true } } }),
      );
      form.append('filedata', createReadStream(convertedPath), {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
      });

      const response = await firstValueFrom(
        this.httpService.post(`${this.facebookApiUrl}/${pageId}/message_attachments`, form, {
          params: { access_token: pageAccessToken },
          headers: { ...form.getHeaders() },
          maxContentLength: 64 * 1024 * 1024,
          maxBodyLength: 64 * 1024 * 1024,
        }),
      );

      const attachmentId = String(response.data?.attachment_id || '').trim();
      if (!attachmentId) {
        throw new BadRequestException('Meta did not return an attachment_id');
      }
      this.logger.log(`Messenger audio attachment uploaded: ${attachmentId} (page=${pageId})`);
      return attachmentId;
    } catch (error: any) {
      const metaMessage = String(
        error?.response?.data?.error?.message || error?.message || 'Unknown upload error',
      );
      this.logger.error(`Messenger attachment upload failed integration=${integration.id}: ${metaMessage}`);
      throw new BadRequestException(`Messenger attachment upload failed: ${metaMessage}`);
    } finally {
      await fsPromises.unlink(convertedPath).catch(() => undefined);
    }
  }

  private getAudioTemplates(integration: Integration): MetaAudioTemplate[] {
    const raw = (integration.config as any)?.audioTemplates;
    return Array.isArray(raw) ? (raw as MetaAudioTemplate[]) : [];
  }

  private requireMessengerChannel(channel: MetaChannel): void {
    if (channel !== 'messenger') {
      throw new BadRequestException('Saved audio templates are currently supported on Messenger only');
    }
  }

  async listAudioTemplates(
    workspaceId: string,
    channel: MetaChannel = 'messenger',
    integrationId?: string,
  ): Promise<MetaAudioTemplate[]> {
    this.requireMessengerChannel(channel);
    const integration = integrationId
      ? await this.findProviderIntegrationById('facebook', integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, 'facebook');
    return this.getAudioTemplates(integration);
  }

  async createAudioTemplate(
    workspaceId: string,
    body: { name?: string; channel?: MetaChannel; integrationId?: string },
    file: MetaUploadedAudioFile,
  ): Promise<MetaAudioTemplate> {
    const channel = this.normalizeChannel(body.channel || 'messenger');
    this.requireMessengerChannel(channel);
    if (!file?.path) {
      throw new BadRequestException('Audio file is required');
    }

    const integration = body.integrationId
      ? await this.findProviderIntegrationById('facebook', body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, 'facebook');

    try {
      const attachmentId = await this.uploadMessengerAudioAttachment(integration, file.path);
      const template: MetaAudioTemplate = {
        id: nanoid(12),
        name: String(body.name || '').trim() || `Audio ${new Date().toISOString().slice(0, 10)}`,
        attachmentId,
        channel,
        createdAt: new Date().toISOString(),
      };

      const templates = [...this.getAudioTemplates(integration), template];
      integration.config = { ...(integration.config || {}), audioTemplates: templates };
      await this.integrationRepository.save(integration);

      return template;
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }

  async deleteAudioTemplate(
    workspaceId: string,
    templateId: string,
    integrationId?: string,
  ): Promise<{ success: boolean }> {
    const integration = integrationId
      ? await this.findProviderIntegrationById('facebook', integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, 'facebook');

    const templates = this.getAudioTemplates(integration);
    const next = templates.filter((tpl) => tpl.id !== templateId);
    if (next.length === templates.length) {
      throw new NotFoundException('Audio template not found');
    }

    integration.config = { ...(integration.config || {}), audioTemplates: next };
    await this.integrationRepository.save(integration);
    return { success: true };
  }

  // One-off: convert + upload + send immediately (no template saved).
  async sendAudioFile(
    workspaceId: string,
    userId: string,
    body: { channel?: MetaChannel; to: string; integrationId?: string; simulate?: boolean },
    file: MetaUploadedAudioFile,
  ): Promise<MetaOutboundResult> {
    const channel = this.normalizeChannel(body.channel || 'messenger');
    this.requireMessengerChannel(channel);
    if (!file?.path) {
      throw new BadRequestException('Audio file is required');
    }

    const integration = body.integrationId
      ? await this.findProviderIntegrationById('facebook', body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, 'facebook');

    try {
      const attachmentId = await this.uploadMessengerAudioAttachment(integration, file.path);
      return this.sendMessengerAudioByAttachmentId(workspaceId, userId, {
        to: body.to,
        integrationId: integration.id,
        simulate: body.simulate,
      }, attachmentId);
    } finally {
      await fsPromises.unlink(file.path).catch(() => undefined);
    }
  }

  async sendAudioTemplate(
    workspaceId: string,
    userId: string,
    body: { channel?: MetaChannel; to: string; templateId: string; integrationId?: string; simulate?: boolean },
  ): Promise<MetaOutboundResult> {
    const channel = this.normalizeChannel(body.channel || 'messenger');
    this.requireMessengerChannel(channel);

    const integration = body.integrationId
      ? await this.findProviderIntegrationById('facebook', body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, 'facebook');

    const template = this.getAudioTemplates(integration).find((tpl) => tpl.id === body.templateId);
    if (!template) {
      throw new NotFoundException('Audio template not found');
    }

    return this.sendMessengerAudioByAttachmentId(workspaceId, userId, {
      to: body.to,
      integrationId: integration.id,
      simulate: body.simulate,
    }, template.attachmentId);
  }

  private async sendMessengerAudioByAttachmentId(
    workspaceId: string,
    userId: string,
    body: { to: string; integrationId?: string; simulate?: boolean },
    attachmentId: string,
  ): Promise<MetaOutboundResult> {
    const context: MetaSendContext = {
      channel: 'messenger',
      to: body.to,
      integrationId: body.integrationId,
      simulate: body.simulate,
    };

    return this.sendOutboundMessage(workspaceId, userId, context, {
      type: 'audio',
      description: '[Audio message]',
      attachmentInfo: { type: 'audio', mimeType: 'audio/mpeg' },
      send: async (resolved) =>
        this.sendMessengerPayload(resolved.pageId, resolved.accessToken, {
          recipient: { id: body.to },
          messaging_type: 'RESPONSE',
          message: {
            attachment: {
              type: 'audio',
              payload: { attachment_id: attachmentId },
            },
          },
        }),
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

  async handleProviderWebhook(
    provider: MetaProvider,
    payload: any,
  ): Promise<{ success: boolean }> {
    const integrations = await this.findAllProviderIntegrations(provider);
    if (!integrations.length) {
      this.logger.warn(`Shared Meta webhook received for provider=${provider}, but no matching integrations exist`);
      return { success: true };
    }

    const ownerIdsByWorkspace = new Map<string, string>();
    const entryList = Array.isArray(payload?.entry) ? payload.entry : [];

    for (const entry of entryList) {
      const messagingEvents = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const event of messagingEvents) {
        let integration = this.resolveWebhookIntegration(provider, integrations, entry, event);
        if (!integration && provider === 'instagram') {
          integration = await this.selfHealInstagramMatch(integrations, entry, event);
        }
        if (!integration) {
          this.logger.warn(
            `Shared Meta webhook could not resolve provider=${provider} entry=${String(entry?.id || '')} recipient=${String(event?.recipient?.id || '')}`,
          );
          continue;
        }

        let ownerId = ownerIdsByWorkspace.get(integration.workspaceId);
        if (!ownerId) {
          ownerId = integration.userId || (await this.getWorkspaceOwnerId(integration.workspaceId));
          ownerIdsByWorkspace.set(integration.workspaceId, ownerId);
        }

        await this.ingestWebhookEvent(
          provider,
          integration,
          integration.workspaceId,
          ownerId,
          event,
        );
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
    // Skip non-message events (delivery/read receipts, reactions, feedback).
    // They carry sender.id but no message body, so they'd otherwise be stored
    // as empty "[message]" bubbles after a send.
    if (!event?.message && !event?.postback) return;

    const message = event?.message || {};
    const postback = event?.postback;
    const quickReply = message?.quick_reply;
    const isEcho = !!message?.is_echo;
    const text = String(message?.text || quickReply?.payload || postback?.title || '').trim();
    const attachment = Array.isArray(message?.attachments) ? message.attachments[0] : undefined;
    const attachmentType = this.normalizeInboundAttachmentType(attachment?.type);
    const attachmentUrl = String(attachment?.payload?.url || '').trim() || undefined;
    const attachmentTitle = String(attachment?.payload?.title || '').trim() || undefined;

    // No text, no attachment, no postback/quick reply = an empty message event
    // (reaction, edit, delivery echo). Skip so we never store a "[message]" bubble.
    if (!text && !attachmentType && !postback && !quickReply) return;

    const description = text || this.describeAttachment(attachmentType, attachmentTitle);
    const externalMessageId = String(message?.mid || postback?.mid || `meta_${nanoid(16)}`);
    const realMessageId = String(message?.mid || postback?.mid || '');

    // Dedupe step 1 (synchronous, race-safe): mark this id as seen BEFORE any
    // await. Two simultaneous deliveries of the same id: the second returns here.
    if (realMessageId && !this.markMessageSeen(realMessageId)) {
      return;
    }

    // Dedupe step 2 (persistent backstop): handles restarts/echoes of our own
    // sends that were already stored in the DB.
    if (realMessageId && (await this.activityExistsByExternalMessageId(workspaceId, externalMessageId))) {
      return;
    }

    // Echo = a message the Page/IG account sent (either from our CRM, already
    // saved at send time, or from the Meta app). Record it as OUTBOUND to the
    // real participant (recipient), not as an inbound from the page itself.
    if (isEcho) {
      const outboundContact = await this.findExistingSocialContact(workspaceId, channel, recipientId);
      await this.saveOutboundActivity(
        workspaceId,
        ownerId,
        {
          channel,
          provider,
          externalUserId: recipientId,
          externalThreadId: recipientId,
          externalMessageId,
          messageType: attachmentType || (text ? 'text' : 'event'),
          senderIntegrationId: integration.id,
          senderPageId: String(integration.config?.pageId || senderId),
          senderPageName: String(integration.config?.pageName || integration.name || ''),
          senderAccountId: provider === 'instagram' ? String(integration.config?.igUserId || senderId) : undefined,
          senderAccountName: provider === 'instagram' ? String(integration.config?.igUsername || integration.name || '') : undefined,
          ...this.getMessageProfileMetadata(integration),
          attachmentUrl,
          attachmentMimeType: this.guessMimeTypeFromUrl(attachmentUrl, attachmentType),
          attachmentName: this.extractFilename(attachmentUrl),
          attachmentTitle,
          messageStatus: 'sent',
          isEcho: true,
        },
        description,
        recipientId,
        outboundContact || undefined,
      );
      return;
    }

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
        attachmentTitle,
        rawEvent: event,
      },
      description,
    );
  }

  private isAuthError(error: any): boolean {
    const status = error?.response?.status;
    const metaCode = error?.response?.data?.error?.code;
    const message = String(error?.message || error?.response?.data?.error?.message || '');
    return (
      status === 401 ||
      metaCode === 190 ||
      metaCode === 102 ||
      message.includes('401') ||
      /access token|session has expired|code 190/i.test(message)
    );
  }

  private async clearCachedPageCredentials(integration: Integration): Promise<void> {
    // Drop only the cached Page token; keep pageId/igUserId so the refresh
    // re-selects the same Page (matters for multi-page accounts).
    integration.credentials = {
      ...(integration.credentials || {}),
      pageAccessToken: '',
    };
    await this.integrationRepository.save(integration);
  }

  // Returns true if the id was newly marked (process it); false if already seen
  // recently (drop it). Synchronous on purpose — must not yield before marking.
  private markMessageSeen(messageId: string): boolean {
    const now = Date.now();
    if (this.recentMessageIds.has(messageId)) {
      return false;
    }
    this.recentMessageIds.set(messageId, now);
    if (this.recentMessageIds.size > 5000) {
      for (const [id, ts] of this.recentMessageIds) {
        if (now - ts > MetaMessagingService.RECENT_ID_TTL_MS) {
          this.recentMessageIds.delete(id);
        }
      }
    }
    return true;
  }

  private async activityExistsByExternalMessageId(
    workspaceId: string,
    externalMessageId: string,
  ): Promise<boolean> {
    if (!externalMessageId) return false;
    const existing = await this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.type = :type', { type: ActivityType.OTHER })
      .andWhere("activity.metadata->>'externalMessageId' = :externalMessageId", { externalMessageId })
      .getExists();
    return existing;
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
    let integration = body.integrationId
      ? await this.findProviderIntegrationById(provider, body.integrationId, workspaceId)
      : await this.findDefaultProviderIntegration(workspaceId, provider);

    // The conversation may be linked to an orphan integration (aborted OAuth,
    // no token). Fall back to a usable account for this provider so the reply
    // still goes out instead of failing with "missing an access token".
    if (!integration || !this.integrationHasUsableToken(integration)) {
      const usable = (await this.findMetaIntegrations(workspaceId)).filter(
        (candidate) =>
          this.getIntegrationProvider(candidate) === provider &&
          this.integrationHasUsableToken(candidate),
      );
      if (usable.length) {
        integration = usable[0];
      }
    }

    const ownerId = userId || integration?.userId || (await this.getWorkspaceOwnerId(workspaceId));
    const resolveLiveConfig = async () =>
      channel === 'messenger'
        ? {
            ...(await this.ensureFacebookPageCredentials(integration)),
            igUserId: '',
            igUsername: undefined as string | undefined,
          }
        : await this.ensureInstagramMessagingCredentials(integration);

    let liveConfig = await resolveLiveConfig();

    const simulated = !!body.simulate;
    let externalResponse: any = null;
    let externalMessageId = `sim_${nanoid(16)}`;

    const runSend = (config: typeof liveConfig) =>
      options.send({
        channel,
        accessToken: config.pageAccessToken,
        pageId: config.pageId,
        pageName: config.pageName,
        igUserId: config.igUserId || '',
        igUsername: config.igUsername,
        integration,
      });

    if (!simulated) {
      try {
        externalResponse = await runSend(liveConfig);
      } catch (error: any) {
        // A cached Page access token can go stale (Meta error code 190 / 401).
        // Drop it, re-derive from the user token via /me/accounts, retry once.
        if (this.isAuthError(error)) {
          this.logger.warn(`Meta ${channel} send hit an auth error — refreshing Page token and retrying once`);
          await this.clearCachedPageCredentials(integration);
          liveConfig = await resolveLiveConfig();
          externalResponse = await runSend(liveConfig);
        } else {
          throw error;
        }
      }
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

    const saved = await this.activityRepository.save(activity);
    this.logger.log(
      `[inbox] stored INBOUND ${metadata.channel} activity=${saved.id.slice(0, 8)} ws=${workspaceId} contact=${contact.id.slice(0, 8)} sender=${String(metadata.externalUserId || '').slice(0, 8)}…`,
    );
    this.emitInboxEvent(workspaceId, metadata, activity, contact, description);
  }

  private async saveOutboundActivity(
    workspaceId: string,
    ownerId: string,
    metadata: MetaActivityMetadata,
    description: string,
    recipientExternalUserId: string,
    resolvedContact?: Contact,
  ): Promise<void> {
    const contact = resolvedContact
      || (await this.findExistingSocialContact(
        workspaceId,
        metadata.channel,
        recipientExternalUserId,
      ));
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
    this.emitInboxEvent(workspaceId, metadata, activity, contact || undefined, description);
  }

  private emitInboxEvent(
    workspaceId: string,
    metadata: MetaActivityMetadata,
    activity: Activity,
    contact: Contact | undefined,
    description: string,
  ): void {
    const channel = metadata.channel;
    const externalUserId = String(metadata.externalUserId || '').trim();
    if (!channel || !externalUserId) return;

    const messageType = String(metadata.messageType || 'text');
    this.eventEmitter.emit(MetaMessagingService.STREAM_EVENT, {
      workspaceId,
      type: 'message',
      conversation: {
        id: this.buildConversationKey(channel, externalUserId, metadata),
        channel,
        externalUserId,
        externalThreadId: metadata.externalThreadId || externalUserId,
        integrationId: metadata.senderIntegrationId || null,
        accountId: this.getConversationAccountId(channel, metadata) || null,
        accountName: this.getConversationAccountName(channel, metadata, activity) || null,
        messageProfileId: metadata.senderProfileId || null,
        messageProfileName: metadata.senderProfileName || null,
        contactId: contact?.id || null,
        contactName: this.getContactDisplayName(contact, channel, externalUserId),
        contactSource: contact?.source || null,
      },
      message: {
        id: activity.id,
        direction: activity.direction,
        description: description || '',
        occurredAt: activity.occurredAt.toISOString(),
        metadata: {
          externalMessageId: metadata.externalMessageId,
          externalThreadId: metadata.externalThreadId,
          externalUserId: metadata.externalUserId,
          messageType,
          attachmentUrl: metadata.attachmentUrl,
          attachmentMimeType: metadata.attachmentMimeType,
          attachmentName: metadata.attachmentName,
          attachmentTitle: metadata.attachmentTitle,
          senderPageName: metadata.senderPageName,
          senderAccountName: metadata.senderAccountName,
          isSimulated: !!metadata.isSimulated,
          messageStatus: metadata.messageStatus,
        },
      },
    });
  }

  private emitInboxDeletion(
    workspaceId: string,
    payload: { conversationId?: string; messageId?: string; channel?: MetaChannel; externalUserId?: string },
  ): void {
    this.eventEmitter.emit(MetaMessagingService.STREAM_EVENT, {
      workspaceId,
      type: 'deleted',
      ...payload,
    });
  }

  private async findOrCreateSocialContact(
    workspaceId: string,
    ownerId: string,
    channel: MetaChannel,
    externalUserId: string,
    senderName?: string,
  ): Promise<Contact> {
    let contact = await this.findExistingSocialContact(workspaceId, channel, externalUserId);
    if (contact) {
      const realName = String(senderName || '').trim();
      if (realName && this.isPlaceholderSocialName(contact, channel, externalUserId)) {
        const parts = realName.split(/\s+/).filter(Boolean);
        contact.firstName = parts[0] || contact.firstName;
        contact.lastName = parts.slice(1).join(' ') || '';
        contact = await this.contactRepository.save(contact);
      }
      return contact;
    }

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

  private isPlaceholderSocialName(
    contact: Contact,
    channel: MetaChannel,
    externalUserId: string,
  ): boolean {
    const first = String(contact.firstName || '').trim();
    const last = String(contact.lastName || '').trim();
    const full = `${first} ${last}`.trim();
    if (!full) return true;

    const placeholders = new Set([
      'Messenger Contact',
      'Instagram Contact',
      `Messenger ${externalUserId}`,
      `Instagram ${externalUserId}`,
    ]);
    if (placeholders.has(full)) return true;

    return (first === 'Messenger' || first === 'Instagram') && (last === 'Contact' || last === '');
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

  private async findAllProviderIntegrations(provider: MetaProvider): Promise<Integration[]> {
    const rows = await this.integrationRepository.find({
      where: { type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    return rows.filter((integration) => this.getIntegrationProvider(integration) === provider);
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

  private getIntegrationProvider(integration: Integration): MetaProvider | null {
    const provider = String(integration.config?.provider || integration.externalId || '')
      .trim()
      .toLowerCase();
    if (provider === 'facebook') return 'facebook';
    if (provider === 'instagram') return 'instagram';
    return null;
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

  private async ensureProviderVerifyToken(integrations: Integration[]): Promise<string> {
    const existing = integrations
      .map((integration) => String(integration.config?.verifyToken || '').trim())
      .find(Boolean);
    const verifyToken = existing || `meta_${nanoid(24)}`;

    const pendingUpdates = integrations.filter(
      (integration) => String(integration.config?.verifyToken || '').trim() !== verifyToken,
    );

    if (pendingUpdates.length) {
      for (const integration of pendingUpdates) {
        integration.config = {
          ...(integration.config || {}),
          verifyToken,
        };
      }
      await this.integrationRepository.save(pendingUpdates);
    }

    return verifyToken;
  }

  private resolveWebhookIntegration(
    provider: MetaProvider,
    integrations: Integration[],
    entry: any,
    event: any,
  ): Integration | null {
    const candidates = new Set<string>();
    const entryId = String(entry?.id || '').trim();
    const recipientId = String(event?.recipient?.id || '').trim();

    if (entryId) candidates.add(entryId);
    if (recipientId) candidates.add(recipientId);

    // Instagram and Facebook expose several id namespaces (page id, IG business
    // id, IG-scoped id, app-scoped id). Match the webhook entry/recipient
    // against every id we might have stored so a single mismatched field does
    // not drop the whole conversation.
    const integrationIds = (integration: Integration): string[] =>
      [
        integration.config?.pageId,
        integration.config?.igUserId,
        (integration.config as any)?.igId,
        (integration.config as any)?.instagramId,
        (integration.config as any)?.igBusinessId,
        (integration.config as any)?.igScopedId,
        integration.externalId,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

    for (const integration of integrations) {
      if (integrationIds(integration).some((id) => candidates.has(id))) {
        return integration;
      }
    }

    // Fallback: if exactly one account for this provider actually has usable
    // credentials, the message is unambiguous even when its stored id doesn't
    // match the webhook's id namespace. Never fall back to a tokenless orphan.
    const usable = integrations.filter((integration) => this.integrationHasUsableToken(integration));
    if (usable.length === 1) {
      return usable[0];
    }

    this.logger.warn(
      `resolveWebhookIntegration miss provider=${provider} candidates=[${[...candidates].join(',')}] stored=[${integrations
        .map((i) => `${i.id.slice(0, 8)}:pg=${i.config?.pageId || ''}/ig=${i.config?.igUserId || ''}/ext=${i.externalId || ''}`)
        .join(' | ')}]`,
    );
    return null;
  }

  // Instagram exposes a different account id to the messaging webhook than the
  // one captured at connect time, so stored ids never match. Identify the
  // owning account by asking each usable integration's token to resolve the
  // webhook account id, then cache it as igScopedId so future webhooks match
  // instantly (see resolveWebhookIntegration).
  private async selfHealInstagramMatch(
    integrations: Integration[],
    entry: any,
    event: any,
  ): Promise<Integration | null> {
    const targetId = String(event?.recipient?.id || entry?.id || '').trim();
    if (!targetId) return null;

    const usable = integrations.filter((integration) => this.integrationHasUsableToken(integration));
    for (const integration of usable) {
      try {
        const { pageAccessToken } = await this.ensureInstagramMessagingCredentials(integration);
        if (!pageAccessToken) continue;

        const res = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/${targetId}`, {
          params: { fields: 'id', access_token: pageAccessToken },
          timeout: 8000,
        });

        if (String(res.data?.id || '').trim() === targetId) {
          integration.config = { ...(integration.config || {}), igScopedId: targetId };
          await this.integrationRepository.save(integration);
          this.logger.log(
            `Self-healed IG webhook match: integration=${integration.id.slice(0, 8)} igScopedId=${targetId}`,
          );
          return integration;
        }
      } catch {
        // This account's token cannot resolve the id — not the owner. Try next.
      }
    }

    return null;
  }

  private async ensureFacebookPageCredentials(integration: Integration): Promise<{
    pageId: string;
    pageName?: string;
    pageAccessToken: string;
  }> {
    const existingPageId = String(integration.config?.pageId || '').trim();
    const existingPageAccessToken = String(integration.credentials?.pageAccessToken || '').replace(/\s+/g, '');
    const existingPageName = String(integration.config?.pageName || '').trim() || undefined;

    if (existingPageId && existingPageAccessToken) {
      return {
        pageId: existingPageId,
        pageName: existingPageName,
        pageAccessToken: existingPageAccessToken,
      };
    }

    const userAccessToken = String(integration.credentials?.accessToken || '').replace(/\s+/g, '');
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
    const existingPageAccessToken = String(integration.credentials?.pageAccessToken || '').replace(/\s+/g, '');
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

    const userAccessToken = String(integration.credentials?.accessToken || '').replace(/\s+/g, '');
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
    return this.postToGraph('messenger', `${this.facebookApiUrl}/${pageId}/messages`, accessToken, payload);
  }

  // Instagram messaging via the Facebook-Login flow is sent through the linked
  // Page edge on graph.facebook.com (NOT graph.instagram.com), using the Page
  // access token. The recipient id is the Instagram-scoped user id.
  private async sendInstagramPayload(pageId: string, accessToken: string, payload: any): Promise<any> {
    return this.postToGraph('instagram', `${this.facebookApiUrl}/${pageId}/messages`, accessToken, payload);
  }

  private async postToGraph(
    channel: MetaChannel,
    url: string,
    accessToken: string,
    payload: any,
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      const metaMessage = String(metaError?.message || error?.message || 'Unknown Meta send error');
      const code = metaError?.code ? ` (code ${metaError.code})` : '';
      this.logger.error(
        `${channel} send failed: ${metaMessage}${code} :: ${JSON.stringify(metaError || {})}`,
      );
      throw new BadRequestException(`Meta ${channel} send failed: ${metaMessage}${code}`);
    }
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
      // The Instagram messaging user-profile endpoint reliably exposes `name`
      // (and profile_pic). `username` is NOT a valid field here and makes the
      // whole request fail — which is why senders showed as "Instagram <id>".
      const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/${senderId}`, {
        params: {
          fields: 'name',
          access_token: pageAccessToken,
        },
        timeout: 10000,
      });
      return String(response.data?.name || response.data?.username || '').trim() || undefined;
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      this.logger.warn(
        `fetchSenderName failed provider=${provider} senderId=${senderId}: ${
          metaError ? `${metaError.message} (code ${metaError.code})` : error?.message || 'unknown error'
        }`,
      );
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
    // Shared posts, reels, profiles, story mentions and link previews arrive
    // under a handful of type names — group them so the UI can render a card
    // instead of a generic "[file]".
    if (['share', 'story_mention', 'ig_reel', 'reel', 'fallback', 'link', 'template'].includes(normalized)) {
      return 'share';
    }
    return 'file';
  }

  private describeAttachment(type?: string, title?: string): string {
    switch (type) {
      case 'audio':
        return '[Audio message]';
      case 'image':
        return '[Photo]';
      case 'video':
        return '[Video]';
      case 'share':
        return title || '[Shared post]';
      case 'file':
        return '[File]';
      default:
        return '[Message]';
    }
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
    // APP_URL may already include the global /api/v1 prefix; strip it so callers
    // that append their own path (e.g. webhook URLs) don't duplicate it.
    return configured.replace(/\/$/, '').replace(/\/api\/v1$/, '');
  }
}
