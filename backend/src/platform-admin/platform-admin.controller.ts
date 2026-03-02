import { Controller, Get, UseGuards, Param, Patch, Body, Post, Delete, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminService } from './platform-admin.service';
import { CreatePlatformWorkspaceDto } from './dto/create-platform-workspace.dto';

@ApiTags('Platform Admin')
@Controller('platform-admin')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform owner overview for all SaaS companies' })
  async getOverview() {
    return this.platformAdminService.getOverview();
  }

  @Get('workspaces/:id')
  @ApiOperation({ summary: 'Get workspace detail with users' })
  async getWorkspaceDetail(@Param('id') id: string) {
    return this.platformAdminService.getWorkspaceDetail(id);
  }

  @Post('workspaces')
  @ApiOperation({ summary: 'Create a new workspace/company with initial admin user' })
  async createWorkspace(@Body() body: CreatePlatformWorkspaceDto) {
    return this.platformAdminService.createWorkspace(body);
  }

  @Patch('workspaces/:id')
  @ApiOperation({ summary: 'Update workspace name, plan, or active status' })
  async updateWorkspace(
    @Param('id') id: string,
    @Body() body: { name?: string; plan?: string; isActive?: boolean },
  ) {
    return this.platformAdminService.updateWorkspace(id, body || {});
  }

  @Delete('workspaces/:id')
  @ApiOperation({ summary: 'Delete a workspace and all its data' })
  async deleteWorkspace(@Param('id') id: string) {
    return this.platformAdminService.deleteWorkspace(id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user from a workspace' })
  async deleteUser(@Param('id') id: string) {
    return this.platformAdminService.deleteUser(id);
  }

  @Patch('workspaces/:id/features')
  @ApiOperation({ summary: 'Update workspace feature access' })
  async updateWorkspaceFeatures(
    @Param('id') id: string,
    @Body() body: {
      aiEnabled?: boolean;
      slackIntegration?: boolean;
      emailIntegration?: boolean;
      whatsappEnabled?: boolean;
      contactsEnabled?: boolean;
      leadsEnabled?: boolean;
      calendarEnabled?: boolean;
      pipelineEnabled?: boolean;
      tasksEnabled?: boolean;
      automationEnabled?: boolean;
      marketingEnabled?: boolean;
      mobileAppEnabled?: boolean;
    },
  ) {
    return this.platformAdminService.updateWorkspaceFeatures(id, body || {});
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get global system logs across all workspaces' })
  async getPlatformLogs(
    @Query('limit') limit?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const parsedLimit = typeof limit === 'string' ? Number.parseInt(limit, 10) : Number.NaN;
    return this.platformAdminService.getPlatformLogs({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      workspaceId: workspaceId?.trim() || undefined,
    });
  }
}
