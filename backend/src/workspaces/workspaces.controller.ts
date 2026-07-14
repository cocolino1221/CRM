import { Body, Controller, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';

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
}
