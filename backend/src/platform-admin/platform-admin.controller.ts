import { Controller, Get, Req, UseGuards, ForbiddenException, Param, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminService } from './platform-admin.service';
import { UserRole } from '../database/entities/user.entity';

@ApiTags('Platform Admin')
@Controller('platform-admin')
@UseGuards(JwtAuthGuard)
export class PlatformAdminController {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
  ) {}

  private assertSuperAdmin(req: any) {
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin access required');
    }
  }

  @Get('overview')
  @ApiOperation({ summary: 'Platform owner overview for all SaaS companies' })
  async getOverview(@Req() req: any) {
    this.assertSuperAdmin(req);
    return this.platformAdminService.getOverview();
  }

  @Get('workspaces/:id')
  @ApiOperation({ summary: 'Get workspace detail with users' })
  async getWorkspaceDetail(@Req() req: any, @Param('id') id: string) {
    this.assertSuperAdmin(req);
    return this.platformAdminService.getWorkspaceDetail(id);
  }

  @Patch('workspaces/:id/features')
  @ApiOperation({ summary: 'Update workspace feature access' })
  async updateWorkspaceFeatures(
    @Req() req: any,
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
    this.assertSuperAdmin(req);
    return this.platformAdminService.updateWorkspaceFeatures(id, body || {});
  }
}
