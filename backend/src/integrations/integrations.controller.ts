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
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { IntegrationsService } from './integrations.service';
import { IntegrationRegistry } from './registry/integration.registry';
import { OAuthService } from './auth/oauth.service';
import { WebhookService } from './webhook/webhook.service';
import { CreateIntegrationDto, UpdateIntegrationDto, InstallIntegrationDto } from './dto/integration.dto';
import { Integration, IntegrationType, IntegrationStatus, IntegrationAuthType } from '../database/entities/integration.entity';

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
  ) {}

  @Get('available')
  @ApiOperation({ summary: 'Get all available integration types' })
  @ApiResponse({ status: 200, description: 'List of available integrations' })
  async getAvailableIntegrations() {
    return {
      integrations: await this.integrationsService.getAvailableIntegrations(),
      categories: this.integrationRegistry.getIntegrationsByCategory(),
      featured: this.integrationRegistry.getFeaturedIntegrations(),
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
  ): Promise<{ integrations: Integration[]; analytics: any }> {
    const workspaceId = req.user.workspaceId;

    const integrations = await this.integrationsService.findAll(workspaceId, {
      type,
      status,
      isEnabled: enabled,
    });

    const analytics = await this.integrationsService.getAnalytics(workspaceId);

    return { integrations, analytics };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  @ApiResponse({ status: 200, description: 'Integration details' })
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<{ integration: Integration }> {
    const integration = await this.integrationsService.findOne(id, req.user.workspaceId);
    return { integration };
  }

  @Post('install')
  @ApiOperation({ summary: 'Install a new integration' })
  @ApiResponse({ status: 201, description: 'Integration installed successfully' })
  async install(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InstallIntegrationDto,
  ): Promise<{ integration: Integration; authUrl?: string }> {
    const integration = await this.integrationsService.install(
      req.user.workspaceId,
      req.user.id,
      dto,
    );

    let authUrl: string | undefined;

    // Generate OAuth URL if needed
    if (integration.authType === 'oauth2') {
      authUrl = this.oauthService.generateAuthUrl(integration);
    }

    return { integration, authUrl };
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

  // OAuth Endpoints
  @Get('oauth/:type/authorize')
  @ApiOperation({ summary: 'Start OAuth authorization flow' })
  @ApiResponse({ status: 302, description: 'Redirect to OAuth provider' })
  async startOAuth(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('type') type: IntegrationType,
    @Query('integration_id') integrationId?: string,
  ): Promise<void> {
    try {
      let integration: Integration;

      if (integrationId) {
        integration = await this.integrationsService.findOne(integrationId, req.user.workspaceId);
      } else {
        // Create temporary integration for OAuth flow
        integration = await this.integrationsService.install(req.user.workspaceId, req.user.id, {
          type,
          authType: IntegrationAuthType.OAUTH2,
        });
      }

      const authUrl = this.oauthService.generateAuthUrl(integration, integration.id);
      res.redirect(authUrl);
    } catch (error) {
      this.logger.error(`OAuth start failed:`, error);
      res.status(400).json({ error: error.message });
    }
  }

  @Get('oauth/callback')
  @ApiOperation({ summary: 'Handle OAuth callback' })
  @ApiResponse({ status: 200, description: 'OAuth callback handled' })
  async handleOAuthCallback(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ): Promise<void> {
    if (error) {
      this.logger.error(`OAuth error: ${error}`);
      res.redirect(`/integrations?error=${encodeURIComponent(error)}`);
      return;
    }

    try {
      const integration = await this.integrationsService.findOne(state, req.user.workspaceId);

      await this.integrationsService.authenticate(integration.id, req.user.workspaceId, { code });

      res.redirect(`/integrations?success=1&integration=${integration.id}`);
    } catch (err) {
      this.logger.error(`OAuth callback failed:`, err);
      res.redirect(`/integrations?error=${encodeURIComponent(err.message)}`);
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
  @Post('webhooks/:integrationId')
  @ApiOperation({ summary: 'Receive webhook payload' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async receiveWebhook(
    @Param('integrationId') integrationId: string,
    @Body() payload: any,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message?: string }> {
    try {
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
}