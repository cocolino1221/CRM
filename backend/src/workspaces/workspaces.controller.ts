import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LeadGrace, WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { KPI_DEFINITIONS, KpiConfig } from '../common/kpi-definitions';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Put('current/branding')
  @ApiOperation({ summary: 'Set (or clear) the workspace brand logo URL (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { brandLogoUrl: { type: 'string', nullable: true } },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated workspace settings' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @Roles('admin')
  async setBranding(
    @CurrentWorkspace('id') workspaceId: string,
    @Body() body: { brandLogoUrl: string | null },
  ) {
    return this.workspacesService.setBranding(workspaceId, body.brandLogoUrl);
  }
  @Get('current/kpis')
  @ApiOperation({ summary: 'Which KPIs the reports show, with the available definitions' })
  @ApiResponse({ status: 200, description: 'KPI configuration' })
  // Everyone who can open a report can read the configuration — the targets
  // are what the numbers on their own screen are measured against.
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getKpiConfig(@CurrentWorkspace('id') workspaceId: string) {
    const config = await this.workspacesService.getKpiConfig(workspaceId);
    // The definitions travel with the config so the screen never has to guess
    // a label or a unit for a key it was handed.
    return { ...config, definitions: KPI_DEFINITIONS };
  }

  @Get('current/lead-grace')
  @ApiOperation({ summary: 'How long a fresh lead is left alone before it reaches De sunat' })
  @ApiResponse({ status: 200, description: 'Wait per source, in minutes' })
  // Any caller may read it: it explains why a lead they can see in WooCommerce
  // is not in their queue yet.
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getLeadGrace(@CurrentWorkspace('id') workspaceId: string) {
    return this.workspacesService.getLeadGrace(workspaceId);
  }

  @Put('current/lead-grace')
  @ApiOperation({ summary: 'Set the wait per source before a lead becomes callable' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        typeform: { type: 'number' },
        woocommerce: { type: 'number' },
        manual: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated waits' })
  @ApiResponse({ status: 400, description: 'A wait outside 0–1440 minutes' })
  @Roles('admin', 'manager')
  async setLeadGrace(
    @CurrentWorkspace('id') workspaceId: string,
    @Body() body: Partial<LeadGrace>,
  ) {
    return this.workspacesService.setLeadGrace(workspaceId, body);
  }

  @Put('current/kpis')
  @ApiOperation({ summary: 'Choose which KPIs the reports show and set their targets' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'array', items: { type: 'string' } },
        targets: { type: 'object', additionalProperties: { type: 'number' } },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated KPI configuration' })
  @ApiResponse({ status: 400, description: 'Unknown KPI, or a target that is not a positive number' })
  // Writing is a workspace-wide decision: one caller must not re-target the team.
  @Roles('admin', 'manager')
  async setKpiConfig(
    @CurrentWorkspace('id') workspaceId: string,
    @Body() body: KpiConfig,
  ) {
    return this.workspacesService.setKpiConfig(workspaceId, body);
  }
}
