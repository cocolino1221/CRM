import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Event, EventType, EventStatus } from '../database/entities/event.entity';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  async create(
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
  ): Promise<Event> {
    return this.eventsService.create(
      req.user.workspaceId,
      req.user.id,
      createEventDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all events' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'type', enum: EventType, required: false })
  @ApiQuery({ name: 'status', enum: EventStatus, required: false })
  @ApiQuery({ name: 'viewTeam', type: Boolean, required: false })
  async findAll(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('viewTeam') viewTeam?: string,
  ): Promise<Event[]> {
    // Default to team view (shared calendar) unless explicitly set to false
    const shouldViewTeam = viewTeam === 'false' ? false : true;

    return this.eventsService.findAll(req.user.workspaceId, req.user.id, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      type,
      status,
      viewTeam: shouldViewTeam,
    });
  }

  @Get('team-calendar')
  @ApiOperation({ summary: 'Get team calendar (Admin only)' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  async getTeamCalendar(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.eventsService.getTeamCalendar(
      req.user.workspaceId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<Event> {
    return this.eventsService.findOne(req.user.workspaceId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update event' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEventDto: UpdateEventDto,
    @Req() req: any,
  ): Promise<Event> {
    return this.eventsService.update(req.user.workspaceId, id, updateEventDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete event' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<void> {
    return this.eventsService.remove(req.user.workspaceId, id);
  }

  @Post('schedule-for/:userId')
  @ApiOperation({ summary: 'Schedule event for another user' })
  async scheduleForUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() createEventDto: CreateEventDto,
    @Req() req: any,
  ): Promise<Event> {
    return this.eventsService.scheduleForUser(
      req.user.workspaceId,
      req.user.id,
      userId,
      createEventDto,
    );
  }

  @Post(':id/generate-meeting-link')
  @ApiOperation({ summary: 'Generate meeting link for event' })
  async generateMeetingLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('platform') platform: 'zoom' | 'google_meet',
    @Req() req: any,
  ) {
    return this.eventsService.generateMeetingLink(
      req.user.workspaceId,
      id,
      platform,
    );
  }

  @Post('webhooks/calendly')
  @ApiOperation({ summary: 'Calendly webhook handler' })
  @HttpCode(HttpStatus.OK)
  async calendlyWebhook(@Body() payload: any) {
    // TODO: Add webhook signature verification
    return this.eventsService.handleCalendlyWebhook(payload);
  }
}
