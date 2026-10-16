import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { QueryActivitiesDto } from './dto/query-activities.dto';

const ALL_ROLES = ['admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent'];

@ApiTags('Activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List activities for the workspace' })
  @ApiResponse({ status: 200, description: 'Activities retrieved successfully' })
  @Roles(...ALL_ROLES)
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) query: QueryActivitiesDto,
  ) {
    return this.activitiesService.findAll(workspaceId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single activity' })
  @ApiResponse({ status: 404, description: 'Activity not found in this workspace' })
  @Roles(...ALL_ROLES)
  async findOne(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.activitiesService.findOne(workspaceId, id);
  }
}
