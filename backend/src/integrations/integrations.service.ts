import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Integration, IntegrationType, IntegrationStatus, IntegrationAuthType, IntegrationWebhook, IntegrationLog } from '../database/entities/integration.entity';
import { CreateIntegrationDto, UpdateIntegrationDto, InstallIntegrationDto } from './dto/integration.dto';
import { IntegrationRegistry } from './registry/integration.registry';
import { OAuthService } from './auth/oauth.service';
import { WebhookService } from './webhook/webhook.service';
import { SyncService } from './sync/sync.service';

export interface IntegrationEvent {
  type: string;
  integrationId: string;
  workspaceId: string;
  data: any;
  timestamp: Date;
}

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    @InjectRepository(IntegrationWebhook)
    private webhookRepository: Repository<IntegrationWebhook>,
    @InjectRepository(IntegrationLog)
    private logRepository: Repository<IntegrationLog>,
    private eventEmitter: EventEmitter2,
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private integrationRegistry: IntegrationRegistry,
    private oauthService: OAuthService,
    private webhookService: WebhookService,
    private syncService: SyncService,
    private httpService: HttpService,
  ) { }

  /**
   * Restore sync schedules on server startup (lost after restart/deploy)
   */
  async onModuleInit(): Promise<void> {
    try {
      const integrations = await this.integrationRepository.find({
        where: { status: IntegrationStatus.ACTIVE },
      });
      let restored = 0;
      for (const integration of integrations) {
        if (integration.config?.syncFrequency && integration.config.syncFrequency !== 'manual') {
          await this.setupSyncSchedule(integration);
          restored++;
        }
      }
      if (restored > 0) {
        this.logger.log(`Restored ${restored} integration sync schedule(s) after startup`);
      }
    } catch (err) {
      this.logger.error(`Failed to restore sync schedules on startup: ${err.message}`);
    }
  }

  /**
   * Get all available integration types
   */
  async getAvailableIntegrations(): Promise<any[]> {
    return this.integrationRegistry.getAvailableIntegrations();
  }

  /**
   * Get integration by type metadata
   */
  async getIntegrationMetadata(type: IntegrationType): Promise<any> {
    return this.integrationRegistry.getIntegrationMetadata(type);
  }

  /**
   * Get all integrations for a workspace
   */
  async findAll(workspaceId: string, filters?: {
    type?: IntegrationType;
    status?: IntegrationStatus;
    isEnabled?: boolean;
  }): Promise<Integration[]> {
    const where: FindOptionsWhere<Integration> = { workspaceId };

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;
    if (filters?.isEnabled !== undefined) where.isEnabled = filters.isEnabled;

    return this.integrationRepository.find({
      where,
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get integration by ID
   */
  async findOne(id: string, workspaceId: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId },
      relations: ['user', 'webhooks', 'logs'],
    });

    if (!integration) {
      throw new NotFoundException(`Integration with ID ${id} not found`);
    }

    return integration;
  }

  /**
   * Install a new integration
   */
  async install(workspaceId: string, userId: string, dto: InstallIntegrationDto): Promise<Integration> {
    // Meta system-user tokens are ~210 chars and routinely pick up stray
    // whitespace/newlines on copy-paste, which makes Graph reject them with
    // "Cannot parse access token". Strip all whitespace before storing.
    if (dto.type === IntegrationType.WHATSAPP && dto.credentials?.accessToken) {
      dto.credentials.accessToken = String(dto.credentials.accessToken).replace(/\s+/g, '');
    }

    const providerKey = String(dto.config?.provider || dto.externalId || '')
      .trim()
      .toLowerCase();
    const allowsMultipleSocialAccounts =
      dto.type === IntegrationType.API &&
      dto.authType === IntegrationAuthType.OAUTH2 &&
      ['facebook', 'instagram', 'tiktok'].includes(providerKey);

    // Check if integration already exists
    const existing = allowsMultipleSocialAccounts
      ? null
      : await this.integrationRepository.findOne({
          where: {
            workspaceId,
            type: dto.type,
            externalId: dto.externalId || undefined,
          },
        });

    if (existing) {
      // Update existing integration instead of blocking reconnection
      this.logger.log(`Updating existing ${dto.type} integration ${existing.id}`);
      existing.config = { ...existing.config, ...dto.config };
      existing.credentials = { ...existing.credentials, ...dto.credentials };
      existing.status = IntegrationStatus.PENDING;
      const updated = await this.integrationRepository.save(existing);

      await this.logActivity(updated.id, 'info', 'Integration reconnected', {
        type: dto.type,
        authType: dto.authType,
      });

      this.eventEmitter.emit('integration.installed', {
        type: 'integration.installed',
        integrationId: updated.id,
        workspaceId,
        data: updated,
        timestamp: new Date(),
      } as IntegrationEvent);

      return updated;
    }

    // Get integration metadata
    const metadata = await this.getIntegrationMetadata(dto.type);
    if (!metadata) {
      const supportedTypes = ['Slack', 'Gmail', 'Microsoft 365', 'Salesforce', 'HubSpot', 'Zoom', 'Typeform'];
      throw new BadRequestException(
        `Sorry, ${dto.type} integration is not yet available. ` +
        `Available integrations: ${supportedTypes.join(', ')}`
      );
    }

    // Check if handler exists
    const handler = this.integrationRegistry.getIntegrationHandler(dto.type);
    if (!handler) {
      throw new BadRequestException(
        `${metadata.name} integration is coming soon! ` +
        `We're still building the connection. Please check back later or contact support.`
      );
    }

    // Create integration
    const integration = this.integrationRepository.create({
      workspaceId,
      userId,
      type: dto.type,
      name: dto.name || metadata.name,
      description: dto.description || metadata.description,
      authType: dto.authType || metadata.defaultAuthType,
      externalId: dto.externalId,
      config: {
        ...metadata.defaultConfig,
        ...dto.config,
      },
      credentials: dto.credentials || {},
      metadata: {
        ...metadata,
        ...dto.metadata,
      },
      permissions: dto.permissions || metadata.defaultPermissions,
      status: IntegrationStatus.PENDING,
    });

    const saved = await this.integrationRepository.save(integration);

    // Log installation
    await this.logActivity(saved.id, 'info', 'Integration installed', {
      type: dto.type,
      authType: dto.authType,
    });

    // Emit installation event
    this.eventEmitter.emit('integration.installed', {
      type: 'integration.installed',
      integrationId: saved.id,
      workspaceId,
      data: saved,
      timestamp: new Date(),
    } as IntegrationEvent);

    return saved;
  }

  /**
   * Configure an integration
   */
  async configure(id: string, workspaceId: string, dto: UpdateIntegrationDto): Promise<Integration> {
    const integration = await this.findOne(id, workspaceId);

    // Update integration
    Object.assign(integration, {
      name: dto.name ?? integration.name,
      description: dto.description ?? integration.description,
      config: { ...integration.config, ...dto.config },
      credentials: { ...integration.credentials, ...dto.credentials },
      permissions: dto.permissions ?? integration.permissions,
      isEnabled: dto.isEnabled ?? integration.isEnabled,
    });

    const updated = await this.integrationRepository.save(integration);

    // Log configuration change
    await this.logActivity(id, 'info', 'Integration configured', {
      changes: dto,
    });

    // Emit configuration event
    this.eventEmitter.emit('integration.configured', {
      type: 'integration.configured',
      integrationId: id,
      workspaceId,
      data: updated,
      timestamp: new Date(),
    } as IntegrationEvent);

    return updated;
  }

  /**
   * Authenticate an integration
   */
  async authenticate(id: string, workspaceId: string, authData: any): Promise<Integration> {
    const integration = await this.findOne(id, workspaceId);

    try {
      let credentials: any;

      switch (integration.authType) {
        case IntegrationAuthType.OAUTH2: {
          this.logger.log(`[${id}] Starting OAuth2 token exchange with code: ${authData.code?.substring(0, 10)}...`);
          credentials = await this.oauthService.exchangeCodeForTokens(integration, authData.code);

          // Validate that we received access token
          this.logger.log(`[${id}] OAuth2 token exchange result - Access Token: ${!!credentials.accessToken}, Refresh Token: ${!!credentials.refreshToken}`);

          if (!credentials.accessToken) {
            throw new BadRequestException('OAuth provider did not return an access token');
          }

          const oauthProvider = String(integration.config?.provider || integration.externalId || '').toLowerCase().trim();
          const allowsAccessTokenOnly =
            integration.type === IntegrationType.GOOGLE ||
            (integration.type === IntegrationType.API && ['facebook', 'instagram', 'tiktok'].includes(oauthProvider));

          // For Google and API social OAuth providers, refresh token is optional.
          // For other providers, refresh token is usually required for long-term access.
          if (!credentials.refreshToken) {
            if (allowsAccessTokenOnly) {
              this.logger.warn(
                `[${id}] OAuth provider did not return a refresh token for ${oauthProvider || integration.type}. ` +
                'Integration may require periodic reconnect.'
              );

              if (!integration.config) {
                integration.config = {};
              }
              integration.config.warning =
                'No refresh token available. Access may expire and require reconnect.';
            } else {
              this.logger.warn(`[${id}] OAuth provider did not return a refresh token. Integration may fail when access token expires.`);
              throw new BadRequestException(
                'OAuth provider did not return a refresh token. ' +
                'This usually happens when the app was previously authorized. ' +
                'Please revoke access in your account settings and try again, or wait a few minutes before reconnecting.'
              );
            }
          } else {
            // Clear any previous warnings if we got a refresh token
            if (integration.config?.warning) {
              delete integration.config.warning;
            }
          }

          break;
        }
        case IntegrationAuthType.API_KEY:
          credentials = { apiKey: authData.apiKey, apiSecret: authData.apiSecret };
          break;
        case IntegrationAuthType.BASIC_AUTH:
          credentials = { username: authData.username, password: authData.password };
          break;
        case IntegrationAuthType.JWT:
          credentials = { token: authData.token };
          break;
        default:
          throw new BadRequestException(`Authentication type ${integration.authType} not supported`);
      }

      // Update integration with credentials
      integration.credentials = credentials;
      integration.status = IntegrationStatus.ACTIVE;
      integration.clearErrors();
      integration.lastActivityAt = new Date();

      if (credentials.expiresAt) {
        integration.expiresAt = new Date(credentials.expiresAt);
      }

      this.logger.log(`[${id}] Saving integration with valid credentials`);
      let updated = await this.integrationRepository.save(integration);

      if (integration.type === IntegrationType.API) {
        updated = await this.materializeSocialOAuthAccounts(updated);
        await this.ensureSocialWebhookSubscriptions(updated);
      }

      // Test connection (but don't let it change status if we just authenticated successfully)
      this.logger.log(`[${updated.id}] Testing connection after authentication`);
      const testResult = await this.testConnection(updated.id, workspaceId);
      
      // If test failed but we have access token for Google, keep it ACTIVE
      // (refresh token warning is not fatal)
      if (!testResult.success && integration.type === IntegrationType.GOOGLE && credentials.accessToken) {
        const isRefreshTokenWarning = testResult.message?.includes('refresh token') || 
                                     testResult.message?.includes('No refresh token');
        if (isRefreshTokenWarning) {
          this.logger.log(`[${updated.id}] Keeping integration ACTIVE despite refresh token warning - access token is valid`);
          updated.status = IntegrationStatus.ACTIVE;
          await this.integrationRepository.save(updated);
        }
      }

      // Set up sync schedule if enabled
      if (updated.config?.autoSync) {
        await this.setupSyncSchedule(updated);
      }

      // Log authentication
      await this.logActivity(updated.id, 'info', 'Integration authenticated successfully');

      // Emit authentication event
      this.eventEmitter.emit('integration.authenticated', {
        type: 'integration.authenticated',
        integrationId: updated.id,
        workspaceId,
        data: updated,
        timestamp: new Date(),
      } as IntegrationEvent);

      return updated;
    } catch (error) {
      integration.recordError(error.message);
      await this.integrationRepository.save(integration);

      await this.logActivity(id, 'error', 'Authentication failed', {
        error: error.message,
      });

      throw error;
    }
  }

  private async materializeSocialOAuthAccounts(integration: Integration): Promise<Integration> {
    const providerKey = String(integration.config?.provider || integration.externalId || '')
      .trim()
      .toLowerCase();

    if (providerKey === 'facebook') {
      return this.materializeFacebookPageAccounts(integration);
    }

    if (providerKey === 'instagram') {
      return this.materializeInstagramPageAccounts(integration);
    }

    return integration;
  }

  private async ensureSocialWebhookSubscriptions(integration: Integration): Promise<void> {
    const providerKey = String(integration.config?.provider || integration.externalId || '')
      .trim()
      .toLowerCase();

    try {
      if (providerKey === 'facebook') {
        await this.ensureFacebookWebhookSubscriptions(integration.workspaceId);
        return;
      }

      if (providerKey === 'instagram') {
        await this.ensureInstagramWebhookSubscriptions(integration.workspaceId);
      }
    } catch (error: any) {
      this.logger.warn(
        `[${integration.id}] Failed to auto-subscribe social webhooks: ${error?.message || 'unknown error'}`,
      );
    }
  }

  private async ensureFacebookWebhookSubscriptions(workspaceId: string): Promise<void> {
    const rows = await this.integrationRepository.find({
      where: { workspaceId, type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    const facebookRows = rows.filter((row) => {
      const provider = String(row.config?.provider || row.externalId || '').trim().toLowerCase();
      return provider === 'facebook';
    });

    for (const row of facebookRows) {
      const pageId = String(row.config?.pageId || '').trim();
      const pageAccessToken =
        String(row.credentials?.pageAccessToken || '').trim()
        || String(row.credentials?.accessToken || '').trim();

      if (!pageId || !pageAccessToken) continue;

      try {
        await this.httpService.axiosRef.post(
          `https://graph.facebook.com/v23.0/${pageId}/subscribed_apps`,
          null,
          {
            params: {
              subscribed_fields: 'messages,messaging_feedback',
              access_token: pageAccessToken,
            },
            timeout: 15000,
          },
        );

        row.config = {
          ...(row.config || {}),
          webhookSubscribedAt: new Date().toISOString(),
        };
        await this.integrationRepository.save(row);
      } catch (error: any) {
        this.logger.warn(
          `[${row.id}] Facebook page webhook auto-subscribe failed for page ${pageId}: ${error?.response?.data?.error?.message || error?.message || 'unknown error'}`,
        );
      }
    }
  }

  private async ensureInstagramWebhookSubscriptions(workspaceId: string): Promise<void> {
    const rows = await this.integrationRepository.find({
      where: { workspaceId, type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    const instagramRows = rows.filter((row) => {
      const provider = String(row.config?.provider || row.externalId || '').trim().toLowerCase();
      return provider === 'instagram';
    });

    for (const row of instagramRows) {
      const igUserId = String(row.config?.igUserId || '').trim();
      const userAccessToken = String(row.credentials?.accessToken || '').trim();

      if (!igUserId || !userAccessToken) continue;

      try {
        await this.httpService.axiosRef.post(
          `https://graph.instagram.com/v23.0/${igUserId}/subscribed_apps`,
          null,
          {
            params: {
              subscribed_fields: 'messages',
              access_token: userAccessToken,
            },
            timeout: 15000,
          },
        );

        row.config = {
          ...(row.config || {}),
          webhookSubscribedAt: new Date().toISOString(),
        };
        await this.integrationRepository.save(row);
      } catch (error: any) {
        this.logger.warn(
          `[${row.id}] Instagram webhook auto-subscribe failed for IG user ${igUserId}: ${error?.response?.data?.error?.message || error?.message || 'unknown error'}`,
        );
      }
    }
  }

  private async materializeFacebookPageAccounts(integration: Integration): Promise<Integration> {
    const userAccessToken = String(integration.credentials?.accessToken || '').trim();
    if (!userAccessToken) {
      return integration;
    }

    const response = await this.httpService.axiosRef.get('https://graph.facebook.com/v23.0/me/accounts', {
      params: {
        fields: 'id,name,access_token',
        access_token: userAccessToken,
      },
      timeout: 15000,
    });

    const pages = (Array.isArray(response.data?.data) ? response.data.data : [])
      .filter((page: any) => String(page?.id || '').trim() && String(page?.access_token || '').trim());

    if (!pages.length) {
      return integration;
    }

    const existingRows = await this.integrationRepository.find({
      where: { workspaceId: integration.workspaceId, type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    const siblingRows = existingRows.filter((row) => {
      if (row.id === integration.id) return false;
      const provider = String(row.config?.provider || row.externalId || '').trim().toLowerCase();
      return provider === 'facebook';
    });

    const currentPageId = String(integration.config?.pageId || '').trim();
    const currentPage =
      (currentPageId && pages.find((page: any) => String(page.id) === currentPageId))
      || pages[0];

    let primary = integration;

    for (const page of pages) {
      const pageId = String(page.id).trim();
      const pageName = String(page.name || integration.name || 'Facebook Page').trim();
      const pageAccessToken = String(page.access_token).trim();

      const isCurrentTarget = String(currentPage?.id || '') === pageId;
      const existing = siblingRows.find((row) => String(row.config?.pageId || '').trim() === pageId);
      const target = isCurrentTarget
        ? integration
        : existing || this.integrationRepository.create({
            workspaceId: integration.workspaceId,
            userId: integration.userId,
            type: IntegrationType.API,
            name: pageName,
            description: integration.description,
            authType: IntegrationAuthType.OAUTH2,
            externalId: 'facebook',
            config: {},
            credentials: {},
            metadata: integration.metadata,
            permissions: integration.permissions,
            status: IntegrationStatus.ACTIVE,
            isEnabled: integration.isEnabled,
            isVerified: integration.isVerified,
          });

      target.name = pageName;
      target.status = IntegrationStatus.ACTIVE;
      target.lastActivityAt = new Date();
      target.config = {
        ...(target.config || {}),
        ...(integration.config || {}),
        provider: 'facebook',
        pageId,
        pageName,
      };
      target.credentials = {
        ...(target.credentials || {}),
        ...(integration.credentials || {}),
        pageAccessToken,
      };
      target.clearErrors();

      const saved = await this.integrationRepository.save(target);
      if (isCurrentTarget) {
        primary = saved;
      }
    }

    return primary;
  }

  private async materializeInstagramPageAccounts(integration: Integration): Promise<Integration> {
    const userAccessToken = String(integration.credentials?.accessToken || '').trim();
    if (!userAccessToken) {
      return integration;
    }

    const response = await this.httpService.axiosRef.get('https://graph.facebook.com/v23.0/me/accounts', {
      params: {
        fields: 'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}',
        access_token: userAccessToken,
      },
      timeout: 15000,
    });

    const rows = (Array.isArray(response.data?.data) ? response.data.data : [])
      .map((page: any) => {
        const igAccount = page?.instagram_business_account || page?.connected_instagram_account;
        return {
          pageId: String(page?.id || '').trim(),
          pageName: String(page?.name || '').trim(),
          pageAccessToken: String(page?.access_token || '').trim(),
          igUserId: String(igAccount?.id || '').trim(),
          igUsername: String(igAccount?.username || '').trim(),
        };
      })
      .filter((item: any) => item.pageId && item.pageAccessToken && item.igUserId);

    if (!rows.length) {
      return integration;
    }

    const existingRows = await this.integrationRepository.find({
      where: { workspaceId: integration.workspaceId, type: IntegrationType.API },
      order: { createdAt: 'ASC' },
    });

    const siblingRows = existingRows.filter((row) => {
      if (row.id === integration.id) return false;
      const provider = String(row.config?.provider || row.externalId || '').trim().toLowerCase();
      return provider === 'instagram';
    });

    const currentIgUserId = String(integration.config?.igUserId || '').trim();
    const currentRow =
      (currentIgUserId && rows.find((item) => item.igUserId === currentIgUserId))
      || rows[0];

    let primary = integration;

    for (const item of rows) {
      const accountName = item.igUsername
        ? `@${item.igUsername.replace(/^@+/, '')}`
        : (item.pageName || integration.name || 'Instagram');
      const isCurrentTarget = currentRow.igUserId === item.igUserId;
      const existing = siblingRows.find((row) => String(row.config?.igUserId || '').trim() === item.igUserId);
      const target = isCurrentTarget
        ? integration
        : existing || this.integrationRepository.create({
            workspaceId: integration.workspaceId,
            userId: integration.userId,
            type: IntegrationType.API,
            name: accountName,
            description: integration.description,
            authType: IntegrationAuthType.OAUTH2,
            externalId: 'instagram',
            config: {},
            credentials: {},
            metadata: integration.metadata,
            permissions: integration.permissions,
            status: IntegrationStatus.ACTIVE,
            isEnabled: integration.isEnabled,
            isVerified: integration.isVerified,
          });

      target.name = accountName;
      target.status = IntegrationStatus.ACTIVE;
      target.lastActivityAt = new Date();
      target.config = {
        ...(target.config || {}),
        ...(integration.config || {}),
        provider: 'instagram',
        pageId: item.pageId,
        pageName: item.pageName || 'Facebook Page',
        igUserId: item.igUserId,
        igUsername: item.igUsername || accountName,
      };
      target.credentials = {
        ...(target.credentials || {}),
        ...(integration.credentials || {}),
        pageAccessToken: item.pageAccessToken,
      };
      target.clearErrors();

      const saved = await this.integrationRepository.save(target);
      if (isCurrentTarget) {
        primary = saved;
      }
    }

    return primary;
  }

  /**
   * Test integration connection
   */
  async testConnection(id: string, workspaceId: string): Promise<{ success: boolean; message?: string; data?: any }> {
    const integration = await this.findOne(id, workspaceId);

    try {
      const handler = this.integrationRegistry.getIntegrationHandler(integration.type);
      if (!handler) {
        throw new Error(`No handler found for integration type ${integration.type}`);
      }

      const result = await handler.testConnection(integration);

      if (result.success) {
        integration.activate();
        await this.integrationRepository.save(integration);

        await this.logActivity(id, 'info', 'Connection test successful', result.data);
      } else {
        // For Google, if error is about missing refresh token but we have access token,
        // don't mark as ERROR - just keep current status and log warning
        const isGoogle = integration.type === IntegrationType.GOOGLE;
        const isRefreshTokenError = result.message?.includes('refresh token') || result.message?.includes('No refresh token');
        const hasAccessToken = !!integration.credentials?.accessToken;

        if (isGoogle && isRefreshTokenError && hasAccessToken) {
          // Don't mark as ERROR - access token might still work
          // Just log warning and keep current status
          this.logger.warn(`[${id}] Connection test warning: ${result.message}. Access token may still work until expiration.`);
          await this.logActivity(id, 'warn', 'Connection test warning', {
            message: result.message,
            data: result.data,
          });
        } else {
          // For other errors or if no access token, mark as error
          integration.recordError(result.message || 'Connection test failed');
          await this.integrationRepository.save(integration);

          await this.logActivity(id, 'error', 'Connection test failed', {
            message: result.message,
            data: result.data,
          });
        }
      }

      return result;
    } catch (error) {
      // Similar logic for exceptions
      const isGoogle = integration.type === IntegrationType.GOOGLE;
      const isRefreshTokenError = error.message?.includes('refresh token') || error.message?.includes('No refresh token');
      const hasAccessToken = !!integration.credentials?.accessToken;

      if (isGoogle && isRefreshTokenError && hasAccessToken) {
        this.logger.warn(`[${id}] Connection test warning: ${error.message}. Access token may still work until expiration.`);
        await this.logActivity(id, 'warn', 'Connection test warning', {
          error: error.message,
        });
        return { success: false, message: error.message };
      }

      integration.recordError(error.message);
      await this.integrationRepository.save(integration);

      await this.logActivity(id, 'error', 'Connection test error', {
        error: error.message,
      });

      return { success: false, message: error.message };
    }
  }

  /**
   * Sync integration data
   */
  async syncData(id: string, workspaceId: string, options?: {
    direction?: 'inbound' | 'outbound' | 'bidirectional';
    entities?: string[];
    force?: boolean;
  }): Promise<any> {
    const integration = await this.findOne(id, workspaceId);

    const hasAccessToken = !!integration.credentials?.accessToken;
    const hasApiCredentials = !!(
      integration.credentials?.apiKey ||
      integration.credentials?.apiToken ||
      integration.credentials?.token ||
      integration.config?.apiKey ||
      integration.config?.apiToken
    );
    const providerKey = String(integration.config?.provider || integration.externalId || '').toLowerCase().trim();
    const webhookFirstProviders = new Set(['esemneaza', 'payfunnels', 'payfunnel']);
    const isWebhookFirstProvider = integration.type === IntegrationType.API && webhookFirstProviders.has(providerKey);

    // OAuth integrations require access token; API/Webhook style integrations can sync with API key/webhook-only mode.
    if (integration.authType === IntegrationAuthType.OAUTH2 && !hasAccessToken) {
      throw new BadRequestException('Integration is not authenticated. Please connect this integration first.');
    }
    if (
      integration.authType !== IntegrationAuthType.OAUTH2 &&
      !hasAccessToken &&
      !hasApiCredentials &&
      !isWebhookFirstProvider
    ) {
      throw new BadRequestException('Integration credentials are missing. Please connect this integration first.');
    }

    // For Google, allow sync even if expired if we have access token (it might still work)
    // For other providers, check expiry
    const isGoogle = integration.type === IntegrationType.GOOGLE;
    const allowExpired = isGoogle && hasAccessToken;

    // Relaxed check: Allow sync if active and not expired, even if error count is high
    // For Google, also allow if status is PENDING but we have access token
    // For webhook-first providers (payfunnel etc.), allow sync even in ERROR state — they don't have credentials to fail
    const canSync = integration.status === IntegrationStatus.ACTIVE ||
                   (isGoogle && integration.status === IntegrationStatus.PENDING && hasAccessToken) ||
                   (isWebhookFirstProvider && integration.status !== IntegrationStatus.DISABLED) ||
                   options?.force;

    if (!canSync) {
      throw new BadRequestException(
        `Integration is not active (Status: ${integration.status}). ` +
        (options?.force ? 'Use force=true to sync anyway.' : 'Enable it to sync or use force=true.')
      );
    }

    if (integration.isExpired && !allowExpired && !options?.force) {
      throw new BadRequestException(
        'Integration credentials have expired. Please reconnect. ' +
        (isGoogle ? 'Or use force=true to sync anyway (may work if token is still valid).' : '')
      );
    }

    try {
      const syncResult = await this.syncService.syncIntegration(integration, options);

      // Update last sync information
      integration.updateSync({
        timestamp: new Date(),
        status: syncResult.success ? 'success' : 'error',
        recordsProcessed: syncResult.recordsProcessed,
        recordsCreated: syncResult.recordsCreated,
        recordsUpdated: syncResult.recordsUpdated,
        recordsSkipped: syncResult.recordsSkipped,
        errors: syncResult.errors,
        nextSync: syncResult.nextSync,
      });

      // If sync was successful, clear any previous errors to restore health
      if (syncResult.success) {
        integration.clearErrors();
        // Restore ACTIVE status for webhook-first providers that may have been in ERROR
        if (isWebhookFirstProvider && integration.status === IntegrationStatus.ERROR) {
          integration.status = IntegrationStatus.ACTIVE;
        }
      }

      await this.integrationRepository.save(integration);

      await this.logActivity(id, syncResult.success ? 'info' : 'warn', 'Data sync completed', {
        ...syncResult,
        duration: syncResult.duration,
      });

      // Emit sync event
      this.eventEmitter.emit('integration.synced', {
        type: 'integration.synced',
        integrationId: id,
        workspaceId,
        data: syncResult,
        timestamp: new Date(),
      } as IntegrationEvent);

      return syncResult;
    } catch (error) {
      integration.recordError(error.message);
      integration.updateSync({
        timestamp: new Date(),
        status: 'error',
        errors: [error.message],
      });

      await this.integrationRepository.save(integration);
      await this.logActivity(id, 'error', 'Data sync failed', { error: error.message });

      throw error;
    }
  }

  /**
   * Enable/disable integration
   */
  async toggleEnabled(id: string, workspaceId: string, enabled: boolean): Promise<Integration> {
    const integration = await this.findOne(id, workspaceId);

    integration.isEnabled = enabled;

    if (enabled && integration.status === IntegrationStatus.DISABLED) {
      integration.status = IntegrationStatus.ACTIVE;
    } else if (!enabled) {
      integration.status = IntegrationStatus.DISABLED;
    }

    const updated = await this.integrationRepository.save(integration);

    await this.logActivity(id, 'info', `Integration ${enabled ? 'enabled' : 'disabled'}`);

    // Handle sync schedule
    if (enabled && integration.config?.autoSync) {
      await this.setupSyncSchedule(integration);
    } else {
      await this.removeSyncSchedule(integration.id);
    }

    return updated;
  }

  /**
   * Delete integration
   */
  async remove(id: string, workspaceId: string): Promise<void> {
    const integration = await this.findOne(id, workspaceId);

    // Remove sync schedule
    await this.removeSyncSchedule(id);

    // Revoke OAuth tokens if applicable
    if (integration.authType === IntegrationAuthType.OAUTH2) {
      try {
        await this.oauthService.revokeTokens(integration);
      } catch (error) {
        this.logger.warn(`Failed to revoke OAuth tokens for integration ${id}: ${error.message}`);
      }
    }

    // Delete webhooks and logs (cascaded by database)
    await this.integrationRepository.remove(integration);

    // Emit deletion event
    this.eventEmitter.emit('integration.removed', {
      type: 'integration.removed',
      integrationId: id,
      workspaceId,
      data: integration,
      timestamp: new Date(),
    } as IntegrationEvent);
  }

  /**
   * Get integration logs
   */
  async getLogs(id: string, workspaceId: string, options?: {
    level?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: IntegrationLog[]; total: number }> {
    const integration = await this.findOne(id, workspaceId);

    const whereClause: any = { integrationId: id };
    if (options?.level) {
      whereClause.level = options.level;
    }

    const [logs, total] = await this.logRepository.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      take: options?.limit || 100,
      skip: options?.offset || 0,
    });

    return { logs, total };
  }

  /**
   * Log integration activity
   */
  async logActivity(
    integrationId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: any,
    action?: string,
    duration?: number,
  ): Promise<void> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId },
      select: ['workspaceId'],
    });

    if (!integration) return;

    const log = this.logRepository.create({
      integrationId,
      workspaceId: integration.workspaceId,
      level,
      message,
      data,
      action,
      duration,
    });

    await this.logRepository.save(log);

    // Also log to application logger
    this.logger.log(`[${integrationId}] ${message}`, data);
  }

  /**
   * Set up automatic sync schedule for integration
   */
  private async setupSyncSchedule(integration: Integration): Promise<void> {
    const jobName = `sync-${integration.id}`;

    // Remove existing job if it exists
    await this.removeSyncSchedule(integration.id);

    if (!integration.config?.syncFrequency || integration.config.syncFrequency === 'manual') {
      return;
    }

    const cronPattern = this.getSyncCronPattern(integration.config.syncFrequency);
    if (!cronPattern) return;

    const job = new CronJob(cronPattern, async () => {
      try {
        // Re-fetch to get current status — integration may have changed since job was registered
        const current = await this.integrationRepository.findOne({ where: { id: integration.id } });
        if (!current) {
          this.logger.warn(`Scheduled sync: integration ${integration.id} no longer exists, skipping`);
          return;
        }
        if (current.status !== IntegrationStatus.ACTIVE) {
          this.logger.warn(`Scheduled sync: integration ${integration.id} is ${current.status}, skipping`);
          return;
        }
        await this.syncData(integration.id, integration.workspaceId, { force: false });
      } catch (error) {
        this.logger.error(`Scheduled sync failed for integration ${integration.id}:`, error);
      }
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  /**
   * Remove sync schedule for integration
   */
  private async removeSyncSchedule(integrationId: string): Promise<void> {
    const jobName = `sync-${integrationId}`;

    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch (error) {
      // Job doesn't exist, ignore
    }
  }

  /**
   * Convert sync frequency to cron pattern
   */
  private getSyncCronPattern(frequency: string): string | null {
    const patterns = {
      hourly: '0 * * * *',
      daily: '0 2 * * *',
      weekly: '0 2 * * 0',
    };

    return patterns[frequency] || null;
  }

  /**
   * Get integration analytics
   */
  async getAnalytics(workspaceId: string, period: 'day' | 'week' | 'month' = 'week'): Promise<any> {
    // Implementation for integration analytics
    // This would include sync statistics, error rates, usage metrics, etc.

    const integrations = await this.findAll(workspaceId);

    return {
      totalIntegrations: integrations.length,
      activeIntegrations: integrations.filter(i => i.status === IntegrationStatus.ACTIVE).length,
      healthyIntegrations: integrations.filter(i => i.isHealthy).length,
      integrationsByType: integrations.reduce((acc, integration) => {
        acc[integration.type] = (acc[integration.type] || 0) + 1;
        return acc;
      }, {}),
      averageHealthScore: integrations.reduce((sum, i) => sum + i.getHealthScore(), 0) / integrations.length || 0,
    };
  }
}
