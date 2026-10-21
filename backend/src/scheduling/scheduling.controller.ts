import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { BookingBrandingService } from './booking-branding.service';
import { BookingFormService } from './booking-form.service';
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
  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly brandingService: BookingBrandingService,
    private readonly bookingFormService: BookingFormService,
  ) {}

  // ========== Booking page look ==========

  @Get('booking-form')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Questions and age check shown before the booking calendar' })
  async getBookingForm(@CurrentWorkspace('id') workspaceId: string) {
    return this.bookingFormService.get(workspaceId);
  }

  @Put('booking-form')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  // Closers used to edit these, on the grounds that they take the calls and
  // know what to ask. The page is now admin and manager only, and a write
  // left open to a role that cannot reach the screen is a door with no
  // handle on the inside.
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Set the questions and age check shown before the booking calendar' })
  async setBookingForm(@CurrentWorkspace('id') workspaceId: string, @Body() body: unknown) {
    return this.bookingFormService.set(workspaceId, body);
  }

  @Get('booking-variants')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Named versions of the booking page, each with its own questions' })
  async getBookingVariants(@CurrentWorkspace('id') workspaceId: string) {
    return this.bookingFormService.getVariants(workspaceId);
  }

  @Put('booking-variants')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Replace the named versions of the booking page' })
  async setBookingVariants(@CurrentWorkspace('id') workspaceId: string, @Body() body: unknown) {
    return this.bookingFormService.setVariants(workspaceId, body);
  }

  @Get('booking-page')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'How the public booking page looks' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getBookingPage(@CurrentWorkspace('id') workspaceId: string) {
    return this.brandingService.get(workspaceId);
  }

  @Put('booking-page')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set logo, background, colours and texts of the public booking page' })
  // One page for the whole team, so not every closer gets to repaint it.
  @Roles('admin', 'manager')
  async setBookingPage(@CurrentWorkspace('id') workspaceId: string, @Body() body: unknown) {
    return this.brandingService.set(workspaceId, body);
  }

  // ========== Availability Endpoints ==========

  @Post('availability')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create availability schedule' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
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
  @Roles('super_admin', 'admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
  async updateAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreateAvailabilityDto>,
  ) {
    return this.schedulingService.updateAvailability(workspaceId, userId, id, dto);
  }

  @Delete('availability/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete availability' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
  async deleteAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schedulingService.deleteAvailability(workspaceId, userId, id);
  }

  // ========== Meeting Types Endpoints ==========

  @Post('meeting-types')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create meeting type' })
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
  async updateMeetingType(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreateMeetingTypeDto>,
  ) {
    return this.schedulingService.updateMeetingType(workspaceId, userId, id, dto);
  }

  @Delete('meeting-types/:id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete meeting type' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller')
  async deleteMeetingType(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.schedulingService.deleteMeetingType(workspaceId, userId, id);
  }

  // ========== Public Booking Endpoints (No Auth) ==========

  @Get('public/:slug')
  @ApiOperation({ summary: 'Get public meeting type by slug' })
  @ApiParam({ name: 'slug', description: 'Meeting type URL slug' })
  @ApiQuery({ name: 'v', description: 'Booking page variant id', required: false })
  async getPublicMeetingType(@Param('slug') slug: string, @Query('v') variant?: string) {
    const meetingType = await this.schedulingService.getMeetingTypeBySlug(slug);
    // Anyone on the internet calls this. The entity carries its owner's full
    // user row — password hash and email included — so only what the page
    // shows goes out.
    return {
      id: meetingType.id,
      name: meetingType.name,
      description: meetingType.description,
      duration: meetingType.duration,
      user: meetingType.user
        ? { firstName: meetingType.user.firstName, lastName: meetingType.user.lastName }
        : undefined,
      branding: await this.brandingService.get(meetingType.workspaceId),
      // The age check and the questions asked before the calendar.
      form: await this.bookingFormService.getForLink(meetingType.workspaceId, variant),
    };
  }

  @Get('public/:slug/prefill')
  @ApiOperation({ summary: 'Name, email and phone for a booking page reached from a WooCommerce order or a CRM form' })
  @ApiQuery({ name: 'order', description: 'WooCommerce order id', required: false })
  @ApiQuery({ name: 'key', description: 'WooCommerce order key (wc_order_…)', required: false })
  @ApiQuery({ name: 't', description: 'Signed pass from a form the CRM served', required: false })
  async prefill(
    @Param('slug') slug: string,
    @Query('order') order?: string,
    @Query('key') key?: string,
    @Query('t') token?: string,
  ) {
    const meetingType = await this.schedulingService.getMeetingTypeBySlug(slug);
    const workspaceId = meetingType.workspaceId;
    // An empty answer rather than a 404: the order may simply not have
    // reached the CRM yet, and the page retries.
    const found = token
      ? await this.bookingFormService.prefillFromToken(workspaceId, token)
      : await this.bookingFormService.prefillFromWooOrder(workspaceId, order ?? '', key ?? '');
    return found ?? {};
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

  @Get('team-slots')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Free hours across the team, with who is free at each' })
  @ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', required: true })
  async getTeamSlotsForApp(@Req() req: any, @Query('date') date: string) {
    const day = new Date(date);
    if (Number.isNaN(day.getTime())) {
      throw new BadRequestException('date is not a valid date');
    }
    return this.schedulingService.getTeamSlotsForWorkspace(req.user.workspaceId, day);
  }

  @Get('public/:slug/team-slots')
  @ApiOperation({ summary: 'Free hours across everyone bookable, with who is free at each' })
  @ApiParam({ name: 'slug', description: 'Any public meeting type slug in the workspace' })
  @ApiQuery({ name: 'date', description: 'Date in YYYY-MM-DD format', required: true })
  async getTeamSlots(@Param('slug') slug: string, @Query('date') date: string) {
    return this.schedulingService.getTeamSlots(slug, new Date(date));
  }

  @Post('public/:slug/callback-request')
  @ApiOperation({ summary: 'The lead cannot pick an hour and asks to be called instead' })
  @HttpCode(HttpStatus.CREATED)
  async requestCallback(
    @Param('slug') slug: string,
    @Body() body: { name: string; phone: string; email?: string; notes?: string },
  ) {
    if (!String(body?.name || '').trim() || !String(body?.phone || '').trim()) {
      throw new BadRequestException('Numele și telefonul sunt necesare.');
    }
    return this.schedulingService.requestCallback(slug, body);
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
  @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  async getBookings(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    // Admins and managers see all bookings, others see only their own
    const userId = ['super_admin', 'admin', 'manager'].includes(user.role) ? undefined : user.id;

    return this.schedulingService.getBookings(workspaceId, userId, start, end);
  }
}
