import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
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
    // Check if integration already exists
    const existing = await this.integrationRepository.findOne({
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
        case IntegrationAuthType.OAUTH2:
          this.logger.log(`[${id}] Starting OAuth2 token exchange with code: ${authData.code?.substring(0, 10)}...`);
          credentials = await this.oauthService.exchangeCodeForTokens(integration, authData.code);

          // Validate that we received access token
          this.logger.log(`[${id}] OAuth2 token exchange result - Access Token: ${!!credentials.accessToken}, Refresh Token: ${!!credentials.refreshToken}`);

          if (!credentials.accessToken) {
            throw new BadRequestException('OAuth provider did not return an access token');
          }

          // For Google, refresh token is optional - it may not be returned if user already authorized
          // For other providers, refresh token is usually required for long-term access
          if (!credentials.refreshToken) {
            if (integration.type === IntegrationType.GOOGLE) {
              // Google can work without refresh token, but token will expire and user needs to reconnect
              this.logger.warn(`[${id}] Google OAuth did not return a refresh token. Access token will expire in ~1 hour. User may need to reconnect.`);
              
              // Add a warning note to the integration config
              if (!integration.config) {
                integration.config = {};
              }
              integration.config.warning = 'No refresh token available. Access token will expire in ~1 hour. Please reconnect to get a refresh token for long-term access.';
              
              // Continue without throwing error - integration will work until token expires
            } else {
              // For other providers, refresh token is critical
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
      const updated = await this.integrationRepository.save(integration);

      // Test connection (but don't let it change status if we just authenticated successfully)
      this.logger.log(`[${id}] Testing connection after authentication`);
      const testResult = await this.testConnection(id, workspaceId);
      
      // If test failed but we have access token for Google, keep it ACTIVE
      // (refresh token warning is not fatal)
      if (!testResult.success && integration.type === IntegrationType.GOOGLE && credentials.accessToken) {
        const isRefreshTokenWarning = testResult.message?.includes('refresh token') || 
                                     testResult.message?.includes('No refresh token');
        if (isRefreshTokenWarning) {
          this.logger.log(`[${id}] Keeping integration ACTIVE despite refresh token warning - access token is valid`);
          integration.status = IntegrationStatus.ACTIVE;
          await this.integrationRepository.save(integration);
        }
      }

      // Set up sync schedule if enabled
      if (integration.config?.autoSync) {
        await this.setupSyncSchedule(integration);
      }

      // Log authentication
      await this.logActivity(id, 'info', 'Integration authenticated successfully');

      // Emit authentication event
      this.eventEmitter.emit('integration.authenticated', {
        type: 'integration.authenticated',
        integrationId: id,
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
