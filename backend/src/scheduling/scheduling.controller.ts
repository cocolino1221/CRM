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
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateMeetingTypeDto } from './dto/create-meeting-type.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { User } from '../database/entities/user.entity';

@ApiTags('Scheduling')
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // ========== Availability Endpoints ==========

  @Post('availability')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create availability schedule' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async createAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body(ValidationPipe) dto: CreateAvailabilityDto,
  ) {
    return this.schedulingService.createAvailability(workspaceId, userId, dto);
  }

  @Get('availability')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my availability schedule' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'support_agent')
  async getAvailabilities(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.schedulingService.getAvailabilities(workspaceId, userId);
  }

  @Put('availability/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update availability' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async updateAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreateAvailabilityDto>,
  ) {
    return this.schedulingService.updateAvailability(workspaceId, id, dto);
  }

  @Delete('availability/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete availability' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async deleteAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schedulingService.deleteAvailability(workspaceId, id);
  }

  // ========== Meeting Types Endpoints ==========

  @Post('meeting-types')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create meeting type' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async createMeetingType(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body(ValidationPipe) dto: CreateMeetingTypeDto,
  ) {
    return this.schedulingService.createMeetingType(workspaceId, userId, dto);
  }

  @Get('meeting-types')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my meeting types' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'support_agent')
  async getMeetingTypes(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.schedulingService.getMeetingTypes(workspaceId, userId);
  }

  @Put('meeting-types/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update meeting type' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async updateMeetingType(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreateMeetingTypeDto>,
  ) {
    return this.schedulingService.updateMeetingType(workspaceId, id, dto);
  }

  @Delete('meeting-types/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete meeting type' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter')
  async deleteMeetingType(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schedulingService.deleteMeetingType(workspaceId, id);
  }

  // ========== Public Booking Endpoints (No Auth) ==========

  @Get('public/:slug')
  @ApiOperation({ summary: 'Get public meeting type by slug' })
  @ApiParam({ name: 'slug', description: 'Meeting type URL slug' })
  async getPublicMeetingType(@Param('slug') slug: string) {
    return this.schedulingService.getMeetingTypeBySlug(slug);
  }

  @Get('public/:slug/slots')
  @ApiOperation({ summary: 'Get available time slots for a meeting type' })
  @ApiParam({ name: 'slug', description: 'Meeting type URL slug' })
  @ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', required: true })
  @ApiQuery({ name: 'timezone', description: 'Timezone', required: false })
  async getAvailableSlots(
    @Param('slug') slug: string,
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
  ) {
    const dateObj = new Date(date);
    return this.schedulingService.getAvailableSlots(slug, dateObj, timezone);
  }

  @Post('public/bookings')
  @ApiOperation({ summary: 'Create a new booking (public)' })
  @HttpCode(HttpStatus.CREATED)
  async createPublicBooking(@Body(ValidationPipe) dto: CreateBookingDto) {
    return this.schedulingService.createBooking(dto);
  }

  @Get('public/bookings/:confirmationCode')
  @ApiOperation({ summary: 'Get booking by confirmation code' })
  async getBookingByConfirmation(@Param('confirmationCode') confirmationCode: string) {
    return this.schedulingService.getBookingByConfirmation(confirmationCode);
  }

  @Post('public/bookings/:confirmationCode/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  async cancelBooking(
    @Param('confirmationCode') confirmationCode: string,
    @Body('reason') reason?: string,
  ) {
    return this.schedulingService.cancelBooking(confirmationCode, reason);
  }

  @Post('public/bookings/:confirmationCode/reschedule')
  @ApiOperation({ summary: 'Reschedule a booking' })
  async rescheduleBooking(
    @Param('confirmationCode') confirmationCode: string,
    @Body('newStartTime') newStartTime: string,
  ) {
    return this.schedulingService.rescheduleBooking(
      confirmationCode,
      new Date(newStartTime),
    );
  }

  // ========== Authenticated Booking Endpoints ==========

  @Get('bookings')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my bookings' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'support_agent')
  async getBookings(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    // Admins and managers see all bookings, others see only their own
    const userId = ['admin', 'manager'].includes(user.role) ? undefined : user.id;

    return this.schedulingService.getBookings(workspaceId, userId, start, end);
  }
}
