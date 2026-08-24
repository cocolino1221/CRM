import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { createReadStream, promises as fsPromises } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { extname, join } from 'path';
import * as os from 'os';
import { Contact, ContactStatus, ContactSource } from '../../database/entities/contact.entity';
import { Activity, ActivityType, ActivityDirection, ActivityOutcome } from '../../database/entities/activity.entity';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { User, UserRole, UserStatus } from '../../database/entities/user.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { NotificationsService, CreateNotificationDto } from '../../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { UploadService } from '../../upload/upload.service';
import { normalizePhoneDigits, normalizePhoneE164 } from '../../common/utils/phone.util';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { EmailService } from '../../email/email.service';

const execFileAsync = promisify(execFile);

const INVALID_WHATSAPP_PROFILE_NAMES = new Set([
  'online',
  'online contact',
  'offline',
  'unknown',
  'customer',
]);

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'image' | 'document' | 'video' | 'audio' | 'interactive';
  content: string;
  context?: {
    messageId: string;
  };
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
    voice?: boolean;
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
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
            call_permission_reply?: { response: string; is_permanent?: boolean; expiration_timestamp?: number };
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
        calls?: any[];
      };
      field: string;
    }>;
  }>;
}

type AutoSendHeaderMediaType = 'image' | 'video' | 'document';

interface AutoSendConditions {
  sources?: string[];
  statuses?: string[];
  typeformFormIds?: string[];
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

interface TemplateHeaderMediaCacheEntry {
  headerMediaType: AutoSendHeaderMediaType;
  headerMediaId?: string;
  headerMediaUrl?: string;
  updatedAt: string;
}

interface TemplateHeaderMediaActivityLookup {
  byExactTemplate: Record<string, TemplateHeaderMediaCacheEntry>;
  byTemplateName: Record<string, TemplateHeaderMediaCacheEntry>;
}

interface CampaignRecipient {
  phone: string;
  firstName?: string;
  lastName?: string;
}

interface CampaignFilter {
  tags?: string[];
  status?: string[];
  source?: string[];
  selectedContactIds?: string[];
  recipients?: CampaignRecipient[];
}

interface BroadcastContext {
  campaignId?: string;
  campaignName?: string;
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
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
    private readonly notificationsService: NotificationsService,
    private readonly whatsAppAIService: WhatsAppAIService,
    private readonly eventEmitter: EventEmitter2,
    private readonly uploadService: UploadService,
    private readonly followupDispatch: WhatsAppFollowupDispatchService,
    private readonly callingService: WhatsAppCallingService,
    private readonly emailService: EmailService,
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

  private getCredentials(credentials?: Record<string, any>, includeEnvFallback = true) {
    const accessToken = credentials?.accessToken || credentials?.access_token || '';
    const phoneNumberId =
      credentials?.phoneNumberId
      || credentials?.phone_number_id
      || credentials?.phoneId
      || credentials?.phone_id
      || '';
    return {
      accessToken: accessToken || (includeEnvFallback ? (this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '') : ''),
      phoneNumberId: phoneNumberId || (includeEnvFallback ? (this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '') : ''),
    };
  }

  private isIntegrationUsable(integration?: Integration | null): boolean {
    if (!integration) return false;
    return (
      integration.status !== IntegrationStatus.DISABLED
      && integration.status !== IntegrationStatus.EXPIRED
      && integration.status !== IntegrationStatus.SUSPENDED
    );
  }

  private getIntegrationCredentials(integration?: Integration | null): Record<string, any> {
    return {
      ...(integration?.config || {}),
      ...(integration?.credentials || {}),
    };
  }

  private getIntegrationSenderInfo(integration?: Integration | null): {
    senderIntegrationId?: string;
    senderPhoneNumberId?: string;
    senderPhoneDisplay?: string;
    senderIntegrationName?: string;
  } {
    if (!integration) return {};
    const credentials = this.getIntegrationCredentials(integration);
    const { phoneNumberId } = this.getCredentials(credentials, false);
    const display =
      String(integration.config?.phoneDisplay || integration.config?.displayPhoneNumber || '').trim()
      || undefined;

    return {
      senderIntegrationId: integration.id,
      senderPhoneNumberId: phoneNumberId || undefined,
      senderPhoneDisplay: display,
      senderIntegrationName: integration.name || undefined,
    };
  }

  private hasIntegrationSendCredentials(integration?: Integration | null): boolean {
    if (!integration) return false;
    const { accessToken, phoneNumberId } = this.getCredentials(this.getIntegrationCredentials(integration), false);
    return !!(accessToken && phoneNumberId);
  }

  private async listWorkspaceWhatsAppIntegrations(workspaceId: string): Promise<Integration[]> {
    const integrations = await this.integrationRepository.find({
      where: { workspaceId, type: IntegrationType.WHATSAPP },
      order: { createdAt: 'ASC' },
    });
    return integrations;
  }

  private chooseDefaultWorkspaceIntegration(integrations: Integration[]): Integration | null {
    if (!integrations.length) return null;
    const usable = integrations.filter((integration) =>
      this.isIntegrationUsable(integration) && this.hasIntegrationSendCredentials(integration),
    );
    if (!usable.length) return null;
    return usable.find((integration) => integration.status === IntegrationStatus.ACTIVE) || usable[0];
  }

  private chooseAutoSendConfigIntegration(integrations: Integration[]): Integration | null {
    if (!integrations.length) return null;

    const withEnabledRules = integrations.filter((integration) => {
      const rules = this.getAutoSendRulesFromConfig(integration.config || {});
      return rules.some((rule) => rule.enabled);
    });

    const preferredWithRules = withEnabledRules.find((integration) =>
      this.isIntegrationUsable(integration) && this.hasIntegrationSendCredentials(integration),
    );
    if (preferredWithRules) return preferredWithRules;

    const defaultIntegration = this.chooseDefaultWorkspaceIntegration(integrations);
    if (defaultIntegration) return defaultIntegration;

    return integrations.find((integration) => this.isIntegrationUsable(integration)) || integrations[0];
  }

  private async resolveWorkspaceSendIntegration(workspaceId: string, integrationId?: string): Promise<Integration> {
    const allIntegrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!allIntegrations.length) {
      throw new BadRequestException('No WhatsApp integration found for this workspace');
    }

    let selected: Integration | null = null;
    if (integrationId?.trim()) {
      selected = allIntegrations.find((integration) => integration.id === integrationId.trim()) || null;
      if (!selected) {
        throw new BadRequestException('Selected WhatsApp number was not found');
      }
    } else {
      selected = this.chooseDefaultWorkspaceIntegration(allIntegrations);
    }

    if (!selected) {
      throw new BadRequestException('No active WhatsApp sender number is configured');
    }
    if (!this.isIntegrationUsable(selected)) {
      throw new BadRequestException('Selected WhatsApp sender number is disabled');
    }
    if (!this.hasIntegrationSendCredentials(selected)) {
      throw new BadRequestException('Selected WhatsApp sender number is missing credentials');
    }

    return selected;
  }

  private async resolveWorkspaceSendIntegrationByConversation(
    workspaceId: string,
    to: string,
  ): Promise<Integration | null> {
    const normalizedWaId = normalizePhoneDigits(to);
    if (!normalizedWaId) return null;

    try {
      const recentInbound = await this.activityRepository
        .createQueryBuilder('activity')
        .select(['activity.id', 'activity.metadata', 'activity.occurredAt', 'activity.createdAt'])
        .where('activity.workspaceId = :workspaceId', { workspaceId })
        .andWhere('activity.type = :type', { type: ActivityType.WHATSAPP_MESSAGE })
        .andWhere('activity.direction = :direction', { direction: ActivityDirection.INBOUND })
        .andWhere("activity.metadata->>'waId' = :waId", { waId: normalizedWaId })
        .orderBy('activity.occurredAt', 'DESC')
        .addOrderBy('activity.createdAt', 'DESC')
        .getOne();

      const senderIntegrationId = String((recentInbound?.metadata as any)?.senderIntegrationId || '').trim();
      if (senderIntegrationId) {
        return this.resolveWorkspaceSendIntegration(workspaceId, senderIntegrationId);
      }

      const senderPhoneNumberId = String((recentInbound?.metadata as any)?.senderPhoneNumberId || '').trim();
      if (!senderPhoneNumberId) return null;

      const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
      const byPhoneNumberId = integrations.find((integration) => {
        if (!this.isIntegrationUsable(integration) || !this.hasIntegrationSendCredentials(integration)) return false;
        const credentials = this.getIntegrationCredentials(integration);
        const { phoneNumberId } = this.getCredentials(credentials, false);
        return phoneNumberId === senderPhoneNumberId;
      });

      return byPhoneNumberId || null;
    } catch {
      return null;
    }
  }

  private buildWorkspaceSendCandidates(
    integrations: Integration[],
    preferred?: Integration | null,
    fallback?: Integration | null,
  ): Integration[] {
    const usable = integrations.filter((integration) =>
      this.isIntegrationUsable(integration) && this.hasIntegrationSendCredentials(integration),
    );
    const candidates: Integration[] = [];
    const seen = new Set<string>();
    const pushUnique = (integration?: Integration | null) => {
      if (!integration) return;
      if (!this.isIntegrationUsable(integration) || !this.hasIntegrationSendCredentials(integration)) return;
      if (seen.has(integration.id)) return;
      seen.add(integration.id);
      candidates.push(integration);
    };

    pushUnique(preferred);
    pushUnique(fallback);
    for (const integration of usable) pushUnique(integration);
    return candidates;
  }

  private shouldTryNextIntegrationForSend(error: any): boolean {
    if (!(error instanceof BadRequestException)) return false;
    const response = typeof error.getResponse === 'function' ? error.getResponse() : null;
    const responseMessage = typeof response === 'string'
      ? response
      : Array.isArray((response as any)?.message)
        ? (response as any).message.join(' ')
        : String((response as any)?.message || '');
    const msg = `${responseMessage} ${String(error?.message || '')}`.toLowerCase();
    return msg.includes('whatsapp api error');
  }

  async listWorkspaceAccounts(workspaceId: string): Promise<{ defaultIntegrationId: string | null; data: Array<Record<string, any>> }> {
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    const defaultIntegration = this.chooseDefaultWorkspaceIntegration(integrations);
    const data = integrations
      .filter((integration) => this.isIntegrationUsable(integration))
      .map((integration) => {
        const credentials = this.getIntegrationCredentials(integration);
        const { phoneNumberId } = this.getCredentials(credentials, false);
        const wabaId = String(credentials.wabaId || credentials.waba_id || integration.config?.wabaId || '').trim() || null;
        const phoneDisplay = String(integration.config?.phoneDisplay || integration.config?.displayPhoneNumber || '').trim() || null;
        return {
          id: integration.id,
          name: integration.name,
          status: integration.status,
          phoneNumberId: phoneNumberId || null,
          phoneDisplay,
          wabaId,
          isDefault: integration.id === defaultIntegration?.id,
        };
      });

    return {
      defaultIntegrationId: defaultIntegration?.id || null,
      data,
    };
  }

  async sendMessageForWorkspace(
    workspaceId: string,
    message: WhatsAppMessage,
    integrationId?: string,
  ): Promise<{ result: any; sender: ReturnType<WhatsAppService['getIntegrationSenderInfo']> }> {
    const payload: WhatsAppMessage = message.type === 'template' && message.template
      ? {
          ...message,
          template: {
            ...message.template,
            parameters: this.normalizeTemplateComponents(message.template.parameters || []),
          },
        }
      : message;

    if (integrationId?.trim()) {
      const selected = await this.resolveWorkspaceSendIntegration(workspaceId, integrationId);
      try {
        const result = await this.sendMessageWithCredentials(this.getIntegrationCredentials(selected), payload);
        return {
          result,
          sender: this.getIntegrationSenderInfo(selected),
        };
      } catch (error: any) {
        const hasUploadedMediaId = !!String(payload.media?.id || '').trim();
        if (!hasUploadedMediaId || !this.shouldTryNextIntegrationForSend(error)) {
          throw error;
        }

        this.logger.warn(
          `WhatsApp media send failed with selected integration=${selected.id}; trying other active senders in workspace=${workspaceId}`,
        );

        const allIntegrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
        const defaultIntegration = this.chooseDefaultWorkspaceIntegration(allIntegrations);
        const fallbackCandidates = this.buildWorkspaceSendCandidates(allIntegrations, defaultIntegration, null)
          .filter((candidate) => candidate.id !== selected.id);

        let lastError: any = error;
        for (const candidate of fallbackCandidates) {
          try {
            const result = await this.sendMessageWithCredentials(this.getIntegrationCredentials(candidate), payload);
            return {
              result,
              sender: this.getIntegrationSenderInfo(candidate),
            };
          } catch (candidateError: any) {
            lastError = candidateError;
            this.logger.warn(
              `WhatsApp media fallback failed via integration=${candidate.id} workspace=${workspaceId}: ${String(candidateError?.message || candidateError)}`,
            );
            if (!this.shouldTryNextIntegrationForSend(candidateError)) {
              throw candidateError;
            }
          }
        }

        throw lastError;
      }
    }

    const allIntegrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!allIntegrations.length) {
      throw new BadRequestException('No WhatsApp integration found for this workspace');
    }

    const fromConversation = await this.resolveWorkspaceSendIntegrationByConversation(workspaceId, message.to);
    const defaultIntegration = this.chooseDefaultWorkspaceIntegration(allIntegrations);
    const candidates = this.buildWorkspaceSendCandidates(allIntegrations, fromConversation, defaultIntegration);

    if (!candidates.length) {
      throw new BadRequestException('No active WhatsApp sender number is configured');
    }

    let lastError: any = null;

    for (const candidate of candidates) {
      try {
        const result = await this.sendMessageWithCredentials(this.getIntegrationCredentials(candidate), payload);
        return {
          result,
          sender: this.getIntegrationSenderInfo(candidate),
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `WhatsApp send failed via integration=${candidate.id} workspace=${workspaceId}: ${String(error?.message || error)}`,
        );
        if (!this.shouldTryNextIntegrationForSend(error)) {
          throw error;
        }
      }
    }

    throw lastError || new BadRequestException('Failed to send WhatsApp message');
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

  private isLikelyHttpUrl(value?: string): boolean {
    if (!value) return false;
    return /^https?:\/\//i.test(value.trim());
  }

  private normalizeHeaderMediaInput(headerMediaId?: string, headerMediaUrl?: string): { mediaId?: string; mediaUrl?: string } {
    const rawId = String(headerMediaId || '').trim();
    const rawUrl = String(headerMediaUrl || '').trim();

    if (rawUrl) {
      return {
        mediaId: rawId || undefined,
        mediaUrl: rawUrl,
      };
    }

    if (rawId && this.isLikelyHttpUrl(rawId)) {
      return {
        mediaUrl: rawId,
      };
    }

    return {
      mediaId: rawId || undefined,
      mediaUrl: undefined,
    };
  }

  private buildTemplateHeaderMediaCacheKey(templateName?: string, language?: string): string {
    return `${String(templateName || '').trim().toLowerCase()}::${String(language || '').trim().toLowerCase()}`;
  }

  private buildTemplateHeaderMediaNameKey(templateName?: string): string {
    return String(templateName || '').trim().toLowerCase();
  }

  private getTemplateHeaderMediaCache(integration?: Integration | null): Record<string, TemplateHeaderMediaCacheEntry> {
    const rawCache = integration?.config?.templateHeaderMediaCache;
    if (!rawCache || typeof rawCache !== 'object' || Array.isArray(rawCache)) {
      return {};
    }

    const normalized: Record<string, TemplateHeaderMediaCacheEntry> = {};
    for (const [rawKey, rawValue] of Object.entries(rawCache as Record<string, any>)) {
      const key = String(rawKey || '').trim().toLowerCase();
      if (!key || !rawValue || typeof rawValue !== 'object') continue;

      const headerMediaType = String((rawValue as any).headerMediaType || '').trim().toLowerCase();
      if (!['image', 'video', 'document'].includes(headerMediaType)) continue;

      const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
        String((rawValue as any).headerMediaId || '').trim() || undefined,
        String((rawValue as any).headerMediaUrl || '').trim() || undefined,
      );

      if (!normalizedHeaderMedia.mediaId && !normalizedHeaderMedia.mediaUrl) continue;

      normalized[key] = {
        headerMediaType: headerMediaType as AutoSendHeaderMediaType,
        headerMediaId: normalizedHeaderMedia.mediaId,
        headerMediaUrl: normalizedHeaderMedia.mediaUrl,
        updatedAt: String((rawValue as any).updatedAt || '').trim() || new Date().toISOString(),
      };
    }

    return normalized;
  }

  private getCachedTemplateHeaderMedia(
    integration: Integration | null | undefined,
    templateName?: string,
    language?: string,
  ): TemplateHeaderMediaCacheEntry | undefined {
    const cacheKey = this.buildTemplateHeaderMediaCacheKey(templateName, language);
    if (!cacheKey || cacheKey === '::') return undefined;
    return this.getTemplateHeaderMediaCache(integration)[cacheKey];
  }

  // Resolve the header media (image/video/document) for a template from the DB cache
  // (integration.config.templateHeaderMediaCache) or, failing that, recent outbound
  // template activities. Lets a send to a brand-new number reuse a previously used
  // media_id/URL without forcing a manual re-upload.
  private async resolveCachedTemplateHeaderMedia(
    workspaceId: string,
    integrationId: string | undefined,
    templateName?: string,
    language?: string,
  ): Promise<TemplateHeaderMediaCacheEntry | undefined> {
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!integrations.length) return undefined;

    const requestedIntegrationId = String(integrationId || '').trim();
    const cacheIntegration = (requestedIntegrationId
      ? integrations.find((integration) => integration.id === requestedIntegrationId)
      : null)
      || this.chooseDefaultWorkspaceIntegration(integrations)
      || integrations[0];

    const cached = this.getCachedTemplateHeaderMedia(cacheIntegration, templateName, language);
    if (cached && (cached.headerMediaId || cached.headerMediaUrl)) return cached;

    const activityLookup = await this.getRecentTemplateHeaderMediaActivityLookup(workspaceId, cacheIntegration);
    const fallback = activityLookup.byExactTemplate[this.buildTemplateHeaderMediaCacheKey(templateName, language)]
      || activityLookup.byTemplateName[this.buildTemplateHeaderMediaNameKey(templateName)];
    if (fallback && (fallback.headerMediaId || fallback.headerMediaUrl)) return fallback;

    return undefined;
  }

  private extractTemplateNameFromActivity(activity?: Pick<Activity, 'description' | 'metadata'>): string | undefined {
    const metadataName = String(activity?.metadata?.templateName || '').trim();
    if (metadataName) return metadataName;

    const description = String(activity?.description || '').trim();
    if (!description) return undefined;

    const match = description.match(
      /^\[(?:template|broadcast template|auto-send template|csv import template|flow template):\s*([^\]]+)\]/i,
    );
    return String(match?.[1] || '').trim() || undefined;
  }

  private async getRecentTemplateHeaderMediaActivityLookup(
    workspaceId: string,
    integration?: Integration | null,
  ): Promise<TemplateHeaderMediaActivityLookup> {
    const integrationId = String(integration?.id || '').trim();
    if (!workspaceId || !integrationId) {
      return { byExactTemplate: {}, byTemplateName: {} };
    }

    try {
      const activities = await this.activityRepository.find({
        where: {
          workspaceId,
          type: ActivityType.WHATSAPP_MESSAGE,
          direction: ActivityDirection.OUTBOUND,
        },
        order: {
          occurredAt: 'DESC',
          createdAt: 'DESC',
        },
        take: 250,
      });

      const byExactTemplate: Record<string, TemplateHeaderMediaCacheEntry> = {};
      const byTemplateName: Record<string, TemplateHeaderMediaCacheEntry> = {};

      for (const activity of activities) {
        const metadata = activity.metadata || {};
        if (String(metadata.messageType || '').trim().toLowerCase() !== 'template') continue;
        if (String(metadata.senderIntegrationId || '').trim() !== integrationId) continue;

        const headerMediaType = String(metadata.headerMediaType || metadata.mediaType || '').trim().toLowerCase();
        if (!['image', 'video', 'document'].includes(headerMediaType)) continue;

        const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
          String(metadata.headerMediaId || metadata.mediaId || '').trim() || undefined,
          String(metadata.headerMediaUrl || metadata.mediaUrl || '').trim() || undefined,
        );
        if (!normalizedHeaderMedia.mediaId && !normalizedHeaderMedia.mediaUrl) continue;

        const templateName = this.extractTemplateNameFromActivity(activity);
        const templateNameKey = this.buildTemplateHeaderMediaNameKey(templateName);
        if (!templateNameKey) continue;

        const entry: TemplateHeaderMediaCacheEntry = {
          headerMediaType: headerMediaType as AutoSendHeaderMediaType,
          headerMediaId: normalizedHeaderMedia.mediaId,
          headerMediaUrl: normalizedHeaderMedia.mediaUrl,
          updatedAt: activity.occurredAt?.toISOString?.()
            || activity.createdAt?.toISOString?.()
            || new Date().toISOString(),
        };

        const templateLanguage = String(metadata.templateLanguage || '').trim();
        if (templateLanguage) {
          const exactKey = this.buildTemplateHeaderMediaCacheKey(templateName, templateLanguage);
          if (exactKey && exactKey !== '::' && !byExactTemplate[exactKey]) {
            byExactTemplate[exactKey] = entry;
          }
        }

        if (!byTemplateName[templateNameKey]) {
          byTemplateName[templateNameKey] = entry;
        }
      }

      return { byExactTemplate, byTemplateName };
    } catch (error: any) {
      this.logger.warn(`Failed to inspect recent template media activities: ${error?.message || error}`);
      return { byExactTemplate: {}, byTemplateName: {} };
    }
  }

  private async persistTemplateHeaderMediaCacheEntry(
    workspaceId: string,
    integrationId: string | undefined,
    templateName: string,
    language: string,
    headerMediaType: AutoSendHeaderMediaType,
    headerMediaId?: string,
    headerMediaUrl?: string,
  ): Promise<void> {
    const normalizedIntegrationId = String(integrationId || '').trim();
    const normalizedTemplateName = String(templateName || '').trim();
    const normalizedLanguage = String(language || '').trim();
    if (!normalizedIntegrationId || !normalizedTemplateName || !normalizedLanguage) return;

    const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
      String(headerMediaId || '').trim() || undefined,
      String(headerMediaUrl || '').trim() || undefined,
    );
    if (!normalizedHeaderMedia.mediaId && !normalizedHeaderMedia.mediaUrl) return;

    const integration = await this.integrationRepository.findOne({
      where: {
        id: normalizedIntegrationId,
        workspaceId,
        type: IntegrationType.WHATSAPP,
      },
    });
    if (!integration) return;

    const cacheKey = this.buildTemplateHeaderMediaCacheKey(normalizedTemplateName, normalizedLanguage);
    const nextCache = {
      ...this.getTemplateHeaderMediaCache(integration),
      [cacheKey]: {
        headerMediaType,
        headerMediaId: normalizedHeaderMedia.mediaId,
        headerMediaUrl: normalizedHeaderMedia.mediaUrl,
        updatedAt: new Date().toISOString(),
      },
    };

    integration.config = {
      ...(integration.config || {}),
      templateHeaderMediaCache: nextCache,
    };
    await this.integrationRepository.save(integration);
  }

  private isInvalidWhatsAppMediaAttachmentIdError(error: any): boolean {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('media attachment id')
      || msg.includes('not a valid whatsapp business account media');
  }

  // A media_id is scoped to the phone number that uploaded it and expires, so
  // after a token/app/number change a stale id is rejected — often as a generic
  // (#200) Permissions error rather than an explicit "media attachment id" message.
  // When we also hold a header URL, treat #200 as a stale-media signal so the
  // caller can retry with the URL instead of failing the whole send.
  private isLikelyStaleHeaderMediaError(error: any): boolean {
    if (this.isLikelyStaleWhatsAppMediaError(error)) return true;
    if (this.isInvalidWhatsAppMediaAttachmentIdError(error)) return true;
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('(#200)') || msg.includes('permissions error');
  }

  private isLikelyStaleWhatsAppMediaError(error: any): boolean {
    const metaError = error?.response?.data?.error;
    const metaCode = Number(metaError?.code || 0);
    const combined = [
      metaError?.message,
      metaError?.error_data?.details,
      error?.message,
    ].map((part) => String(part || '').toLowerCase()).join(' ');

    return metaCode === 131009
      || combined.includes('does not exist or has expired')
      || (combined.includes('media id') && combined.includes('expired'))
      || combined.includes('media attachment id')
      || combined.includes('not a valid whatsapp business account media');
  }

  private hasMediaUrlFallback(message: WhatsAppMessage): boolean {
    return ['image', 'document', 'video', 'audio'].includes(message.type)
      && !!String(message.media?.id || '').trim()
      && !!String(message.media?.url || '').trim();
  }

  private normalizeCampaignRecipients(value: any): CampaignRecipient[] {
    if (!Array.isArray(value)) return [];
    const byPhone = new Map<string, CampaignRecipient>();

    for (const recipient of value) {
      const rawPhone = String(recipient?.phone || '').trim();
      if (!rawPhone) continue;

      const normalizedPhone = normalizePhoneE164(rawPhone) || rawPhone.replace(/[^0-9+]/g, '').trim();
      const dedupeKey = normalizePhoneDigits(normalizedPhone) || normalizePhoneDigits(rawPhone);
      if (!dedupeKey || dedupeKey.length < 7) continue;

      byPhone.set(dedupeKey, {
        phone: normalizedPhone || rawPhone,
        firstName: String(recipient?.firstName || '').trim() || undefined,
        lastName: String(recipient?.lastName || '').trim() || undefined,
      });
    }

    return Array.from(byPhone.values());
  }

  private normalizeCampaignFilter(value: any): CampaignFilter {
    if (!value || typeof value !== 'object') return {};
    const selectedContactIds: string[] = Array.isArray(value.selectedContactIds)
      ? Array.from(
          new Set(
            value.selectedContactIds
              .map((id: any) => String(id || '').trim())
              .filter((id: string) => id.length > 0),
          ),
        )
      : [];
    const recipients = this.normalizeCampaignRecipients(value.recipients);

    return {
      tags: this.sanitizeStringArray(value.tags),
      status: this.sanitizeStringArray(value.status),
      source: this.sanitizeStringArray(value.source),
      selectedContactIds,
      recipients,
    };
  }

  private sanitizeAutoSendConfig(config: any): AutoSendConfig {
    const defaults = this.getDefaultAutoSendConfig();
    const headerMediaType = String(config?.headerMediaType || '').trim().toLowerCase();
    const isValidHeaderMediaType = ['image', 'video', 'document'].includes(headerMediaType);
    const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
      String(config?.headerMediaId || '').trim() || undefined,
      String(config?.headerMediaUrl || '').trim() || undefined,
    );

    return {
      enabled: Boolean(config?.enabled),
      templateName: String(config?.templateName || defaults.templateName).trim() || defaults.templateName,
      language: String(config?.language || defaults.language).trim() || defaults.language,
      includeNameParam: Boolean(config?.includeNameParam),
      headerMediaType: isValidHeaderMediaType ? (headerMediaType as AutoSendHeaderMediaType) : undefined,
      headerMediaId: isValidHeaderMediaType ? normalizedHeaderMedia.mediaId : undefined,
      headerMediaUrl: isValidHeaderMediaType ? normalizedHeaderMedia.mediaUrl : undefined,
      conditions: {
        sources: this.sanitizeStringArray(config?.conditions?.sources),
        statuses: this.sanitizeStringArray(config?.conditions?.statuses),
        typeformFormIds: this.sanitizeStringArray(config?.conditions?.typeformFormIds),
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

  private getContactTypeformFormId(contact: any): string {
    const raw = contact?.customFields?.typeformMetadata?.formId;
    return String(raw || '').trim();
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

    if (conditions.typeformFormIds?.length) {
      const contactFormId = this.getContactTypeformFormId(contact).toLowerCase();
      const allowedFormIds = new Set(
        conditions.typeformFormIds
          .map((formId) => String(formId || '').trim().toLowerCase())
          .filter(Boolean),
      );
      if (!contactFormId || !allowedFormIds.has(contactFormId)) {
        return false;
      }
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

  private async clearStaleAutoSendRuleMediaId(
    workspaceId: string,
    ruleId: string,
    staleMediaId: string,
  ): Promise<void> {
    const normalizedRuleId = String(ruleId || '').trim();
    const normalizedMediaId = String(staleMediaId || '').trim();
    if (!normalizedRuleId || !normalizedMediaId) return;

    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!integrations.length) return;

    let hasChanges = false;
    for (const integration of integrations) {
      const rawRules = Array.isArray(integration.config?.autoSendRules)
        ? integration.config.autoSendRules
        : [];
      if (!rawRules.length) continue;

      let rulesChanged = false;
      const updatedRules = rawRules.map((rawRule: any) => {
        const currentRuleId = String(rawRule?.id || '').trim();
        const currentMediaId = String(rawRule?.headerMediaId || '').trim();
        if (currentRuleId !== normalizedRuleId || currentMediaId !== normalizedMediaId) {
          return rawRule;
        }

        const nextRule = { ...rawRule };
        delete nextRule.headerMediaId;
        rulesChanged = true;
        return nextRule;
      });

      if (!rulesChanged) continue;
      hasChanges = true;
      integration.config = {
        ...(integration.config || {}),
        autoSendRules: updatedRules,
        autoSend: updatedRules.length
          ? this.ruleToAutoSendConfig(this.sanitizeAutoSendRule(updatedRules[0], 0))
          : this.getDefaultAutoSendConfig(),
      };
    }

    if (!hasChanges) return;
    await this.integrationRepository.save(integrations);
    this.logger.log(
      `Auto-send self-heal: cleared stale header media_id for rule=${normalizedRuleId} in workspace=${workspaceId}`,
    );
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
        // This only confirms Meta API accepted the send request.
        // Final delivery/read confirmation comes later via webhook status callbacks.
        title: 'Auto-send sent',
        message: `Template "${templateName}" accepted for delivery to ${fullName} (${contactPhone})`,
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
    const normalizedPhoneNumberId = String(phoneNumberId || '').trim();
    if (!normalizedPhoneNumberId) return null;

    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP },
      order: { createdAt: 'ASC' },
    });

    const exactMatches = integrations.filter((integration) => {
      const storedId = this.getCredentials(this.getIntegrationCredentials(integration), false).phoneNumberId;
      return !!storedId && storedId === normalizedPhoneNumberId;
    });

    if (!exactMatches.length) return null;

    const usableMatches = exactMatches.filter((integration) => this.isIntegrationUsable(integration));
    if (usableMatches.length === 1) return usableMatches[0];

    if (usableMatches.length > 1) {
      const conflictedWorkspaces = Array.from(new Set(usableMatches.map((integration) => integration.workspaceId)));
      this.logger.error(
        `[WebhookRouting] phoneNumberId "${normalizedPhoneNumberId}" is connected to multiple active workspaces: ${conflictedWorkspaces.join(', ')}`,
      );
      return null;
    }

    return null;
  }

  private async assertPhoneNumbersAvailableForWorkspace(
    workspaceId: string,
    phoneNumberIds: string[],
  ): Promise<void> {
    const requestedPhoneNumberIds = new Set(
      phoneNumberIds
        .map((phoneNumberId) => String(phoneNumberId || '').trim())
        .filter((phoneNumberId) => phoneNumberId.length > 0),
    );

    if (!requestedPhoneNumberIds.size) return;

    const integrations = await this.integrationRepository.find({
      where: { type: IntegrationType.WHATSAPP },
      order: { createdAt: 'ASC' },
    });

    const conflicts = new Map<string, string>();
    for (const integration of integrations) {
      if (integration.workspaceId === workspaceId) continue;
      if (!this.isIntegrationUsable(integration)) continue;

      const storedPhoneNumberId = this.getCredentials(this.getIntegrationCredentials(integration), false).phoneNumberId;
      if (!storedPhoneNumberId || !requestedPhoneNumberIds.has(storedPhoneNumberId)) continue;

      conflicts.set(storedPhoneNumberId, integration.workspaceId);
    }

    if (conflicts.size > 0) {
      const conflictedNumbers = Array.from(conflicts.keys()).join(', ');
      throw new BadRequestException(
        `WhatsApp number(s) already connected to another workspace: ${conflictedNumbers}`,
      );
    }
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
    const safeProfileName = this.normalizeWhatsAppProfileName(profileName);
    let contact = await this.findContactByPhone(workspaceId, phone);
    if (!contact) contact = await this.findContactByPhone(workspaceId, waId);

    if (contact && safeProfileName && this.isPlaceholderWhatsAppContactName(contact)) {
      const nameParts = safeProfileName.split(/\s+/).filter(Boolean);
      contact.firstName = nameParts[0] || contact.firstName;
      contact.lastName = nameParts.slice(1).join(' ');
      return this.contactRepository.save(contact);
    }

    if (!contact) {
      const nameParts = (safeProfileName || '').trim().split(/\s+/).filter(Boolean);
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

  private normalizeWhatsAppProfileName(profileName?: string): string | undefined {
    const name = String(profileName || '').replace(/\s+/g, ' ').trim();
    if (!name) return undefined;
    if (INVALID_WHATSAPP_PROFILE_NAMES.has(name.toLowerCase())) return undefined;
    return name;
  }

  private isPlaceholderWhatsAppContactName(contact: Contact): boolean {
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!fullName) return true;
    return INVALID_WHATSAPP_PROFILE_NAMES.has(fullName)
      || fullName === 'whatsapp contact'
      || fullName === 'whatsapp';
  }

  private async saveMessageActivity(
    contact: Contact,
    message: any,
    workspaceId: string,
    ownerId: string,
    integration?: Integration,
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
    } else if (message.type === 'interactive' && message.interactive?.type === 'call_permission_reply') {
      const accepted = message.interactive?.call_permission_reply?.response === 'accept';
      messageBody = accepted ? '[Call permission accepted]' : '[Call permission declined]';
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
        ...this.getIntegrationSenderInfo(integration),
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
    context?: {
      campaignId?: string;
      campaignName?: string;
      senderIntegrationId?: string;
      senderPhoneDisplay?: string;
      replyToMessageId?: string;
      replyPreviewText?: string;
    },
  ): Promise<void> {
    try {
      const phone = normalizePhoneE164(to) || (to.startsWith('+') ? to : `+${to}`);
      const contact2 = await this.findContactByPhone(workspaceId, phone) || await this.findContactByPhone(workspaceId, to);
      const normalizedUserId = userId?.trim() || undefined;

      // Most outbound touchpoints are WhatsApp sends, but a flow's email step
      // routes through here too (messageType 'email') and must be recorded as an
      // EMAIL activity so the feed labels it accurately instead of "WhatsApp".
      const isEmail = messageType === 'email';
      const activity = this.activityRepository.create({
        workspaceId,
        contactId: contact2?.id || undefined,
        userId: normalizedUserId,
        type: isEmail ? ActivityType.EMAIL : ActivityType.WHATSAPP_MESSAGE,
        title: isEmail
          ? `Email to ${contact2 ? `${contact2.firstName} ${contact2.lastName}` : phone}`
          : `WhatsApp to ${contact2 ? `${contact2.firstName} ${contact2.lastName}` : phone}`,
        description: messageBody,
        direction: ActivityDirection.OUTBOUND,
        outcome: ActivityOutcome.SUCCESSFUL,
        occurredAt: new Date(),
        metadata: {
          whatsappMessageId: whatsappMessageId || undefined,
          waId: normalizePhoneDigits(to) || to.replace(/[^0-9]/g, ''),
          messageType,
          messageStatus: 'sent',
          ...(mediaMetadata || {}),
          ...(context?.campaignId ? { campaignId: context.campaignId, campaignName: context.campaignName, isCampaign: true } : {}),
          ...(context?.senderIntegrationId ? { senderIntegrationId: context.senderIntegrationId, senderPhoneDisplay: context.senderPhoneDisplay } : {}),
          ...(context?.replyToMessageId ? { replyToMessageId: context.replyToMessageId } : {}),
          ...(context?.replyPreviewText ? { replyPreviewText: context.replyPreviewText } : {}),
        },
      });

      await this.activityRepository.save(activity);
    } catch (error) {
      this.logger.warn(`Failed to save outbound activity: ${error.message}`);
    }
  }

  private static readonly CALL_STATUS_LABELS: Record<string, string> = {
    completed: 'Call ended',
    missed: 'Missed call',
    no_answer: 'No answer',
    rejected: 'Call declined',
    failed: 'Call failed',
  };

  private static readonly CALL_STATUS_OUTCOMES: Record<string, ActivityOutcome> = {
    completed: ActivityOutcome.SUCCESSFUL,
    missed: ActivityOutcome.NO_ANSWER,
    no_answer: ActivityOutcome.NO_ANSWER,
    rejected: ActivityOutcome.FAILED,
    failed: ActivityOutcome.FAILED,
  };

  private formatCallDuration(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * Logs a finished outbound WhatsApp voice call as a single Activity entry
   * so it shows up inline in the conversation thread (same list the chat UI
   * already renders — reuses ActivityType.WHATSAPP_MESSAGE + a
   * metadata.messageType discriminator rather than a new type, so every
   * existing WHATSAPP_MESSAGE-scoped query picks it up for free).
   */
  async logCallActivity(
    workspaceId: string,
    waId: string,
    opts: {
      callId?: string;
      status: 'completed' | 'missed' | 'no_answer' | 'rejected' | 'failed';
      durationSeconds?: number;
      recordingUrl?: string;
      ownerId?: string;
      senderIntegrationId?: string;
      senderPhoneDisplay?: string;
    },
  ): Promise<void> {
    try {
      const phone = normalizePhoneE164(waId) || `+${waId}`;
      const contact = await this.findContactByPhone(workspaceId, phone) || await this.findContactByPhone(workspaceId, waId);
      const statusLabel = WhatsAppService.CALL_STATUS_LABELS[opts.status] || 'Call ended';
      const durationLabel = opts.durationSeconds ? this.formatCallDuration(opts.durationSeconds) : undefined;
      const description = durationLabel ? `${statusLabel} · ${durationLabel}` : statusLabel;

      const activity = this.activityRepository.create({
        workspaceId,
        contactId: contact?.id || undefined,
        userId: opts.ownerId,
        type: ActivityType.WHATSAPP_MESSAGE,
        title: `WhatsApp call to ${contact ? `${contact.firstName} ${contact.lastName}` : phone}`,
        description,
        direction: ActivityDirection.OUTBOUND,
        outcome: WhatsAppService.CALL_STATUS_OUTCOMES[opts.status] || ActivityOutcome.FAILED,
        occurredAt: new Date(),
        metadata: {
          messageType: 'call',
          waId: normalizePhoneDigits(waId) || waId,
          callId: opts.callId,
          callStatus: opts.status,
          callDurationSeconds: opts.durationSeconds,
          recordingUrl: opts.recordingUrl,
          ...(opts.senderIntegrationId ? { senderIntegrationId: opts.senderIntegrationId, senderPhoneDisplay: opts.senderPhoneDisplay } : {}),
        },
      });

      await this.activityRepository.save(activity);
    } catch (error: any) {
      this.logger.warn(`Failed to log call activity: ${error.message}`);
    }
  }

  async sendMessageWithCredentials(credentials: Record<string, any>, message: WhatsAppMessage): Promise<any> {
    const { accessToken, phoneNumberId } = this.getCredentials(credentials);
    if (!accessToken || !phoneNumberId) throw new BadRequestException('WhatsApp credentials not configured');

    let payload = this.buildMessagePayload(message);
    const maxAttempts = 3;
    let lastError: any = null;

    // Track whether we already fell back to env-var token to avoid infinite loops.
    let usingEnvFallback = false;
    let usingMediaUrlFallback = false;
    let activeToken = accessToken;
    let activePhoneNumberId = phoneNumberId;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.post(`${this.apiUrl}/${activePhoneNumberId}/messages`, payload, {
            headers: { 'Authorization': `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
          }),
        );
        return response.data;
      } catch (error: any) {
        lastError = error;
        const metaError = error?.response?.data?.error;
        const metaCode = Number(metaError?.code || 0);

        // Error 190 = token expired/invalid. Try env-var token once as fallback.
        if (metaCode === 190 && !usingEnvFallback) {
          const envToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '';
          const envPhoneId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
          if (envToken && envToken !== activeToken) {
            usingEnvFallback = true;
            activeToken = envToken;
            activePhoneNumberId = envPhoneId || activePhoneNumberId;
            this.logger.warn(
              `WhatsApp stored token expired (190); retrying with env-var token (attempt ${attempt}/${maxAttempts})`,
            );
            continue;
          }
        }

        if (
          !usingMediaUrlFallback
          && this.hasMediaUrlFallback(message)
          && this.isLikelyStaleWhatsAppMediaError(error)
        ) {
          usingMediaUrlFallback = true;
          payload = this.buildMessagePayload(message, { preferMediaUrl: true });
          this.logger.warn(
            `WhatsApp media_id expired/invalid (${metaCode || 'unknown'}); retrying media send with URL fallback`,
          );
          continue;
        }

        const isRetryableMetaInternal = metaCode === 131000;
        const isLastAttempt = attempt >= maxAttempts;

        if (isRetryableMetaInternal && !isLastAttempt) {
          const waitMs = 250 * attempt;
          this.logger.warn(
            `WhatsApp API transient error ${metaCode} on attempt ${attempt}/${maxAttempts}; retrying in ${waitMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        if (metaError) {
          const details = metaError.error_data?.details ? ` (${metaError.error_data.details})` : '';
          const fbtraceId = metaError.fbtrace_id ? ` [fbtrace_id=${metaError.fbtrace_id}]` : '';
          throw new BadRequestException(
            `WhatsApp API error ${metaError.code || ''}: ${metaError.message || 'Unknown error'}${details}${fbtraceId}`.trim(),
          );
        }
      }
    }

    throw lastError || new BadRequestException('WhatsApp send failed');
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
    integrationId?: string,
  ): Promise<any> {
    const { result } = await this.sendMessageForWorkspace(workspaceId, {
      to,
      type: 'template',
      content: '',
      template: { name: templateName, language, parameters: this.normalizeTemplateComponents(parameters) },
    }, integrationId);
    return result;
  }

  private buildTemplateComponentsWithHeaderMedia(
    parameters: any[] = [],
    headerMediaType?: string,
    headerMediaId?: string,
    headerMediaUrl?: string,
    preferHeaderUrl = false,
  ): any[] {
    const components: any[] = Array.isArray(parameters) ? [...parameters] : [];
    const headerType = String(headerMediaType || '').toLowerCase();
    if (!['image', 'video', 'document'].includes(headerType)) {
      return components;
    }

    const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
      String(headerMediaId || '').trim(),
      String(headerMediaUrl || '').trim(),
    );
    const mediaId = normalizedHeaderMedia.mediaId || '';
    const mediaUrl = normalizedHeaderMedia.mediaUrl || '';
    if (!mediaId && !mediaUrl) {
      return components;
    }

    const headerParam: any = { type: headerType };
    const shouldUseUrl = preferHeaderUrl || !mediaId;
    headerParam[headerType] = shouldUseUrl ? { link: mediaUrl } : { id: mediaId };
    components.unshift({ type: 'header', parameters: [headerParam] });

    return components;
  }

  async sendTemplateMessageForWorkspaceWithHeaderMediaRecovery(
    workspaceId: string,
    payload: {
      to: string;
      templateName: string;
      language?: string;
      parameters?: any[];
      headerMediaType?: 'image' | 'video' | 'document';
      headerMediaId?: string;
      headerMediaUrl?: string;
      integrationId?: string;
    },
  ): Promise<{ result: any; sender: ReturnType<WhatsAppService['getIntegrationSenderInfo']>; usedHeaderUrlFallback: boolean }> {
    const language = payload.language || 'en';
    const headerType = String(payload.headerMediaType || '').toLowerCase();
    const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
      String(payload.headerMediaId || '').trim(),
      String(payload.headerMediaUrl || '').trim(),
    );
    let headerMediaId = normalizedHeaderMedia.mediaId || '';
    let headerMediaUrl = normalizedHeaderMedia.mediaUrl || '';
    const isMediaHeader = ['image', 'video', 'document'].includes(headerType);

    // No media supplied in the request → reuse the cached media_id/URL from the DB so
    // sending to a new number doesn't force a manual re-upload.
    if (isMediaHeader && !headerMediaId && !headerMediaUrl) {
      const cached = await this.resolveCachedTemplateHeaderMedia(
        workspaceId,
        payload.integrationId,
        payload.templateName,
        language,
      );
      if (cached) {
        headerMediaId = String(cached.headerMediaId || '').trim();
        headerMediaUrl = String(cached.headerMediaUrl || '').trim();
      }
    }

    const hasHeaderMedia = isMediaHeader && (headerMediaId || headerMediaUrl);

    const sendTemplate = async (preferHeaderUrl = false): Promise<{ result: any; sender: ReturnType<WhatsAppService['getIntegrationSenderInfo']> }> => {
      const parameters = hasHeaderMedia
        ? this.buildTemplateComponentsWithHeaderMedia(
            payload.parameters || [],
            headerType,
            headerMediaId,
            headerMediaUrl,
            preferHeaderUrl,
          )
        : (payload.parameters || []);

      return this.sendMessageForWorkspace(
        workspaceId,
        {
          to: payload.to,
          type: 'template',
          content: '',
          template: {
            name: payload.templateName,
            language,
            parameters,
          },
        },
        payload.integrationId,
      );
    };

    try {
      const sent = await sendTemplate(false);
      if (hasHeaderMedia) {
        await this.persistTemplateHeaderMediaCacheEntry(
          workspaceId,
          sent.sender.senderIntegrationId,
          payload.templateName,
          language,
          headerType as AutoSendHeaderMediaType,
          headerMediaId || undefined,
          headerMediaUrl || undefined,
        );
      }
      return { ...sent, usedHeaderUrlFallback: false };
    } catch (error: any) {
      const canRetryWithUrl = !!headerMediaId && !!headerMediaUrl && this.isLikelyStaleHeaderMediaError(error);
      if (!canRetryWithUrl) {
        throw error;
      }

      this.logger.warn(
        `Template send: media_id invalid for workspace=${workspaceId}; retrying with header URL`,
      );
      const sent = await sendTemplate(true);
      if (hasHeaderMedia) {
        await this.persistTemplateHeaderMediaCacheEntry(
          workspaceId,
          sent.sender.senderIntegrationId,
          payload.templateName,
          language,
          headerType as AutoSendHeaderMediaType,
          undefined,
          headerMediaUrl || undefined,
        );
      }
      return { ...sent, usedHeaderUrlFallback: true };
    }
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

          // Call lifecycle events (SDP answer once a contact accepts an
          // outbound call, ringing/rejected/terminated status). Relayed to
          // the client via WhatsAppCallingService.CALL_EVENT — see
          // whatsapp-calling.service.ts.
          if (value.calls?.length) {
            const callsPhoneNumberId = value.metadata?.phone_number_id;
            const callsIntegration = await this.callingService.findIntegrationByPhoneNumberId(callsPhoneNumberId);
            if (callsIntegration) {
              await this.callingService.handleCallWebhook(callsIntegration.workspaceId, value);
            } else {
              this.logger.warn(`Calls webhook: no integration found for phoneNumberId ${callsPhoneNumberId}`);
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

            await this.saveMessageActivity(contact, message, integration.workspaceId, ownerId, integration);
            await this.markMessageAsRead(message.id, integration.credentials);

            const callPermissionReply = message.interactive?.call_permission_reply;
            if (message.type === 'interactive' && message.interactive?.type === 'call_permission_reply' && callPermissionReply) {
              const response = callPermissionReply.response === 'accept' ? 'accept' : 'reject';
              await this.callingService.recordCallPermissionResponse(integration.workspaceId, message.from, response, {
                isPermanent: callPermissionReply.is_permanent,
                expirationTimestamp: callPermissionReply.expiration_timestamp,
              });
            }

            const interactiveReply = message.interactive?.button_reply || message.interactive?.list_reply;
            const inferredMessageText =
              message.text?.body
              || message.image?.caption
              || message.document?.caption
              || message.video?.caption
              || interactiveReply?.title
              || '';

            const messageEventPayload = {
              workspaceId: integration.workspaceId,
              integrationId: integration.id,
              ownerId,
              userId: ownerId,
              contactId: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || undefined,
              email: contact.email,
              contactPhone: contact.phone || contact.phoneNormalized || undefined,
              contact: {
                id: contact.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                phoneNormalized: contact.phoneNormalized,
              },
              waId: message.from,
              phone: message.from,
              messageId: message.id,
              messageType: message.type,
              messageText: inferredMessageText || undefined,
              messageTimestamp: message.timestamp,
              occurredAt: new Date().toISOString(),
            };
            this.eventEmitter.emit('message_received', messageEventPayload);
            this.eventEmitter.emit('whatsapp.message.received', messageEventPayload);

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
            // Category-tagged so each user's `message:whatsapp` push preference
            // gates their copy. Single emit — no separate owner push (that
            // duplicated notifications and bypassed the mute toggle).
            await this.notifyWorkspace(integration.workspaceId, {
              type: NotificationType.WHATSAPP,
              category: 'message:whatsapp',
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
  private async updateMessageStatus(status: {
    id: string;
    status: string;
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code?: number; title?: string; message?: string; error_data?: any }>;
  }): Promise<void> {
    try {
      const messageId = String(status?.id || '').trim();
      if (!messageId) return;

      const normalizedStatus = String(status?.status || '').trim().toLowerCase();
      const activities = await this.activityRepository
        .createQueryBuilder('activity')
        .where('activity.type = :type', { type: ActivityType.WHATSAPP_MESSAGE })
        .andWhere('activity.direction = :direction', { direction: ActivityDirection.OUTBOUND })
        .andWhere("activity.metadata->>'whatsappMessageId' = :messageId", { messageId })
        .orderBy('activity.createdAt', 'DESC')
        .getMany();

      if (!activities.length) {
        this.logger.debug(
          `WhatsApp status "${normalizedStatus || 'unknown'}" for message ${messageId} has no matching outbound activity`,
        );
        return;
      }

      for (const activity of activities) {
        const nextMetadata = {
          ...(activity.metadata || {}),
          messageStatus: normalizedStatus || status.status,
          messageStatusUpdatedAt: new Date().toISOString(),
        } as Record<string, any>;

        if (status?.timestamp) {
          const ts = Number(status.timestamp);
          nextMetadata.messageStatusTimestamp = Number.isFinite(ts)
            ? new Date(ts * 1000).toISOString()
            : String(status.timestamp);
        }
        if (status?.recipient_id) {
          nextMetadata.messageStatusRecipientId = String(status.recipient_id);
        }

        const firstError = Array.isArray(status.errors) ? status.errors[0] : undefined;
        if (firstError) {
          nextMetadata.messageStatusError = {
            code: firstError.code,
            title: firstError.title,
            message: firstError.message,
            details: firstError.error_data,
          };
        }

        activity.metadata = nextMetadata;

        if (normalizedStatus === 'failed' || normalizedStatus === 'undelivered') {
          activity.outcome = ActivityOutcome.FAILED;
        } else if (['sent', 'delivered', 'read'].includes(normalizedStatus)) {
          if (activity.outcome !== ActivityOutcome.FAILED) {
            activity.outcome = ActivityOutcome.SUCCESSFUL;
          }
        }

        await this.activityRepository.save(activity);
      }

      if (normalizedStatus === 'failed' || normalizedStatus === 'undelivered') {
        const firstError = Array.isArray(status.errors) ? status.errors[0] : undefined;
        const errorDetails = firstError
          ? ` code=${firstError.code || '-'} title="${firstError.title || ''}" message="${firstError.message || ''}" recipient="${status.recipient_id || ''}" details="${String(firstError.error_data?.details || '')}" href="${String((firstError as any)?.href || '')}"`
          : '';
        this.logger.warn(`WhatsApp delivery FAILED for message ${messageId}.${errorDetails}`);
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

  private buildMessagePayload(message: WhatsAppMessage, options: { preferMediaUrl?: boolean } = {}): any {
    const normalizedTo = normalizePhoneDigits(message.to);
    if (!normalizedTo) {
      throw new BadRequestException('Recipient phone is invalid');
    }
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizedTo };
    const contextPayload = message.context?.messageId
      ? { context: { message_id: message.context.messageId } }
      : {};
    const applyMediaReference = (target: any) => {
      const mediaId = String(message.media?.id || '').trim();
      const mediaUrl = String(message.media?.url || '').trim();
      if (options.preferMediaUrl && mediaUrl) {
        target.link = mediaUrl;
      } else if (mediaId) {
        target.id = mediaId;
      } else if (mediaUrl) {
        target.link = mediaUrl;
      } else {
        throw new BadRequestException('WhatsApp media URL or ID is required');
      }
    };
    switch (message.type) {
      case 'text': return { ...base, ...contextPayload, type: 'text', text: { preview_url: true, body: message.content } };
      case 'template': return {
        ...base, ...contextPayload, type: 'template',
        template: { name: message.template!.name, language: { code: message.template!.language }, components: message.template!.parameters || [] },
      };
      case 'image': {
        const img: any = { caption: message.media!.caption };
        applyMediaReference(img);
        return { ...base, ...contextPayload, type: 'image', image: img };
      }
      case 'document': {
        const doc: any = { caption: message.media!.caption, filename: message.media!.filename };
        applyMediaReference(doc);
        return { ...base, ...contextPayload, type: 'document', document: doc };
      }
      case 'video': {
        const vid: any = { caption: message.media!.caption };
        applyMediaReference(vid);
        return { ...base, ...contextPayload, type: 'video', video: vid };
      }
      case 'audio': {
        const aud: any = {};
        applyMediaReference(aud);
        if (message.media?.voice) aud.voice = true;
        return { ...base, ...contextPayload, type: 'audio', audio: aud };
      }
      case 'interactive': return { ...base, ...contextPayload, type: 'interactive', interactive: message.interactive };
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
    integrationId?: string,
  ): Promise<{ buffer: Buffer; contentType: string; fileName?: string }> {
    let candidates: Integration[] = [];
    if (integrationId?.trim()) {
      candidates = [await this.resolveWorkspaceSendIntegration(workspaceId, integrationId.trim())];
    } else {
      const all = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
      const preferred = this.chooseDefaultWorkspaceIntegration(all);
      const preferredId = preferred?.id;
      candidates = preferred
        ? [preferred, ...all.filter((integration) => integration.id !== preferredId && this.isIntegrationUsable(integration))]
        : all.filter((integration) => this.isIntegrationUsable(integration));
    }

    if (!candidates.length) {
      throw new BadRequestException('No WhatsApp integration found for this workspace');
    }

    let lastError: any = null;
    for (const integration of candidates) {
      const { accessToken } = this.getCredentials(this.getIntegrationCredentials(integration), false);
      if (!accessToken) continue;

      try {
        const mediaInfoRes = await firstValueFrom(
          this.httpService.get(`${this.apiUrl}/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { fields: 'id,mime_type,url' },
          }),
        );
        const mediaInfo = mediaInfoRes.data || {};
        if (!mediaInfo?.url) continue;

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
      } catch (error: any) {
        lastError = error;
      }
    }

    if (lastError?.response?.data?.error?.message) {
      throw new BadRequestException(`Unable to fetch media: ${lastError.response.data.error.message}`);
    }
    if (lastError?.message) {
      throw new BadRequestException(`Unable to fetch media: ${lastError.message}`);
    }
    throw new BadRequestException('Unable to fetch media with any connected WhatsApp number');
  }

  /**
   * Upload media to Meta WhatsApp Media API
   * Returns { id: media_id } which can be used in messages
   */
  async uploadMedia(
    workspaceId: string,
    filePath: string,
    mimeType: string,
    filename: string,
    integrationId?: string,
    options?: { forceVoiceNote?: boolean },
  ): Promise<{ id: string; url?: string }> {
    const integration = await this.resolveWorkspaceSendIntegration(workspaceId, integrationId);
    const { accessToken, phoneNumberId } = this.getCredentials(this.getIntegrationCredentials(integration), false);
    const forceVoiceNote = options?.forceVoiceNote === true;

    // Some mobile clients provide generic or mismatched MIME types. Normalize by extension first.
    const inputExtension = extname(String(filename || '')).toLowerCase();
    let uploadMimeType = String(mimeType || '').trim().toLowerCase() || 'application/octet-stream';
    if (uploadMimeType === 'application/octet-stream') {
      if (inputExtension === '.m4a' || inputExtension === '.mp4') uploadMimeType = 'audio/mp4';
      else if (inputExtension === '.aac') uploadMimeType = 'audio/aac';
      else if (inputExtension === '.mp3') uploadMimeType = 'audio/mpeg';
      else if (inputExtension === '.ogg') uploadMimeType = 'audio/ogg';
      else if (inputExtension === '.amr') uploadMimeType = 'audio/amr';
      else if (inputExtension === '.wav' || inputExtension === '.wave') uploadMimeType = 'audio/wav';
      else if (inputExtension === '.caf') uploadMimeType = 'audio/x-caf';
      else if (inputExtension === '.webm') uploadMimeType = 'audio/webm';
    }

    // Meta supports only a subset of audio formats. Convert unsupported/ambiguous containers to OGG/Opus.
    let uploadFilename = filename;
    let convertedPath: string | null = null;
    let actualFilePath = filePath;
    const acceptedAudioMimeTypes = new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg']);
    const needsAudioConversion = uploadMimeType.startsWith('audio/')
      && (
        forceVoiceNote
        || uploadMimeType.startsWith('audio/webm')
        || uploadMimeType === 'audio/caf'
        || uploadMimeType === 'audio/x-caf'
        || uploadMimeType === 'audio/wav'
        || uploadMimeType === 'audio/x-wav'
        || uploadMimeType === 'audio/wave'
        || uploadMimeType === 'audio/x-pn-wav'
        || inputExtension === '.webm'
        || inputExtension === '.caf'
        || inputExtension === '.wav'
        || inputExtension === '.wave'
        || !acceptedAudioMimeTypes.has(uploadMimeType)
      );

    if (needsAudioConversion) {
      uploadMimeType = 'audio/ogg';
      uploadFilename = filename.replace(/\.[^.]+$/, '') + '.ogg';
      convertedPath = join(os.tmpdir(), `wa_converted_${Date.now()}.ogg`);
      try {
        await execFileAsync('ffmpeg', [
          '-i', filePath,
          '-vn',
          '-c:a', 'libopus',
          '-b:a', '32k',
          '-ac', '1',
          '-y',
          convertedPath,
        ]);
        actualFilePath = convertedPath;
        this.logger.log(
          `Converted audio to ogg${forceVoiceNote ? ' (voice note)' : ''}: ${filePath} (${mimeType || 'unknown'}) → ${convertedPath}`,
        );
      } catch (convErr: any) {
        this.logger.error(`ffmpeg conversion failed: ${convErr?.message || convErr}`);
        throw new BadRequestException('Audio conversion failed — ffmpeg error');
      }
    }

    // Build FormData for Meta upload
    const FormData = require('form-data');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', createReadStream(actualFilePath), { filename: uploadFilename, contentType: uploadMimeType });
    form.append('type', uploadMimeType);

    try {
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

      this.logger.log(`Media uploaded: ${response.data.id} (${uploadMimeType}, ${uploadFilename})`);

      // Mirror visual/document media to R2 so template headers keep a permanent
      // URL fallback. A Meta media_id is scoped to the uploading number and
      // expires, so the stored URL is what lets auto-send recover (see
      // isLikelyStaleHeaderMediaError). Audio (voice notes) is transient — skip it.
      let mirrorUrl: string | undefined;
      const isHeaderMedia = uploadMimeType.startsWith('image/')
        || uploadMimeType.startsWith('video/')
        || uploadMimeType.startsWith('application/');
      if (isHeaderMedia) {
        try {
          const buffer = await fsPromises.readFile(actualFilePath);
          const saved = await this.uploadService.saveBufferToStorage(
            buffer,
            uploadMimeType,
            uploadFilename,
            'whatsapp-media',
          );
          mirrorUrl = saved.url;
        } catch (mirrorErr: any) {
          this.logger.warn(
            `R2 mirror failed for media ${response.data.id} (${uploadMimeType}): ${mirrorErr?.message || mirrorErr}`,
          );
        }
      }

      return { id: response.data.id, url: mirrorUrl };
    } catch (error: any) {
      const metaMessage = String(error?.response?.data?.error?.message || error?.message || 'Unknown upload error');
      const metaCode = String(error?.response?.data?.error?.code || '').trim();
      const details = String(error?.response?.data?.error?.error_data?.details || '').trim();
      this.logger.error(
        `WhatsApp media upload failed integration=${integration.id} mime=${uploadMimeType} ext=${inputExtension || 'none'} code=${metaCode || 'n/a'} message=${metaMessage}${details ? ` details=${details}` : ''}`,
      );
      throw new BadRequestException(
        details
          ? `WhatsApp media upload failed: ${metaMessage} (${details})`
          : `WhatsApp media upload failed: ${metaMessage}`,
      );
    } finally {
      await fsPromises.unlink(filePath).catch((error: any) => {
        this.logger.warn(`Failed to cleanup temp upload file ${filePath}: ${error?.message || error}`);
      });
      if (convertedPath) {
        await fsPromises.unlink(convertedPath).catch((error: any) => {
          this.logger.warn(`Failed to cleanup converted file ${convertedPath}: ${error?.message || error}`);
        });
      }
    }
  }

  /**
   * List message templates from Meta (requires WABA ID)
   */
  async listTemplates(workspaceId: string, integrationId?: string): Promise<any[]> {
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!integrations.length) return [];

    const requestedIntegrationId = String(integrationId || '').trim();
    const selectedIntegration = requestedIntegrationId
      ? integrations.find((integration) => integration.id === requestedIntegrationId) || null
      : null;
    const cacheIntegration = selectedIntegration
      || this.chooseDefaultWorkspaceIntegration(integrations)
      || integrations[0];
    const apiIntegration = (selectedIntegration && this.hasIntegrationSendCredentials(selectedIntegration))
      ? selectedIntegration
      : integrations.find((integration) => this.isIntegrationUsable(integration) && this.hasIntegrationSendCredentials(integration))
        || cacheIntegration;

    const credentials = this.getIntegrationCredentials(apiIntegration);
    const { accessToken } = this.getCredentials(credentials);
    const wabaId = credentials?.wabaId || credentials?.waba_id || apiIntegration?.config?.wabaId
      || this.configService.get<string>('WHATSAPP_WABA_ID');
    if (!wabaId) return [];
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      const templates = Array.isArray(response.data?.data) ? response.data.data : [];
      const needsActivityFallback = templates.some((template: any) => !this.getCachedTemplateHeaderMedia(
        cacheIntegration,
        String(template?.name || ''),
        String(template?.language || ''),
      ));
      const activityLookup = needsActivityFallback
        ? await this.getRecentTemplateHeaderMediaActivityLookup(workspaceId, cacheIntegration)
        : { byExactTemplate: {}, byTemplateName: {} };

      const recoveredCacheEntries = new Map<string, { templateName: string; language: string; entry: TemplateHeaderMediaCacheEntry }>();
      const hydratedTemplates = templates.map((template: any) => {
        const templateName = String(template?.name || '');
        const templateLanguage = String(template?.language || '');
        const cachedHeaderMedia = this.getCachedTemplateHeaderMedia(
          cacheIntegration,
          templateName,
          templateLanguage,
        );
        const fallbackHeaderMedia = cachedHeaderMedia
          || activityLookup.byExactTemplate[this.buildTemplateHeaderMediaCacheKey(templateName, templateLanguage)]
          || activityLookup.byTemplateName[this.buildTemplateHeaderMediaNameKey(templateName)];

        if (!fallbackHeaderMedia) return template;

        if (!cachedHeaderMedia) {
          recoveredCacheEntries.set(
            this.buildTemplateHeaderMediaCacheKey(templateName, templateLanguage),
            { templateName, language: templateLanguage, entry: fallbackHeaderMedia },
          );
        }

        return {
          ...template,
          headerMediaType: fallbackHeaderMedia.headerMediaType,
          headerMediaId: fallbackHeaderMedia.headerMediaId,
          headerMediaUrl: fallbackHeaderMedia.headerMediaUrl,
          cachedHeaderMediaUpdatedAt: fallbackHeaderMedia.updatedAt,
        };
      });

      if (cacheIntegration?.id && recoveredCacheEntries.size > 0) {
        await Promise.all(
          Array.from(recoveredCacheEntries.values()).map(async ({ templateName, language, entry }) => {
            await this.persistTemplateHeaderMediaCacheEntry(
              workspaceId,
              cacheIntegration.id,
              templateName,
              language,
              entry.headerMediaType,
              entry.headerMediaId,
              entry.headerMediaUrl,
            );
          }),
        );
      }

      return hydratedTemplates;
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
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    const integration = this.chooseAutoSendConfigIntegration(integrations);
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
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    if (!integrations.length) throw new BadRequestException('No WhatsApp integration found for this workspace');

    const rawRules = Array.isArray(config?.autoSendRules)
      ? config.autoSendRules
      : (Array.isArray(config?.rules) ? config.rules : null);

    const targetIntegration = this.chooseAutoSendConfigIntegration(integrations) || integrations[0];
    const normalizedConfig = { ...(targetIntegration.config || {}) } as any;
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

    for (const integration of integrations) {
      integration.config = {
        ...(integration.config || {}),
        autoSend: normalizedConfig.autoSend,
        autoSendRules: normalizedConfig.autoSendRules,
      };
    }
    await this.integrationRepository.save(integrations);
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
    filter: CampaignFilter,
    template: { name: string; language: string; params?: any[] },
    context?: BroadcastContext,
  ): Promise<{ total: number; sent: number; failed: number; results: any[] }> {
    const normalizedFilter = this.normalizeCampaignFilter(filter);
    const directRecipients = normalizedFilter.recipients || [];
    const results: any[] = [];
    let sent = 0;
    let failed = 0;

    if (directRecipients.length > 0) {
      for (const recipient of directRecipients) {
        const phone = normalizePhoneE164(recipient.phone) || recipient.phone.replace(/[^0-9+]/g, '');
        if (!phone) {
          results.push({
            phone: recipient.phone,
            success: false,
            error: 'Invalid phone',
          });
          failed++;
          continue;
        }

        try {
          const msgResult = await this.sendTemplateMessageForWorkspace(
            workspaceId,
            phone,
            template.name,
            template.language,
            template.params || [],
          );
          const msgId = msgResult?.messages?.[0]?.id;
          await this.saveOutboundActivity(phone, `[Broadcast template: ${template.name}]`, 'template', workspaceId, '', msgId, {
            templateName: template.name,
            templateLanguage: template.language,
            ...(context?.campaignId || context?.campaignName ? {
              campaignId: context?.campaignId,
              campaignName: context?.campaignName,
              isCampaign: true,
              campaignAudienceType: 'direct_list',
            } : {}),
          });
          results.push({
            phone,
            firstName: recipient.firstName,
            lastName: recipient.lastName,
            success: true,
          });
          sent++;
        } catch (err: any) {
          results.push({
            phone,
            firstName: recipient.firstName,
            lastName: recipient.lastName,
            success: false,
            error: err?.message || 'Send failed',
          });
          failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      this.logger.log(`Broadcast "${template.name}" to direct list: ${sent}/${directRecipients.length} in workspace ${workspaceId}`);
      return { total: directRecipients.length, sent, failed, results };
    }

    const where: any = { workspaceId };
    const selectedIds = normalizedFilter.selectedContactIds || [];
    if (normalizedFilter.status?.length) where.status = In(normalizedFilter.status);
    if (normalizedFilter.source?.length) where.source = In(normalizedFilter.source);
    if (selectedIds.length) where.id = In(selectedIds);

    let contacts = await this.contactRepository.find({ where, take: 1000 });

    // Filter by tags in memory (simple-array columns don't support SQL LIKE easily)
    if (normalizedFilter.tags?.length) {
      contacts = contacts.filter(c => {
        const contactTags = c.tags || [];
        return normalizedFilter.tags!.every(t => contactTags.includes(t));
      });
    }

    // Only contacts that have a phone number
    contacts = contacts.filter(c => c.phone);

    for (const contact of contacts) {
      const phone = normalizePhoneE164(contact.phone) || contact.phone!.replace(/[^0-9+]/g, '');
      try {
        const msgResult = await this.sendTemplateMessageForWorkspace(
          workspaceId,
          phone,
          template.name,
          template.language,
          template.params || [],
        );
        const msgId = msgResult?.messages?.[0]?.id;
        await this.saveOutboundActivity(phone, `[Broadcast template: ${template.name}]`, 'template', workspaceId, contact.ownerId || '', msgId, {
          templateName: template.name,
          templateLanguage: template.language,
          ...(context?.campaignId || context?.campaignName ? {
            campaignId: context?.campaignId,
            campaignName: context?.campaignName,
            isCampaign: true,
            campaignAudienceType: 'crm_filters',
          } : {}),
        });
        results.push({ phone, contactId: contact.id, success: true });
        sent++;
      } catch (err: any) {
        results.push({ phone, contactId: contact.id, success: false, error: err?.message || 'Send failed' });
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
          const msgResult = await this.sendTemplateMessageForWorkspace(
            workspaceId,
            phone,
            options.sendTemplate.name,
            options.sendTemplate.language,
            options.sendTemplate.params || [],
          );
          const msgId = msgResult?.messages?.[0]?.id;
          await this.saveOutboundActivity(phone, `[CSV import template: ${options.sendTemplate.name}]`, 'template', workspaceId, ownerId, msgId);
          resultEntry.sent = true;
          sent++;
        } catch (err: any) {
          resultEntry.sent = false;
          resultEntry.sendError = err?.message || 'Send failed';
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

      const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
      const configIntegration = this.chooseAutoSendConfigIntegration(integrations);
      if (!configIntegration) {
        this.logger.log(`Auto-send skipped: no WhatsApp integration in workspace ${workspaceId}`);
        return;
      }

      const matchedRule = this.selectAutoSendRule(contact, configIntegration.config || {});
      if (!matchedRule) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: no matching enabled rule`);
        return;
      }

      let senderIntegration: Integration;
      try {
        senderIntegration = await this.resolveWorkspaceSendIntegration(workspaceId, configIntegration.id);
      } catch {
        senderIntegration = await this.resolveWorkspaceSendIntegration(workspaceId);
      }

      const conditions = matchedRule.conditions || {};
      const rawPhone = contact.phone || '';
      const phone = normalizePhoneDigits(rawPhone) || rawPhone.replace(/[^0-9]/g, '');
      const normalizedE164 = normalizePhoneE164(rawPhone);
      if (!phone || phone.length < 7) {
        this.logger.log(
          `Auto-send skipped for contact ${contact.id}: invalid phone ("${rawPhone}" → digits="${phone}", e164="${normalizedE164 || ''}", len=${phone.length}, requirePhone=${conditions.requirePhone !== false})`,
        );
        return;
      }

      const blockedMap = this.normalizeArchivedMap(configIntegration.config?.conversationBlockedMap);
      if (blockedMap[phone]) {
        this.logger.log(`Auto-send skipped for contact ${contact.id}: ${phone} is blocked`);
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
      const headerMediaType = String(matchedRule.headerMediaType || '').toLowerCase();
      const normalizedHeaderMedia = this.normalizeHeaderMediaInput(
        String(matchedRule.headerMediaId || '').trim(),
        String(matchedRule.headerMediaUrl || '').trim(),
      );
      const headerMediaId = normalizedHeaderMedia.mediaId || '';
      const headerMediaUrl = normalizedHeaderMedia.mediaUrl || '';

      if (['image', 'video', 'document'].includes(headerMediaType) && !headerMediaId && !headerMediaUrl) {
        this.logger.warn(`Auto-send skipped for contact ${contact.id}: template header media is required but not configured`);
        return;
      }

      const buildTemplateParams = (preferHeaderUrl = false): any[] => {
        const params: any[] = [];

        if (['image', 'video', 'document'].includes(headerMediaType) && (headerMediaId || headerMediaUrl)) {
          const headerParam: any = { type: headerMediaType };
          const useUrl = preferHeaderUrl || !headerMediaId;
          headerParam[headerMediaType] = useUrl ? { link: headerMediaUrl } : { id: headerMediaId };
          params.push({ type: 'header', parameters: [headerParam] });
        }

        // Only add name param if the template actually accepts body parameters.
        // hello_world and many basic templates have ZERO params — sending params causes #132000
        if (matchedRule.includeNameParam && contact.firstName && templateName !== 'hello_world') {
          params.push({ type: 'body', parameters: [{ type: 'text', text: contact.firstName }] });
        }

        return params;
      };

      const senderCandidates = [
        senderIntegration,
        ...integrations.filter((integration) =>
          integration.id !== senderIntegration.id
          && this.isIntegrationUsable(integration)
          && this.hasIntegrationSendCredentials(integration),
        ),
      ];

      this.logger.log(
        `Auto-send: rule="${matchedRule.name}" template="${templateName}" lang="${language}" to phone="${phone}" (raw="${rawPhone}", e164="${normalizedE164 || ''}") contact=${contact.id} source=${contact.source} senderIntegration=${senderIntegration.id}`,
      );
      let msgResult: any = null;
      let lastError: any = null;
      let usedHeaderUrlFallback = false;
      for (const candidateIntegration of senderCandidates) {
        const sendTemplate = async (preferHeaderUrl = false): Promise<any> => this.sendMessageWithCredentials(
          this.getIntegrationCredentials(candidateIntegration),
          {
            to: phone,
            type: 'template',
            content: '',
            template: { name: templateName, language, parameters: buildTemplateParams(preferHeaderUrl) },
          },
        );

        try {
          msgResult = await sendTemplate(false);
          senderIntegration = candidateIntegration;
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          const canRetryWithUrl = !!headerMediaId && !!headerMediaUrl && this.isLikelyStaleHeaderMediaError(err);
          if (canRetryWithUrl) {
            this.logger.warn(
              `Auto-send: media_id invalid for sender ${candidateIntegration.id}, retrying with header URL for contact ${contact.id}`,
            );
            try {
              msgResult = await sendTemplate(true);
              senderIntegration = candidateIntegration;
              lastError = null;
              usedHeaderUrlFallback = true;
              break;
            } catch (retryErr) {
              lastError = retryErr;
            }
          }

          const shouldTryNextSender = !!headerMediaId && this.isInvalidWhatsAppMediaAttachmentIdError(lastError);
          if (shouldTryNextSender) {
            this.logger.warn(
              `Auto-send: sender ${candidateIntegration.id} rejected media_id for contact ${contact.id}; trying next available sender`,
            );
            continue;
          }

          throw lastError;
        }
      }

      if (!msgResult && lastError) {
        throw lastError;
      }

      if (usedHeaderUrlFallback && matchedRule.id && headerMediaId) {
        await this.clearStaleAutoSendRuleMediaId(workspaceId, matchedRule.id, headerMediaId);
      }

      const msgId = msgResult?.messages?.[0]?.id;
      // Save as outbound activity so it appears in the WhatsApp inbox
      const ownerId = this.isValidUuid(String(contact.ownerId || '')) ? String(contact.ownerId) : undefined;
      const fallbackUserId = this.isValidUuid(String(senderIntegration.userId || '')) ? String(senderIntegration.userId) : undefined;
      await this.saveOutboundActivity(
        phone,
        `[Auto-send template: ${templateName}]`,
        'template',
        workspaceId,
        ownerId || fallbackUserId,
        msgId,
        {
          templateName,
          templateLanguage: language,
          headerMediaType: ['image', 'video', 'document'].includes(headerMediaType) ? headerMediaType : undefined,
          headerMediaId: usedHeaderUrlFallback ? undefined : (headerMediaId || undefined),
          headerMediaUrl: headerMediaUrl || undefined,
          mediaType: ['image', 'video', 'document'].includes(headerMediaType) ? headerMediaType : undefined,
          mediaId: usedHeaderUrlFallback ? undefined : (headerMediaId || undefined),
          mediaUrl: headerMediaUrl || undefined,
          ...this.getIntegrationSenderInfo(senderIntegration),
        },
      );
      await this.armAfterAutoSendFlow(workspaceId, phone, senderIntegration, matchedRule.id);
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
  private async getContactedStage(
    workspaceId: string,
    pipelineId?: string,
  ): Promise<Pick<PipelineStage, 'id' | 'pipelineId'> | null> {
    const query = this.pipelineStageRepository
      .createQueryBuilder('stage')
      .select(['stage.id', 'stage.pipelineId'])
      .where('stage.workspaceId = :workspaceId', { workspaceId })
      .andWhere('stage.deletedAt IS NULL')
      .andWhere('LOWER(stage.name) LIKE :contactedPattern', { contactedPattern: '%contact%' })
      .orderBy('stage.displayOrder', 'ASC');

    if (pipelineId) {
      query.andWhere('stage.pipelineId = :pipelineId', { pipelineId });
    }

    return query.getOne();
  }

  private async syncAssignedConversationContact(
    workspaceId: string,
    waId: string,
    userId: string,
  ): Promise<void> {
    const contact = await this.findContactByPhone(workspaceId, waId);
    if (!contact) {
      return;
    }

    const assignee = await this.userRepository.findOne({
      where: { id: userId, workspaceId },
      select: ['id', 'role'],
    });
    if (!assignee) {
      this.logger.warn(
        `Skipping contact sync for conversation ${waId}: user ${userId} not found in workspace ${workspaceId}`,
      );
      return;
    }

    let shouldSave = false;
    if (contact.ownerId !== assignee.id) {
      contact.ownerId = assignee.id;
      shouldSave = true;
    }

    if (
      [UserRole.CLOSER, UserRole.MANAGER, UserRole.SETTER].includes(assignee.role)
      && contact.closerId !== assignee.id
    ) {
      contact.closerId = assignee.id;
      shouldSave = true;
    }
    if (assignee.role === UserRole.SETTER && contact.setterId !== assignee.id) {
      contact.setterId = assignee.id;
      shouldSave = true;
    }
    if (assignee.role === UserRole.CALLER && contact.callerId !== assignee.id) {
      contact.callerId = assignee.id;
      shouldSave = true;
    }

    if (contact.status === ContactStatus.LEAD) {
      contact.status = ContactStatus.PROSPECT;
      shouldSave = true;
    }

    const contactedStage = await this.getContactedStage(workspaceId, contact.pipelineId);
    if (contactedStage && contact.pipelineStageId !== contactedStage.id) {
      contact.pipelineStageId = contactedStage.id;
      if (!contact.pipelineId) {
        contact.pipelineId = contactedStage.pipelineId;
      }
      shouldSave = true;
    }

    if (shouldSave) {
      contact.lastContactedAt = new Date();
      await this.contactRepository.save(contact);
    }
  }

  async getConversationAssignments(workspaceId: string): Promise<Record<string, any>> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return integration?.config?.conversationAssignments || {};
  }

  async getConversationState(
    workspaceId: string,
  ): Promise<{
    archivedMap: Record<string, boolean>;
    readAtMap: Record<string, string>;
    pinnedMap: Record<string, boolean>;
    mutedUntilMap: Record<string, string>;
    blockedMap: Record<string, boolean>;
  }> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    return {
      archivedMap: this.normalizeArchivedMap(integration?.config?.conversationArchivedMap),
      readAtMap: this.normalizeReadAtMap(integration?.config?.conversationReadAtMap),
      pinnedMap: this.normalizePinnedMap(integration?.config?.conversationPinnedMap),
      mutedUntilMap: this.normalizeMutedUntilMap(integration?.config?.conversationMutedUntilMap),
      blockedMap: this.normalizeArchivedMap(integration?.config?.conversationBlockedMap),
    };
  }

  /**
   * Blocks/unblocks at the real Meta platform level (they can no longer message
   * this WhatsApp number at all) via the Cloud API's block_users endpoint, and
   * records it locally so the CRM's own auto-send also stops targeting them —
   * belt and suspenders in case the Meta call fails (older API version, missing
   * permission, etc.) or the account isn't eligible for that endpoint yet.
   */
  async setContactBlocked(workspaceId: string, waId: string, blocked: boolean): Promise<void> {
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid conversation id');

    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');

    const { accessToken, phoneNumberId } = this.getCredentials(this.getIntegrationCredentials(integration), false);
    if (accessToken && phoneNumberId) {
      try {
        const body = { messaging_product: 'whatsapp', block_users: [{ user: normalizedWaId }] };
        if (blocked) {
          await firstValueFrom(this.httpService.post(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/block_users`,
            body,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          ));
        } else {
          await firstValueFrom(this.httpService.delete(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/block_users`,
            { headers: { Authorization: `Bearer ${accessToken}` }, data: body },
          ));
        }
      } catch (err: any) {
        this.logger.warn(`Meta block_users call failed for ${normalizedWaId}: ${this.getErrorMessage(err)}`);
      }
    }

    const map = this.normalizeArchivedMap(integration.config?.conversationBlockedMap);
    if (blocked) {
      map[normalizedWaId] = true;
    } else {
      delete map[normalizedWaId];
    }
    integration.config = { ...(integration.config || {}), conversationBlockedMap: map };
    await this.integrationRepository.save(integration);
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
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) {
      throw new BadRequestException('Invalid conversation id');
    }

    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const current = integration.config?.conversationAssignments || {};
    if (assignment) {
      current[normalizedWaId] = { ...assignment, assignedAt: new Date().toISOString() };
    } else {
      delete current[normalizedWaId];
    }
    integration.config = { ...(integration.config || {}), conversationAssignments: current };
    await this.integrationRepository.save(integration);

    if (assignment?.userId) {
      await this.syncAssignedConversationContact(workspaceId, normalizedWaId, assignment.userId);
    }
  }

  async setConversationArchived(
    workspaceId: string,
    waId: string,
    archived: boolean,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const map = this.normalizeArchivedMap(integration.config?.conversationArchivedMap);
    if (archived) {
      map[waId] = true;
    } else {
      delete map[waId];
    }
    integration.config = { ...(integration.config || {}), conversationArchivedMap: map };
    await this.integrationRepository.save(integration);
  }

  async setConversationReadState(
    workspaceId: string,
    waId: string,
    read: boolean,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const map = this.normalizeReadAtMap(integration.config?.conversationReadAtMap);
    if (read) {
      map[waId] = new Date().toISOString();
    } else {
      delete map[waId];
    }
    integration.config = { ...(integration.config || {}), conversationReadAtMap: map };
    await this.integrationRepository.save(integration);
  }

  async setConversationPinned(
    workspaceId: string,
    waId: string,
    pinned: boolean,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const map = this.normalizePinnedMap(integration.config?.conversationPinnedMap);
    if (pinned) {
      map[waId] = true;
    } else {
      delete map[waId];
    }
    integration.config = { ...(integration.config || {}), conversationPinnedMap: map };
    await this.integrationRepository.save(integration);
  }

  async setConversationMutedUntil(
    workspaceId: string,
    waId: string,
    mutedUntil: string | null,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    const map = this.normalizeMutedUntilMap(integration.config?.conversationMutedUntilMap);
    const candidate = String(mutedUntil || '').trim();
    if (!candidate) {
      delete map[waId];
    } else {
      const parsed = new Date(candidate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid mutedUntil date');
      }
      map[waId] = parsed.toISOString();
    }
    integration.config = { ...(integration.config || {}), conversationMutedUntilMap: map };
    await this.integrationRepository.save(integration);
  }

  private normalizeArchivedMap(value: any): Record<string, boolean> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, boolean> = {};
    for (const [waId, archived] of Object.entries(value)) {
      const normalizedWaId = normalizePhoneDigits(String(waId || ''));
      if (!normalizedWaId) continue;
      if (archived) result[normalizedWaId] = true;
    }
    return result;
  }

  private normalizeReadAtMap(value: any): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [waId, readAtRaw] of Object.entries(value)) {
      const normalizedWaId = normalizePhoneDigits(String(waId || ''));
      if (!normalizedWaId) continue;
      const readAt = String(readAtRaw || '').trim();
      if (!readAt) continue;
      const parsed = new Date(readAt);
      if (Number.isNaN(parsed.getTime())) continue;
      result[normalizedWaId] = parsed.toISOString();
    }
    return result;
  }

  private normalizePinnedMap(value: any): Record<string, boolean> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, boolean> = {};
    for (const [waId, pinned] of Object.entries(value)) {
      const normalizedWaId = normalizePhoneDigits(String(waId || ''));
      if (!normalizedWaId) continue;
      if (pinned) result[normalizedWaId] = true;
    }
    return result;
  }

  private normalizeMutedUntilMap(value: any): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [waId, mutedUntilRaw] of Object.entries(value)) {
      const normalizedWaId = normalizePhoneDigits(String(waId || ''));
      if (!normalizedWaId) continue;
      const mutedUntil = String(mutedUntilRaw || '').trim();
      if (!mutedUntil) continue;
      const parsed = new Date(mutedUntil);
      if (Number.isNaN(parsed.getTime())) continue;
      result[normalizedWaId] = parsed.toISOString();
    }
    return result;
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
    const workspaceResolvedCreds = this.getCredentials(this.getIntegrationCredentials(workspaceIntegration || undefined), false);
    const hasAccessToken = !!(workspaceResolvedCreds.accessToken || envAccessToken);
    const hasPhoneNumberId = !!(workspaceResolvedCreds.phoneNumberId || envPhoneId);

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
    if (!integration) throw new BadRequestException('WhatsApp integration not found');
    const normalizedFilter = this.normalizeCampaignFilter(campaign.filter || {});

    const newCampaign = {
      id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: campaign.name,
      templateName: campaign.templateName,
      language: campaign.language,
      filter: normalizedFilter,
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
    filter: CampaignFilter,
  ): Promise<{ count: number; sample: Array<{ id: string; name: string; phone: string }> }> {
    const normalizedFilter = this.normalizeCampaignFilter(filter || {});
    const directRecipients = normalizedFilter.recipients || [];
    if (directRecipients.length > 0) {
      return {
        count: directRecipients.length,
        sample: directRecipients.slice(0, 10).map((recipient, index) => ({
          id: `manual_${index + 1}`,
          name: `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || 'Direct recipient',
          phone: recipient.phone,
        })),
      };
    }

    const where: any = { workspaceId };
    const selectedIds = normalizedFilter.selectedContactIds || [];
    if (normalizedFilter.status?.length) where.status = In(normalizedFilter.status);
    if (normalizedFilter.source?.length) where.source = In(normalizedFilter.source);
    if (selectedIds.length) where.id = In(selectedIds);

    let contacts = await this.contactRepository.find({ where, take: 1000 });
    if (normalizedFilter.tags?.length) {
      contacts = contacts.filter(c => {
        const contactTags = c.tags || [];
        return normalizedFilter.tags!.every(t => contactTags.includes(t));
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
    if (!integration) throw new BadRequestException('WhatsApp integration not found');

    const campaigns: any[] = integration.config?.campaigns || [];
    const campaign = campaigns.find((c: any) => c.id === campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === 'sent') throw new BadRequestException('Campaign already sent');

    campaign.status = 'sending';
    await this.integrationRepository.save(integration);

    try {
      const results = await this.broadcastTemplate(
        workspaceId,
        campaign.filter || {},
        { name: campaign.templateName, language: campaign.language },
        { campaignId: campaign.id, campaignName: campaign.name },
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
    } catch (err: any) {
      campaign.status = 'failed';
      campaign.results = { error: this.getErrorMessage(err) };
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
    const integrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    return this.chooseDefaultWorkspaceIntegration(integrations) || integrations[0] || null;
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
  /** Defensive validation for step.timeoutBranch — the editor validates interactively too. */
  private validateFlowTimeoutBranches(flows: any[]): void {
    const UNITS = new Set(['minutes', 'hours', 'days']);
    for (const flow of flows) {
      const stepIds = new Set((flow.steps || []).map((s: any) => s.id));
      for (const step of flow.steps || []) {
        const branch = step.timeoutBranch;
        if (!branch) continue;
        if (!UNITS.has(branch.delayUnit)) {
          throw new BadRequestException(`Step "${step.id}": timeoutBranch.delayUnit must be minutes, hours, or days`);
        }
        const value = Number(branch.delayValue);
        if (!Number.isFinite(value) || value <= 0) {
          throw new BadRequestException(`Step "${step.id}": timeoutBranch.delayValue must be a positive number`);
        }
        const unitMs = branch.delayUnit === 'days' ? 86400000 : branch.delayUnit === 'hours' ? 3600000 : 60000;
        if (value * unitMs > WhatsAppService.MAX_FOLLOWUP_DELAY_MS) {
          throw new BadRequestException(`Step "${step.id}": follow-up delay cannot exceed 7 days`);
        }
        if (!branch.nextStepId || !stepIds.has(branch.nextStepId)) {
          throw new BadRequestException(`Step "${step.id}": timeoutBranch.nextStepId "${branch.nextStepId}" is not a step in this flow`);
        }
      }
    }
  }

  async saveFlows(workspaceId: string, flows: any[]): Promise<void> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    this.validateFlowTimeoutBranches(flows);
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
      type?: 'template' | 'interactive' | 'email';
      emailSubject?: string;
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
    variables?: Record<string, string>,
  ): Promise<void> {
    const stepMessage = (step.message || '').trim();
    // Substitute {{tokenName}} placeholders (e.g. {{meetingLink}}) with values
    // carried on the flow instance — set once when a booking reminder arms
    // the flow, read here on every step so it's available on later steps too.
    const resolveVars = (value: string): string =>
      variables ? value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => variables[key] ?? match) : value;
    if (step.type === 'email') {
      const contact = await this.findContactByPhone(workspaceId, waId);
      const email = contact?.email;
      if (!email || email.endsWith('@whatsapp.placeholder.invalid')) {
        this.logger.warn(`Flow step "${step.id}": no real email on file for ${waId}, skipping email step`);
        return;
      }
      const subject = resolveVars(step.emailSubject || '');
      const text = resolveVars(stepMessage);
      await this.emailService.sendEmail({ to: email, subject, text });
      await this.saveOutboundActivity(waId, `[Flow email: ${subject}] ${text}`, 'email', workspaceId, '', undefined);
      this.logger.log(`Flow step "${step.id}" (email) sent to ${email}`);
      return;
    }
    if (step.type === 'template' && step.templateName) {
      // Send approved template (can initiate conversations outside 24h window)
      const components: any[] = [];
      if (step.headerMediaUrl && step.headerMediaType) {
        const mt = step.headerMediaType.toLowerCase();
        components.push({ type: 'header', parameters: [{ type: mt, [mt]: { link: step.headerMediaUrl } }] });
      }
      if (step.templateParams?.length) {
        components.push({ type: 'body', parameters: step.templateParams.map(p => ({ type: 'text', text: resolveVars(p) })) });
      }
      await this.sendMessageWithCredentials(credentials, {
        to: waId,
        type: 'template',
        content: '',
        template: { name: step.templateName, language: step.templateLanguage || 'en_US', parameters: components },
      });
      const btnLabels = step.buttons?.map(b => b.title).join(', ') || '';
      await this.saveOutboundActivity(
        waId,
        `[Flow template: ${step.templateName}]${btnLabels ? ` [${btnLabels}]` : ''}`,
        'template',
        workspaceId,
        '',
        undefined,
        {
          templateName: step.templateName,
          templateLanguage: step.templateLanguage || 'en_US',
          headerMediaType: step.headerMediaType || undefined,
          headerMediaUrl: step.headerMediaUrl || undefined,
        },
      );
    } else if (step.buttons?.length) {
      // Send media first if attached, then interactive buttons
      const hasMedia = (step.mediaUrl || step.mediaId) && step.mediaType;
      const captionText = resolveVars(stepMessage);
      if (hasMedia) {
        const mediaResult = await this.sendMessageWithCredentials(credentials, {
          to: waId,
          type: step.mediaType!,
          content: '',
          media: { url: step.mediaUrl, id: step.mediaId, caption: captionText || undefined },
        });
        const mediaMsgId = mediaResult?.messages?.[0]?.id;
        await this.saveOutboundActivity(
          waId,
          `[${step.mediaType}] ${captionText || step.mediaUrl || 'uploaded media'}`,
          step.mediaType!,
          workspaceId,
          '',
          mediaMsgId,
          {
            mediaId: step.mediaId || undefined,
            mediaUrl: step.mediaUrl || undefined,
            mediaCaption: captionText || undefined,
          },
        );
      }
      const buttons = step.buttons.slice(0, 3).map(b => ({ id: b.id, title: b.title.slice(0, 20) }));
      const prompt = captionText || 'Please choose an option:';
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
      const captionText = resolveVars(stepMessage);
      await this.sendMessageWithCredentials(credentials, {
        to: waId,
        type: step.mediaType,
        content: '',
        media: { url: step.mediaUrl, id: step.mediaId, caption: captionText || undefined },
      });
      await this.saveOutboundActivity(
        waId,
        `[${step.mediaType}] ${captionText || step.mediaUrl || 'uploaded media'}`,
        step.mediaType,
        workspaceId,
        '',
        undefined,
        {
          mediaId: step.mediaId || undefined,
          mediaUrl: step.mediaUrl || undefined,
          mediaCaption: captionText || undefined,
        },
      );
    } else {
      // Send plain text (end of flow)
      const text = resolveVars(stepMessage) || 'Thank you!';
      await this.sendTextMessage(waId, text, credentials);
      await this.saveOutboundActivity(waId, text, 'text', workspaceId, '', undefined);
    }
    this.logger.log(`Flow step "${step.id}" sent to ${waId}`);
  }

  /**
   * Start a conversation flow for a contact
   */
  async startFlow(workspaceId: string, waId: string, flowId: string, integration: Integration, variables?: Record<string, string>): Promise<boolean> {
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
        ...(variables ? { variables } : {}),
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

      await this.sendFlowStep(firstStep, waId, credentials, workspaceId, variables);

      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);

      this.logger.log(`Flow "${flow.name}" started for ${waId} at step ${firstStep.id}`);

      const timeoutMs = this.getTimeoutBranchDelayMs(firstStep);
      if (timeoutMs > 0) {
        await this.armFollowupTimeout(workspaceId, waId, flow.id, firstStep.id, timeoutMs);
      }
      return true;
    } catch (err) {
      this.logger.warn(`Failed to start flow "${flow.name}" for ${waId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Public entry point to arm a flow directly by id, for callers (e.g. the
   * Funnels module) with no inbound WhatsApp message to match against —
   * unlike armAfterAutoSendFlow, this doesn't require a prior auto-send rule.
   */
  async startFlowForWorkspace(
    workspaceId: string,
    waId: string,
    flowId: string,
    variables?: Record<string, string>,
  ): Promise<boolean> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return false;
    return this.startFlow(workspaceId, waId, flowId, integration, variables);
  }

  /**
   * Durably arms a follow-up job that fires `targetStepId` after `delayMs`,
   * as long as the contact is still sitting at `armedStepId` when it fires.
   * Used for funnel steps whose timing is computed from a Funnel's
   * anchorDate (delayMs > 0) or for an immediate manual branch dispatch
   * (delayMs 0) — e.g. a "mark attended" toggle routing to the next step.
   */
  async armFlowStepAt(
    workspaceId: string,
    waId: string,
    flowId: string,
    armedStepId: string,
    targetStepId: string,
    delayMs: number,
  ): Promise<void> {
    await this.followupDispatch.schedule(flowId, waId, workspaceId, armedStepId, Math.max(0, delayMs), targetStepId);
  }

  /**
   * Returns the flow step a contact is currently parked at, per the live
   * engine state (not any external record of it) — the source of truth for
   * "where is this contact right now" is always flowStates[waId], never a
   * DB row that can't track engine-driven advances. Callers outside the
   * engine (e.g. FunnelsService.setAttended) must resolve the current step
   * through this, since their own stored currentStepId can be stale.
   */
  async getFlowState(
    workspaceId: string,
    waId: string,
  ): Promise<{ flowId: string; currentStepId: string } | null> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return null;
    const flowStates = integration.config?.flowStates || {};
    const resolved = this.resolveFlowState(flowStates, waId);
    if (!resolved) return null;
    return { flowId: resolved.state.flowId, currentStepId: resolved.state.currentStepId };
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

  // ── No-reply follow-up (durable, up to 7 days — Bull, not setTimeout) ──

  static readonly MAX_FOLLOWUP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

  private getTimeoutBranchDelayMs(step: any): number {
    const branch = step?.timeoutBranch;
    if (!branch || !branch.nextStepId) return 0;
    const value = Number(branch.delayValue);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const unitMs = branch.delayUnit === 'days' ? 86400000 : branch.delayUnit === 'hours' ? 3600000 : 60000;
    return Math.min(Math.floor(value * unitMs), WhatsAppService.MAX_FOLLOWUP_DELAY_MS);
  }

  /** A step "stays active" (awaiting either a button/keyword reply or a timeout) if it has buttons or a timeoutBranch. */
  private stepStaysActive(step: any): boolean {
    return Boolean(step?.buttons?.length) || Boolean(step?.timeoutBranch);
  }

  private async armFollowupTimeout(workspaceId: string, waId: string, flowId: string, stepId: string, delayMs: number): Promise<void> {
    try {
      await this.followupDispatch.schedule(flowId, waId, workspaceId, stepId, delayMs);
    } catch (err: any) {
      this.logger.warn(`Could not arm follow-up timeout for ${waId}: ${err?.message}`);
    }
  }

  /**
   * Fired by WhatsAppFollowupProcessor when a step's timeoutBranch delay elapses.
   * Re-checks the contact is still sitting at the step that armed this job —
   * if they replied/moved on since, this is a stale job and no-ops.
   */
  async handleFollowupTimeout(workspaceId: string, waId: string, flowId: string, armedStepId: string, targetStepId?: string): Promise<void> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return;

    const flowStates = integration.config?.flowStates || {};
    const resolved = this.resolveFlowState(flowStates, waId);
    if (!resolved) return; // flow already ended
    const { stateKey, state } = resolved;
    if (state.flowId !== flowId || state.currentStepId !== armedStepId) return; // stale — contact moved on

    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === flowId && f.enabled);
    const armedStep = flow?.steps?.find((s: any) => s.id === armedStepId);
    const resolvedTargetId = targetStepId || armedStep?.timeoutBranch?.nextStepId;
    const nextStep = flow?.steps?.find((s: any) => s.id === resolvedTargetId);
    if (!flow || !nextStep) {
      delete flowStates[stateKey];
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);
      return;
    }

    try {
      await this.sendFlowStep(nextStep, waId, integration.credentials || {}, workspaceId, state.variables);

      const nowIso = new Date().toISOString();
      if (this.stepStaysActive(nextStep)) {
        const nextState = { ...state, currentStepId: nextStep.id, lastInteractionAt: nowIso, armedAfterAutoSend: false };
        delete nextState.pendingDelay;
        flowStates[waId] = nextState;
        if (stateKey !== waId) delete flowStates[stateKey];
      } else {
        delete flowStates[stateKey];
        if (stateKey !== waId) delete flowStates[waId];
      }
      integration.config = { ...(integration.config || {}), flowStates };
      await this.integrationRepository.save(integration);

      const chainDelay = this.getTimeoutBranchDelayMs(nextStep);
      if (chainDelay > 0) {
        await this.armFollowupTimeout(workspaceId, waId, flowId, nextStep.id, chainDelay);
      }
      this.logger.log(`Flow "${flow.name}": no-reply follow-up sent to ${waId} → step "${nextStep.id}"`);
    } catch (err: any) {
      this.logger.warn(`Follow-up step send failed for ${waId}: ${this.getErrorMessage(err)}`);
    }
  }

  /**
   * `autoSendRuleId` scopes which flow arms: a flow with `autoSendRuleId` set
   * only arms when that specific Auto-Send rule fired (not any auto-send in
   * the workspace); a flow with it unset arms for every auto-send, same as
   * before. This is how a workspace with multiple Auto-Send rules (e.g. one
   * per contact source) keeps a follow-up flow from catching contacts it
   * wasn't meant for.
   */
  private async armAfterAutoSendFlow(workspaceId: string, waId: string, integration: Integration, autoSendRuleId?: string): Promise<void> {
    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) =>
      f.enabled && f.trigger === 'after_auto_send' && f.steps?.length > 0 &&
      (!f.autoSendRuleId || f.autoSendRuleId === autoSendRuleId));
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

    const timeoutMs = this.getTimeoutBranchDelayMs(firstStep);
    if (timeoutMs > 0) {
      await this.armFollowupTimeout(workspaceId, waId, flow.id, firstStep.id, timeoutMs);
    }
  }

  /**
   * Start the workspace's "before_meeting" flow for a booking reminder.
   * `variables` (e.g. { meetingLink }) resolve {{tokenName}} placeholders in
   * every step of this flow instance, including ones reached later via a
   * button reply or a timeoutBranch follow-up.
   * Returns false (no-op) if no such flow is enabled — the feature is optional.
   */
  async startMeetingReminderFlow(workspaceId: string, waId: string, variables: Record<string, string>): Promise<boolean> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return false;
    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.enabled && f.trigger === 'before_meeting' && f.steps?.length > 0);
    if (!flow) return false;
    return this.startFlow(workspaceId, waId, flow.id, integration, variables);
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

        await this.sendFlowStep(nextStep, waId, integration.credentials || {}, workspaceId, state.variables);

        if (this.stepStaysActive(nextStep)) {
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

        const chainDelay = this.getTimeoutBranchDelayMs(nextStep);
        if (chainDelay > 0) {
          await this.armFollowupTimeout(workspaceId, waId, flowId, nextStep.id, chainDelay);
        }
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

      await this.sendFlowStep(nextStep, waId, credentials, workspaceId, state.variables);

      // Update flow state
      if (this.stepStaysActive(nextStep)) {
        // More steps to go (or awaiting a no-reply timeout)
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

      const chainDelay = this.getTimeoutBranchDelayMs(nextStep);
      if (chainDelay > 0) {
        await this.armFollowupTimeout(workspaceId, waId, flow.id, nextStep.id, chainDelay);
      } else {
        // Contact engaged with this step — any earlier pending follow-up for this flow is moot.
        await this.followupDispatch.cancel(flow.id, waId).catch(() => undefined);
      }
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

      await this.sendFlowStep(nextStep, waId, credentials, workspaceId, state.variables);
      if (this.stepStaysActive(nextStep)) {
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

      const chainDelay = this.getTimeoutBranchDelayMs(nextStep);
      if (chainDelay > 0) {
        await this.armFollowupTimeout(workspaceId, waId, flow.id, nextStep.id, chainDelay);
      } else {
        await this.followupDispatch.cancel(flow.id, waId).catch(() => undefined);
      }
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

        // A step with a no-reply timeout expects a classifiable reply (button
        // or matched keyword) or a timeout — an unmatched reply is neither.
        // Default: stop the automated sequence and let a human take over.
        const flows2: any[] = integration.config?.conversationFlows || [];
        const flow2 = flows2.find((f: any) => f.id === state.flowId);
        const currentStep2 = flow2?.steps?.find((s: any) => s.id === state.currentStepId);
        if (currentStep2?.timeoutBranch) {
          delete flowStates[stateKey];
          integration.config = { ...(integration.config || {}), flowStates };
          await this.integrationRepository.save(integration);
          await this.followupDispatch.cancel(state.flowId, waId).catch(() => undefined);
          this.logger.log(`Flow: unmatched reply for ${waId} at step "${state.currentStepId}" — stopping the follow-up sequence`);
        }
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

  // ─── Meta Embedded Signup ──────────────────────────────────────────────────

  getEmbeddedSignupConfig() {
    const appId = this.configService.get<string>('META_APP_ID') || '';
    const configId = this.configService.get<string>('META_CONFIG_ID') || '';
    return {
      appId,
      configId,
      available: !!(appId),
    };
  }

  async completeEmbeddedSignup(workspaceId: string, userId: string, code: string) {
    const appId = this.configService.get<string>('META_APP_ID');
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    if (!appId || !appSecret) {
      throw new BadRequestException('Meta app credentials not configured on server');
    }

    // 1. Exchange code for short-lived token
    this.logger.log(`[EmbeddedSignup] Exchanging code for token...`);
    let accessToken: string;
    try {
      const tokenRes = await firstValueFrom(
        this.httpService.get('https://graph.facebook.com/v21.0/oauth/access_token', {
          params: {
            client_id: appId,
            client_secret: appSecret,
            code,
          },
        }),
      );
      accessToken = tokenRes.data.access_token;
    } catch (err) {
      this.logger.error(`[EmbeddedSignup] Token exchange failed: ${err.response?.data?.error?.message || err.message}`);
      throw new BadRequestException('Failed to exchange authorization code: ' + (err.response?.data?.error?.message || err.message));
    }

    // 2. Debug token to find WABA ID and shared phone numbers
    this.logger.log(`[EmbeddedSignup] Fetching shared WABA info...`);
    let wabaId: string;
    let phones: Array<{ id: string; display: string }> = [];

    try {
      // Get debug token info
      const debugRes = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/v21.0/debug_token`, {
          params: { input_token: accessToken, access_token: `${appId}|${appSecret}` },
        }),
      );
      const granularScopes = debugRes.data?.data?.granular_scopes || [];
      const waScope = granularScopes.find((s: any) => s.scope === 'whatsapp_business_management');
      const wabaIds = waScope?.target_ids || [];

      if (!wabaIds.length) {
        throw new Error('No WABA shared during signup');
      }
      wabaId = wabaIds[0];

      // Get phone numbers for this WABA
      const phonesRes = await firstValueFrom(
        this.httpService.get(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      const rawPhones = Array.isArray(phonesRes.data?.data) ? phonesRes.data.data : [];
      if (!rawPhones.length) {
        throw new Error('No phone numbers found for this WABA');
      }

      phones = rawPhones
        .map((phone: any) => ({
          id: String(phone?.id || '').trim(),
          display: String(phone?.display_phone_number || phone?.verified_name || phone?.id || '').trim(),
        }))
        .filter((phone: { id: string }) => !!phone.id);
      if (!phones.length) {
        throw new Error('No valid phone numbers found for this WABA');
      }
    } catch (err) {
      this.logger.error(`[EmbeddedSignup] WABA fetch failed: ${err.message}`);
      throw new BadRequestException('Failed to retrieve WhatsApp account info: ' + err.message);
    }

    await this.assertPhoneNumbersAvailableForWorkspace(
      workspaceId,
      phones.map((phone) => phone.id),
    );

    // 3. Subscribe the WABA to our app's webhooks
    try {
      await firstValueFrom(
        this.httpService.post(
          `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
          null,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      this.logger.log(`[EmbeddedSignup] Subscribed WABA ${wabaId} to app webhooks`);
    } catch (err) {
      this.logger.warn(`[EmbeddedSignup] Webhook subscription warning: ${err.message}`);
    }

    // 4. Create/update one integration per phone number so workspaces can use multiple senders
    const existingIntegrations = await this.listWorkspaceWhatsAppIntegrations(workspaceId);
    const integrationsByPhone = new Map<string, Integration>();
    for (const integration of existingIntegrations) {
      const phoneId = this.getCredentials(this.getIntegrationCredentials(integration), false).phoneNumberId;
      if (phoneId) integrationsByPhone.set(phoneId, integration);
    }

    const savedIntegrations: Integration[] = [];
    for (const phone of phones) {
      const existingIntegration = integrationsByPhone.get(phone.id);
      const nextCredentials = {
        ...(existingIntegration?.credentials || {}),
        accessToken,
        access_token: accessToken,
        phoneNumberId: phone.id,
        phone_number_id: phone.id,
        wabaId,
        waba_id: wabaId,
      };
      const nextConfig = {
        ...(existingIntegration?.config || {}),
        wabaId,
        phoneNumberId: phone.id,
        phoneDisplay: phone.display || phone.id,
        embeddedSignup: true,
        embeddedSignupAt: new Date().toISOString(),
      };

      const integration = existingIntegration
        ? Object.assign(existingIntegration, {
            status: IntegrationStatus.ACTIVE,
            name: existingIntegration.name || `WhatsApp (${phone.display || phone.id})`,
            credentials: nextCredentials,
            config: nextConfig,
          })
        : this.integrationRepository.create({
            workspaceId,
            userId,
            type: IntegrationType.WHATSAPP,
            name: `WhatsApp (${phone.display || phone.id})`,
            status: IntegrationStatus.ACTIVE,
            credentials: nextCredentials,
            config: nextConfig,
          });

      const saved = await this.integrationRepository.save(integration);
      savedIntegrations.push(saved);
    }

    const primaryPhone = phones[0];
    const primaryIntegration =
      savedIntegrations.find((integration) => this.getCredentials(this.getIntegrationCredentials(integration), false).phoneNumberId === primaryPhone.id)
      || savedIntegrations[0];

    this.logger.log(
      `[EmbeddedSignup] Workspace ${workspaceId} synced ${savedIntegrations.length} WhatsApp number(s) for WABA ${wabaId}`,
    );

    return {
      success: true,
      integrationId: primaryIntegration?.id,
      wabaId,
      phoneNumberId: primaryPhone.id,
      phoneDisplay: primaryPhone.display,
      integrations: savedIntegrations.map((integration) => {
        const sender = this.getIntegrationSenderInfo(integration);
        return {
          id: integration.id,
          name: integration.name,
          status: integration.status,
          phoneNumberId: sender.senderPhoneNumberId || null,
          phoneDisplay: sender.senderPhoneDisplay || null,
        };
      }),
    };
  }
}
