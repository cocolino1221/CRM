import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Public } from '../common/decorators/public.decorator';
import { IntegrationsService } from './integrations.service';
import { IntegrationRegistry } from './registry/integration.registry';
import { OAuthService } from './auth/oauth.service';
import { WebhookService } from './webhook/webhook.service';
import { ConfigService } from '@nestjs/config';
import { ContactsService } from '../contacts/contacts.service';
import { QueueService } from '../queues/queue.service';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { DocumentsService } from '../documents/documents.service';
import { CreateIntegrationDto, UpdateIntegrationDto, InstallIntegrationDto } from './dto/integration.dto';
import { Integration, IntegrationType, IntegrationStatus, IntegrationAuthType } from '../database/entities/integration.entity';
import { TypeformIntegrationHandler } from './handlers/typeform.handler';

@ApiTags('Integrations')
@Controller('integrations')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly integrationRegistry: IntegrationRegistry,
    private readonly oauthService: OAuthService,
    private readonly webhookService: WebhookService,
    private readonly configService: ConfigService,
    private readonly contactsService: ContactsService,
    private readonly queueService: QueueService,
    private readonly documentsService: DocumentsService,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly typeformHandler: TypeformIntegrationHandler,
  ) {}

  @Get('available')
  @ApiOperation({ summary: 'Get all available integration types with handler status' })
  @ApiResponse({ status: 200, description: 'List of available integrations with working handlers only' })
  async getAvailableIntegrations() {
    const integrations = await this.integrationsService.getAvailableIntegrations();

    // Filter to only return integrations with handlers (actually working)
    const availableIntegrations = integrations
      .map((integration) => {
        const handler = this.integrationRegistry.getIntegrationHandler(integration.type);
        return {
          ...integration,
          isAvailable: !!handler,
          hasHandler: !!handler,
        };
      })
      .filter(i => i.hasHandler); // Only return working integrations

    return {
      integrations: availableIntegrations,
      total: availableIntegrations.length,
    };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search available integrations' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchIntegrations(@Query('q') query: string) {
    return {
      results: this.integrationRegistry.searchIntegrations(query),
    };
  }

  @Get('metadata/:type')
  @ApiOperation({ summary: 'Get integration metadata by type' })
  @ApiResponse({ status: 200, description: 'Integration metadata' })
  async getIntegrationMetadata(@Param('type') type: IntegrationType) {
    const metadata = await this.integrationsService.getIntegrationMetadata(type);
    return { metadata };
  }

  @Get()
  @ApiOperation({ summary: 'Get all workspace integrations' })
  @ApiResponse({ status: 200, description: 'List of workspace integrations' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: IntegrationType,
    @Query('status') status?: IntegrationStatus,
    @Query('enabled') enabled?: boolean,
  ): Promise<{ integrations: any[]; analytics: any }> {
    const workspaceId = req.user.workspaceId;

    const integrations = await this.integrationsService.findAll(workspaceId, {
      type,
      status,
      isEnabled: enabled,
    });

    // Add capabilities to each integration
    const integrationsWithCapabilities = integrations.map(integration => {
      const handler = this.integrationRegistry.getIntegrationHandler(integration.type);
      return {
        ...integration,
        capabilities: {
          supportsSync: !!handler?.syncData,
          supportsWebhooks: !!handler?.handleWebhook,
          supportsTestConnection: !!handler?.testConnection,
        },
      };
    });

    const analytics = await this.integrationsService.getAnalytics(workspaceId);

    return { integrations: integrationsWithCapabilities, analytics };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  @ApiResponse({ status: 200, description: 'Integration details' })
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<{ integration: Integration; capabilities?: any }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    // Check handler capabilities
    const handler = this.integrationRegistry.getIntegrationHandler(integration.type);
    const capabilities = {
      supportsSync: !!handler?.syncData,
      supportsWebhooks: !!handler?.handleWebhook,
      supportsTestConnection: !!handler?.testConnection,
    };

    return { integration, capabilities };
  }

  @Post('install')
  @ApiOperation({ summary: 'Install a new integration' })
  @ApiResponse({ status: 201, description: 'Integration installed successfully' })
  async install(
    @Req() req: AuthenticatedRequest,
    @Body() dto: any,
  ): Promise<{ integration: Integration; authUrl?: string; webhookUrl?: string }> {
    const normalizedDto = this.normalizeInstallDto(dto);

    const integration = await this.integrationsService.install(
      req.user.workspaceId,
      req.user.id,
      normalizedDto,
    );

    let authUrl: string | undefined;
    let webhookUrl: string | undefined;

    // Generate OAuth URL if needed
    if (integration.authType === 'oauth2') {
      authUrl = this.oauthService.generateAuthUrl(integration);
    }

    // Generate webhook URL for integrations that support webhooks
    const appUrl = this.configService.get('APP_URL') || 'http://localhost:3000';
    webhookUrl = `${appUrl}/api/v1/integrations/webhooks/${integration.id}`;

    // Webhook-only integrations (ManyChat, Calendly, etc.) should always be activated
    // because the webhook receiver works independently of an API key connection test.
    const webhookOnlyTypes: string[] = [IntegrationType.MANYCHAT, IntegrationType.CALENDLY];
    const webhookFirstApiProviders = new Set(['esemneaza', 'payfunnels', 'payfunnel']);
    const providerKey = String(integration.config?.provider || integration.externalId || '').trim().toLowerCase();
    const isWebhookFirstApiProvider =
      integration.type === IntegrationType.API && webhookFirstApiProviders.has(providerKey);

    if (webhookOnlyTypes.includes(integration.type as any) || isWebhookFirstApiProvider) {
      integration.status = IntegrationStatus.ACTIVE;
      await this.integrationRepository.save(integration);
      this.logger.log(
        `Webhook-first integration ${integration.id} (${integration.type}${providerKey ? `/${providerKey}` : ''}) auto-activated`,
      );
    }

    // For API key integrations, auto-test connection and activate if valid
    if (
      normalizedDto.authType === IntegrationAuthType.API_KEY &&
      normalizedDto.credentials &&
      Object.keys(normalizedDto.credentials).length > 0 &&
      !isWebhookFirstApiProvider
    ) {
      try {
        const testResult = await this.integrationsService.testConnection(integration.id, req.user.workspaceId);
        if (testResult.success) {
          this.logger.log(`API key integration ${integration.id} activated after successful test`);

          // For Typeform, auto-register webhook if formId is provided
          if (integration.type === IntegrationType.TYPEFORM && integration.config?.formId) {
            try {
              const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.TYPEFORM) as any;
              const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken;
              if (handler?.createWebhook && apiKey) {
                await handler.createWebhook(integration.config.formId, webhookUrl, 'slackcrm', apiKey);
                this.logger.log(`Typeform webhook registered for form ${integration.config.formId}`);
              }
            } catch (webhookError) {
              this.logger.warn(`Failed to auto-register Typeform webhook: ${webhookError.message}`);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`API key integration ${integration.id} test failed: ${error.message}`);
      }
    }

    return { integration, authUrl, webhookUrl };
  }

  private normalizeInstallDto(rawDto: any): InstallIntegrationDto {
    const rawType = String(rawDto?.type || '').trim().toLowerCase();
    const knownTypeValues = new Set<string>(Object.values(IntegrationType));
    const knownAuthValues = new Set<string>(Object.values(IntegrationAuthType));

    let normalizedType: IntegrationType;
    let externalId = rawDto?.externalId ? String(rawDto.externalId).trim().toLowerCase() : undefined;
    const config = { ...(rawDto?.config || {}) };

    if (knownTypeValues.has(rawType)) {
      normalizedType = rawType as IntegrationType;
    } else {
      // Backward compatibility for frontend cards that send provider slugs (e.g. "payfunnels")
      // instead of enum values. Route them through the Custom API integration.
      normalizedType = IntegrationType.API;
      externalId = externalId || rawType;
      if (!config.provider) {
        config.provider = externalId;
      }
    }

    if (normalizedType === IntegrationType.API) {
      const provider = String(config.provider || externalId || '').toLowerCase().trim();
      if (provider && !externalId) {
        externalId = provider;
      }
      if (!config.provider && provider) {
        config.provider = provider;
      }
      if (config.apiUrl && !config.baseUrl) {
        config.baseUrl = config.apiUrl;
      }
    }

    const rawAuthType = String(rawDto?.authType || '').trim().toLowerCase();
    const normalizedAuthType: IntegrationAuthType =
      (knownAuthValues.has(rawAuthType) ? rawAuthType : IntegrationAuthType.API_KEY) as IntegrationAuthType;

    return {
      ...rawDto,
      type: normalizedType,
      authType: normalizedAuthType,
      externalId,
      config,
      credentials: rawDto?.credentials || {},
      metadata: rawDto?.metadata || {},
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update integration configuration' })
  @ApiResponse({ status: 200, description: 'Integration updated successfully' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationDto,
  ): Promise<{ integration: Integration }> {
    const integration = await this.integrationsService.configure(id, req.user.workspaceId, dto);
    return { integration };
  }

  @Post(':id/authenticate')
  @ApiOperation({ summary: 'Authenticate integration with credentials' })
  @ApiResponse({ status: 200, description: 'Integration authenticated successfully' })
  async authenticate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() authData: any,
  ): Promise<{ integration: Integration; success: boolean }> {
    const integration = await this.integrationsService.authenticate(id, req.user.workspaceId, authData);
    return { integration, success: true };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test integration connection' })
  @ApiResponse({ status: 200, description: 'Connection test results' })
  async testConnection(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.integrationsService.testConnection(id, req.user.workspaceId);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger data sync for integration' })
  @ApiResponse({ status: 200, description: 'Sync initiated successfully' })
  async sync(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() options?: {
      direction?: 'inbound' | 'outbound' | 'bidirectional';
      entities?: string[];
      force?: boolean;
    },
  ): Promise<{ result: any }> {
    const result = await this.integrationsService.syncData(id, req.user.workspaceId, options);
    return { result };
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Enable or disable integration' })
  @ApiResponse({ status: 200, description: 'Integration status updated' })
  async toggle(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ): Promise<{ integration: Integration }> {
    const integration = await this.integrationsService.toggleEnabled(
      id,
      req.user.workspaceId,
      body.enabled,
    );
    return { integration };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove integration' })
  @ApiResponse({ status: 204, description: 'Integration removed successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.integrationsService.remove(id, req.user.workspaceId);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get integration logs' })
  @ApiResponse({ status: 200, description: 'Integration logs' })
  async getLogs(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('level') level?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ logs: any[]; total: number }> {
    return this.integrationsService.getLogs(id, req.user.workspaceId, {
      level,
      limit,
      offset,
    });
  }

  @Get('analytics/overview')
  @ApiOperation({ summary: 'Get integrations analytics' })
  @ApiResponse({ status: 200, description: 'Integration analytics' })
  async getAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: 'day' | 'week' | 'month',
  ): Promise<{ analytics: any }> {
    const analytics = await this.integrationsService.getAnalytics(req.user.workspaceId, period);
    return { analytics };
  }

  // OAuth Endpoints - Public (no authentication required)
  // IMPORTANT: Specific routes must come BEFORE parameterized routes
  @Public()
  @Get('oauth/callback')
  @ApiOperation({ summary: 'Handle OAuth callback' })
  @ApiResponse({ status: 302, description: 'OAuth callback handled' })
  async handleOAuthCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://etcrm.primafisoft.com';

    if (error) {
      this.logger.error(`OAuth error: ${error}`);
      res.redirect(`${frontendUrl}/integrations/callback?error=${encodeURIComponent(error)}`);
      return;
    }

    try {
      const stateData = this.oauthService.validateState(state);

      const integration = await this.integrationRepository.findOne({
        where: { id: stateData.integrationId },
      });

      if (!integration) {
        throw new Error('Integration not found');
      }

      if (integration.workspaceId !== stateData.workspaceId) {
        throw new Error('Integration workspace mismatch');
      }

      await this.integrationsService.authenticate(integration.id, integration.workspaceId, { code });

      res.redirect(`${frontendUrl}/integrations/callback?success=1&integration=${integration.id}&name=${encodeURIComponent(integration.name)}`);
    } catch (err) {
      this.logger.error(`OAuth callback failed:`, err);
      res.redirect(`${frontendUrl}/integrations/callback?error=${encodeURIComponent(err.message)}`);
    }
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start OAuth authorization flow' })
  @ApiResponse({ status: 302, description: 'Redirect to OAuth provider' })
  async startOAuth(
    @Req() req: any,
    @Res() res: Response,
    @Param('provider') provider: string,
    @Query('integration_id') integrationId?: string,
    @Query('workspace_id') workspaceId?: string,
    @Query('user_id') userId?: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://etcrm.primafisoft.com';

    try {
      this.logger.log(`OAuth request received - Provider: ${provider}, WorkspaceId: ${workspaceId}, UserId: ${userId}`);

      const normalizedProvider = provider.toLowerCase().trim();
      const socialApiProviders = new Set(['facebook', 'instagram', 'tiktok']);

      // Map provider name to IntegrationType
      const typeMap: Record<string, IntegrationType> = {
        'google': IntegrationType.GOOGLE,
        'gmail': IntegrationType.GOOGLE, // Alias for Google
        'google-workspace': IntegrationType.GOOGLE, // Alias for Google
        'slack': IntegrationType.SLACK,
        'microsoft': IntegrationType.MICROSOFT,
        'microsoft-365': IntegrationType.MICROSOFT, // Alias for Microsoft
        'salesforce': IntegrationType.SALESFORCE,
        'hubspot': IntegrationType.HUBSPOT,
        'zoom': IntegrationType.ZOOM,
        'docusign': IntegrationType.DOCUSIGN,
        'calendly': IntegrationType.CALENDLY,
        'facebook': IntegrationType.API,
        'instagram': IntegrationType.API,
        'tiktok': IntegrationType.API,
      };

      const type = typeMap[normalizedProvider];
      if (!type) {
        this.logger.error(`Unsupported OAuth provider: ${provider} (lowercase: ${normalizedProvider})`);
        res.redirect(`${frontendUrl}/integrations/callback?error=${encodeURIComponent('Unsupported OAuth provider')}`);
        return;
      }

      // Require workspace_id and user_id for public OAuth flow
      if (!workspaceId || !userId) {
        res.redirect(`${frontendUrl}/integrations/callback?error=${encodeURIComponent('Missing workspace_id or user_id')}`);
        return;
      }

      let integration: Integration;

      if (integrationId) {
        const existingIntegration = await this.integrationsService.findOne(integrationId, workspaceId);

        // If an old/stale integration id is passed for another provider/type,
        // create a fresh OAuth integration instead of mutating the wrong one.
        if (existingIntegration.type !== type) {
          integration = await this.integrationsService.install(workspaceId, userId, {
            type,
            authType: IntegrationAuthType.OAUTH2,
            externalId: type === IntegrationType.API && socialApiProviders.has(normalizedProvider)
              ? normalizedProvider
              : undefined,
            config: type === IntegrationType.API && socialApiProviders.has(normalizedProvider)
              ? { provider: normalizedProvider }
              : undefined,
          });
        } else {
          integration = existingIntegration;

          // Keep provider metadata in sync for API-based OAuth providers
          if (type === IntegrationType.API && socialApiProviders.has(normalizedProvider)) {
            integration.externalId = normalizedProvider;
            integration.config = {
              ...(integration.config || {}),
              provider: normalizedProvider,
            };
            await this.integrationRepository.save(integration);
          }
        }
      } else {
        // Create temporary integration for OAuth flow
        integration = await this.integrationsService.install(workspaceId, userId, {
          type,
          authType: IntegrationAuthType.OAUTH2,
          externalId: type === IntegrationType.API && socialApiProviders.has(normalizedProvider)
            ? normalizedProvider
            : undefined,
          config: type === IntegrationType.API && socialApiProviders.has(normalizedProvider)
            ? { provider: normalizedProvider }
            : undefined,
        });
      }

      const authUrl = this.oauthService.generateAuthUrl(integration);
      res.redirect(authUrl);
    } catch (error) {
      this.logger.error(`OAuth start failed:`, error);
      res.redirect(`${frontendUrl}/integrations/callback?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Webhook Endpoints
  @Get(':id/webhooks')
  @ApiOperation({ summary: 'Get integration webhooks' })
  @ApiResponse({ status: 200, description: 'List of webhooks' })
  async getWebhooks(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.webhookService.getWebhooks(id, req.user.workspaceId);
  }

  @Post(':id/webhooks')
  @ApiOperation({ summary: 'Create webhook for integration' })
  @ApiResponse({ status: 201, description: 'Webhook created successfully' })
  async createWebhook(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() webhookData: {
      url: string;
      event: string;
      secret?: string;
      headers?: Record<string, string>;
    },
  ) {
    return this.webhookService.createWebhook(id, req.user.workspaceId, webhookData);
  }

  @Delete(':id/webhooks/:webhookId')
  @ApiOperation({ summary: 'Delete webhook' })
  @ApiResponse({ status: 204, description: 'Webhook deleted successfully' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('webhookId') webhookId: string,
  ): Promise<void> {
    await this.webhookService.deleteWebhook(webhookId, req.user.workspaceId);
  }

  // Public webhook endpoint (no auth required)
  @Public()
  @Post('webhooks/:integrationId')
  @ApiOperation({ summary: 'Receive webhook payload' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async receiveWebhook(
    @Param('integrationId') integrationId: string,
    @Body() payload: any,
    @Req() req: any,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const integration = await this.integrationRepository.findOne({
        where: { id: integrationId },
      });

      const providerKey = String(
        integration?.config?.provider || integration?.externalId || '',
      ).trim().toLowerCase();

      // Route webhook-first API providers to DocumentsService domain logic
      // so contract/payment state and notifications are updated correctly.
      if (integration?.type === IntegrationType.API && (providerKey === 'payfunnels' || providerKey === 'payfunnel')) {
        const result = await this.documentsService.processPayfunnelWebhook(
          integrationId,
          payload,
          req.headers as Record<string, string | string[] | undefined>,
        );
        return { success: result.success, message: result.message };
      }

      if (integration?.type === IntegrationType.API && providerKey === 'esemneaza') {
        const result = await this.documentsService.processEsemneazaWebhook(
          integrationId,
          payload,
          req.headers as Record<string, string | string[] | undefined>,
        );
        return { success: result.success, message: result.message };
      }

      const result = await this.webhookService.processWebhook(integrationId, payload, {
        headers: req.headers as Record<string, string>,
        method: req.method,
        url: req.url,
      });

      return { success: true, message: result.message };
    } catch (error) {
      this.logger.error(`Webhook processing failed:`, error);
      return { success: false, message: error.message };
    }
  }

  // Integration Management Endpoints
  @Post('bulk-install')
  @ApiOperation({ summary: 'Install multiple integrations' })
  @ApiResponse({ status: 200, description: 'Bulk installation results' })
  async bulkInstall(
    @Req() req: AuthenticatedRequest,
    @Body() body: { integrations: InstallIntegrationDto[] },
  ): Promise<{ results: any[] }> {
    const results = [];

    for (const integrationDto of body.integrations) {
      try {
        const integration = await this.integrationsService.install(
          req.user.workspaceId,
          req.user.id,
          integrationDto,
        );
        results.push({ success: true, integration });
      } catch (error) {
        results.push({ success: false, error: error.message, type: integrationDto.type });
      }
    }

    return { results };
  }

  @Post('bulk-sync')
  @ApiOperation({ summary: 'Sync multiple integrations' })
  @ApiResponse({ status: 200, description: 'Bulk sync results' })
  async bulkSync(
    @Req() req: AuthenticatedRequest,
    @Body() body: { integrationIds: string[]; options?: any },
  ): Promise<{ results: any[] }> {
    const results = [];

    for (const integrationId of body.integrationIds) {
      try {
        const result = await this.integrationsService.syncData(
          integrationId,
          req.user.workspaceId,
          body.options,
        );
        results.push({ success: true, integrationId, result });
      } catch (error) {
        results.push({ success: false, integrationId, error: error.message });
      }
    }

    return { results };
  }

  @Get('health/check')
  @ApiOperation({ summary: 'Check health of all integrations' })
  @ApiResponse({ status: 200, description: 'Integration health status' })
  async checkHealth(@Req() req: AuthenticatedRequest): Promise<{ health: any[] }> {
    const integrations = await this.integrationsService.findAll(req.user.workspaceId);

    const health = await Promise.all(
      integrations.map(async (integration) => {
        try {
          const testResult = await this.integrationsService.testConnection(
            integration.id,
            req.user.workspaceId,
          );

          return {
            integrationId: integration.id,
            type: integration.type,
            name: integration.name,
            status: integration.status,
            isHealthy: integration.isHealthy,
            healthScore: integration.getHealthScore(),
            lastActivity: integration.lastActivityAt,
            connectionTest: testResult,
          };
        } catch (error) {
          return {
            integrationId: integration.id,
            type: integration.type,
            name: integration.name,
            status: integration.status,
            isHealthy: false,
            healthScore: 0,
            error: error.message,
          };
        }
      }),
    );

    return { health };
  }

  // WhatsApp-specific endpoints
  @Post(':id/whatsapp/import-groups')
  @ApiOperation({ summary: 'Import contacts from WhatsApp groups' })
  @ApiResponse({ status: 200, description: 'Contacts imported successfully from WhatsApp groups' })
  async importWhatsAppGroupContacts(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { groupIds: string[] },
  ): Promise<{ totalImported: number; groups: any[] }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.WHATSAPP) {
      throw new Error('This endpoint is only for WhatsApp integrations');
    }

    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.WHATSAPP);
    if (!handler || !('importFromGroups' in handler)) {
      throw new Error('WhatsApp handler not found or does not support group imports');
    }

    return await (handler as any).importFromGroups(integration, body.groupIds);
  }

  @Get(':id/whatsapp/groups')
  @ApiOperation({ summary: 'List available WhatsApp groups' })
  @ApiResponse({ status: 200, description: 'List of WhatsApp groups' })
  async getWhatsAppGroups(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ groups: any[] }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.WHATSAPP) {
      throw new Error('This endpoint is only for WhatsApp integrations');
    }

    // Sync groups using the WhatsApp handler
    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.WHATSAPP);
    if (!handler || !('syncGroupContacts' in handler)) {
      throw new Error('WhatsApp handler not found or does not support group sync');
    }

    const accessToken = integration.credentials?.accessToken;
    if (!accessToken) {
      throw new Error('WhatsApp access token not found');
    }

    const result = await (handler as any).syncGroupContacts(integration, accessToken);

    return { groups: result.records || [] };
  }

  // Google Sheets-specific endpoints
  @Get(':id/google/sheets')
  @ApiOperation({ summary: 'List available Google Sheets' })
  @ApiResponse({ status: 200, description: 'List of Google Sheets' })
  async listGoogleSheets(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ sheets: any[] }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.GOOGLE) {
      throw new Error('This endpoint is only for Google integrations');
    }

    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.GOOGLE);
    if (!handler || !('listSheets' in handler)) {
      throw new Error('Google handler not found or does not support sheets listing');
    }

    const sheets = await (handler as any).listSheets(integration);

    return { sheets };
  }

  @Get(':id/google/sheets/:sheetId')
  @ApiOperation({ summary: 'Get Google Sheet data with preview' })
  @ApiResponse({ status: 200, description: 'Sheet data retrieved' })
  async getGoogleSheetData(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
    @Query('range') range?: string,
  ): Promise<{ data: any; metadata: any }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.GOOGLE) {
      throw new Error('This endpoint is only for Google integrations');
    }

    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.GOOGLE);
    if (!handler || !('getSheetData' in handler) || !('getSpreadsheetMetadata' in handler)) {
      throw new Error('Google handler not found or does not support sheet operations');
    }

    const [data, metadata] = await Promise.all([
      (handler as any).getSheetData(integration, sheetId, range),
      (handler as any).getSpreadsheetMetadata(integration, sheetId),
    ]);

    return { data, metadata };
  }

  @Post(':id/google/sheets/:sheetId/check-duplicates')
  @ApiOperation({ summary: 'Check for duplicate contacts before importing from Google Sheet' })
  @ApiResponse({ status: 200, description: 'Duplicate check results' })
  async checkGoogleSheetDuplicates(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
    @Body() body: {
      range?: string;
      mapping: Record<string, string>;
      skipFirstRow?: boolean;
    },
  ): Promise<{
    contacts: Array<{
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      isDuplicate: boolean;
      existingContact?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone?: string;
        status: string;
        createdAt: Date;
      };
    }>;
    totalContacts: number;
    duplicateCount: number;
    newCount: number;
  }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.GOOGLE) {
      throw new Error('This endpoint is only for Google integrations');
    }

    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.GOOGLE);
    if (!handler || !('getSheetData' in handler)) {
      throw new Error('Google handler not found or does not support sheet operations');
    }

    // Get sheet data
    const sheetData = await (handler as any).getSheetData(integration, sheetId, body.range);
    const rows = sheetData.values || [];
    const startIndex = body.skipFirstRow ? 1 : 0;

    // Parse all contacts from sheet
    const parsedContacts: any[] = [];
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      const contactData: any = { _rowIndex: i + 1 };

      Object.entries(body.mapping).forEach(([column, field]) => {
        const columnIndex = this.getColumnIndex(column);
        if (columnIndex < row.length) {
          contactData[field] = row[columnIndex];
        }
      });

      if (contactData.email) {
        parsedContacts.push(contactData);
      }
    }

    // Bulk check for duplicates in a single DB query
    const emails = parsedContacts.map(c => c.email);
    const existingMap = await this.contactsService.findByEmails(req.user.workspaceId, emails);

    // Build results
    const contacts = parsedContacts.map(contact => {
      const existing = existingMap.get(contact.email.toLowerCase());
      return {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        isDuplicate: !!existing,
        existingContact: existing
          ? {
              id: existing.id,
              email: existing.email,
              firstName: existing.firstName,
              lastName: existing.lastName,
              phone: existing.phone,
              status: existing.status,
              createdAt: existing.createdAt,
            }
          : undefined,
      };
    });

    const duplicateCount = contacts.filter(c => c.isDuplicate).length;
    const newCount = contacts.length - duplicateCount;

    this.logger.log(
      `Duplicate check: ${contacts.length} contacts, ${duplicateCount} duplicates, ${newCount} new`,
    );

    return {
      contacts,
      totalContacts: contacts.length,
      duplicateCount,
      newCount,
    };
  }

  @Post(':id/google/sheets/:sheetId/import')
  @ApiOperation({ summary: 'Import contacts from Google Sheet (async via queue)' })
  @ApiResponse({ status: 200, description: 'Import job queued successfully' })
  async importFromGoogleSheet(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('sheetId') sheetId: string,
    @Body() body: {
      range?: string;
      mapping: Record<string, string>;
      skipFirstRow?: boolean;
      pipelineId?: string;
      pipelineStageId?: string;
      duplicateActions?: Record<string, 'skip' | 'update' | 'create'>;
    },
  ): Promise<{ jobId: string; totalQueued: number; message: string }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);

    if (integration.type !== IntegrationType.GOOGLE) {
      throw new Error('This endpoint is only for Google integrations');
    }

    const handler = this.integrationRegistry.getIntegrationHandler(IntegrationType.GOOGLE);
    if (!handler || !('getSheetData' in handler)) {
      throw new Error('Google handler not found or does not support sheet operations');
    }

    // Get sheet data
    const sheetData = await (handler as any).getSheetData(integration, sheetId, body.range);
    const rows = sheetData.values || [];
    const startIndex = body.skipFirstRow ? 1 : 0;

    // Parse all contacts from sheet
    const contacts: any[] = [];
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      const contactData: any = {
        source: 'google_sheets',
        status: 'lead',
      };

      Object.entries(body.mapping).forEach(([column, field]) => {
        const columnIndex = this.getColumnIndex(column);
        if (columnIndex < row.length) {
          contactData[field] = row[columnIndex];
        }
      });

      if (!contactData.email) continue;

      if (body.pipelineId) contactData.pipelineId = body.pipelineId;
      if (body.pipelineStageId) contactData.pipelineStageId = body.pipelineStageId;

      contacts.push(contactData);
    }

    if (contacts.length === 0) {
      return { jobId: '', totalQueued: 0, message: 'No contacts with valid emails found in the sheet' };
    }

    // Queue the import job
    const job = await this.queueService.importGoogleSheets(
      req.user.workspaceId,
      req.user.id,
      contacts,
      body.duplicateActions || {},
    );

    this.logger.log(`Google Sheets import job ${job.id} queued: ${contacts.length} contacts`);

    return {
      jobId: String(job.id),
      totalQueued: contacts.length,
      message: `Import started. ${contacts.length} contacts queued for processing.`,
    };
  }

  @Get('jobs/:jobId/status')
  @ApiOperation({ summary: 'Get status of an import job' })
  @ApiResponse({ status: 200, description: 'Job status' })
  async getImportJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: any;
    failedReason?: string;
    createdAt: Date;
    finishedAt?: Date;
  } | null> {
    const status = await this.queueService.getJobStatus(QUEUE_NAMES.DATA_SYNC, jobId);
    if (!status) {
      return null;
    }
    return status as any;
  }

  private getColumnIndex(column: string): number {
    // Convert column letter to index (A=0, B=1, etc.)
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index - 1;
  }

  // Workflow templates endpoint
  @Get('workflows/templates')
  @ApiOperation({ summary: 'Get n8n workflow templates' })
  @ApiResponse({ status: 200, description: 'List of workflow templates' })
  async getWorkflowTemplates(@Query('category') category?: string): Promise<any> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const templatesPath = path.join(__dirname, 'templates', 'n8n-workflows.json');
    const templatesData = await fs.readFile(templatesPath, 'utf-8');
    const templates = JSON.parse(templatesData);

    if (category) {
      return {
        workflows: templates.workflows.filter((w: any) => w.category === category),
      };
    }

    return templates;
  }

  // ============ Typeform Multi-Form Management ============

  @Get(':id/typeform/forms')
  @ApiOperation({ summary: 'Get all connected Typeform forms' })
  async getTypeformForms(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId: req.user.workspaceId },
    });
    if (!integration) {
      return { forms: [] };
    }
    const forms = await this.typeformHandler.getConnectedForms(integration);
    return { forms };
  }

  @Post(':id/typeform/forms')
  @ApiOperation({ summary: 'Add a Typeform form to integration' })
  async addTypeformForm(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { formId: string; name?: string; pipelineId?: string; pipelineStageId?: string; whatsApp?: any },
  ) {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId: req.user.workspaceId },
    });
    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    const result = await this.typeformHandler.addForm(integration, body.formId, {
      name: body.name,
      pipelineId: body.pipelineId,
      pipelineStageId: body.pipelineStageId,
      whatsApp: body.whatsApp,
    });

    // Save updated config
    integration.config = {
      ...integration.config,
      typeformForms: result.forms,
    };
    await this.integrationRepository.save(integration);

    return { success: true, form: result.form };
  }

  @Delete(':id/typeform/forms/:formId')
  @ApiOperation({ summary: 'Remove a Typeform form from integration' })
  async removeTypeformForm(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId: req.user.workspaceId },
    });
    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    const forms = await this.typeformHandler.removeForm(integration, formId);

    integration.config = {
      ...integration.config,
      typeformForms: forms,
    };
    await this.integrationRepository.save(integration);

    return { success: true };
  }

  @Patch(':id/typeform/forms/:formId')
  @ApiOperation({ summary: 'Update Typeform form config' })
  async updateTypeformFormConfig(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { name?: string; pipelineId?: string; pipelineStageId?: string; whatsApp?: any; enabled?: boolean },
  ) {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId: req.user.workspaceId },
    });
    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    const forms = this.typeformHandler.updateFormConfig(integration, formId, body);

    integration.config = {
      ...integration.config,
      typeformForms: forms,
    };
    await this.integrationRepository.save(integration);

    return { success: true };
  }

  @Post(':id/typeform/forms/:formId/register-webhook')
  @ApiOperation({ summary: 'Register (or re-register) Typeform webhook for a form' })
  async registerTypeformWebhook(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const integration = await this.integrationRepository.findOne({
      where: { id, workspaceId: req.user.workspaceId },
    });
    if (!integration) {
      return { success: false, message: 'Integration not found' };
    }

    const apiKey =
      integration.credentials?.apiToken ||
      integration.credentials?.apiKey ||
      integration.config?.apiToken ||
      integration.config?.apiKey;
    if (!apiKey) {
      return { success: false, message: 'No API key configured for this integration' };
    }

    const appUrl = integration.config?.backendUrl || this.configService.get<string>('APP_URL') || '';
    if (!appUrl) {
      return { success: false, message: 'APP_URL is not configured on the server' };
    }

    const webhookUrl = `${appUrl}/api/v1/integrations/webhooks/${integration.id}`;
    const tag = `slackcrm_${formId.substring(0, 8)}`;

    try {
      await (this.typeformHandler as any).createWebhook(formId, webhookUrl, tag, apiKey);

      // Mark form as webhookRegistered in the stored config
      const forms: any[] = Array.isArray(integration.config?.typeformForms)
        ? integration.config.typeformForms
        : [];
      const updatedForms = forms.map((f: any) =>
        f.formId === formId ? { ...f, webhookRegistered: true } : f,
      );
      integration.config = { ...integration.config, typeformForms: updatedForms };
      await this.integrationRepository.save(integration);

      return { success: true, webhookUrl };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}
