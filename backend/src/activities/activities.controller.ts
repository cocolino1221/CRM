import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { CreateAndDispositionDto, DispositionDto } from './dto/disposition.dto';
import { WorkQueuesService } from './work-queues.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const ALL_ROLES = ['admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent'];
const CALLING_ROLES = ['admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller'];

@ApiTags('Activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly workQueues: WorkQueuesService,
  ) {}

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

  @Post(':id/disposition')
  @ApiOperation({ summary: 'Record the outcome of a call and its follow-up action' })
  @ApiResponse({ status: 201, description: 'Disposition recorded' })
  @ApiResponse({ status: 404, description: 'Activity not found in this workspace' })
  @Roles(...CALLING_ROLES)
  async disposition(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: DispositionDto,
  ) {
    return this.activitiesService.applyDisposition(workspaceId, userId, id, dto);
  }

  @Post('disposition')
  @ApiOperation({ summary: 'Log a call made outside the app and record its outcome' })
  @ApiResponse({ status: 201, description: 'Call logged and dispositioned' })
  @Roles(...CALLING_ROLES)
  async createAndDisposition(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body(ValidationPipe) dto: CreateAndDispositionDto,
  ) {
    return this.activitiesService.createAndDisposition(workspaceId, userId, dto.contactId, dto);
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'Activities whose follow-up is due' })
  @Roles(...CALLING_ROLES)
  async followUps(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: any,
  ) {
    const scoped = ['admin', 'manager'].includes(user?.role) ? undefined : user?.id;
    return this.workQueues.findFollowUpsDue(workspaceId, scoped);
  }

  @Get('queues/booked')
  @ApiOperation({ summary: 'Upcoming bookings — the Programati list' })
  @Roles(...CALLING_ROLES)
  async booked(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: any,
  ) {
    const scoped = ['admin', 'manager'].includes(user?.role) ? undefined : user?.id;
    return this.workQueues.findBooked(workspaceId, scoped);
  }

  @Get('queues/to-call')
  @ApiOperation({ summary: 'Typeform leads that were never scheduled — the De sunat list' })
  @Roles(...CALLING_ROLES)
  async toCall(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { data, total } = await this.workQueues.findUnbookedLeads(
      workspaceId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
    // Each row carries the last call recording so a caller can listen before dialling.
    const enriched = await this.workQueues.attachLatestRecordings(workspaceId, data as any);
    return { data: enriched, total };
  }
}
