import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { BookingStatus } from '../database/entities/booking.entity';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bookings' })
  @ApiQuery({ name: 'hostId', required: false, description: 'Filter by host user ID' })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('hostId') hostId?: string,
    @Query('status') status?: BookingStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.bookingsService.findAll(workspaceId, {
      hostId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('available-slots/:hostId')
  @ApiOperation({ summary: 'Get available booking slots for a host on a specific date' })
  @ApiParam({ name: 'hostId', description: 'Host user ID' })
  @ApiQuery({ name: 'date', required: true, description: 'Date to check availability (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async getAvailableSlots(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('hostId', ParseUUIDPipe) hostId: string,
    @Query('date') date: string,
  ) {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date format');
    }

    return this.bookingsService.findAvailableSlots(workspaceId, hostId, dateObj);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new booking (setter/caller books for closer)' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @Roles('admin', 'manager', 'setter', 'caller')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @Req() req: any,
    @Body() dto: {
      hostId: string;
      startTime: Date;
      duration: number;
      contactId?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      notes?: string;
      timezone?: string;
    },
  ) {
    return this.bookingsService.create(workspaceId, req.user, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller')
  async cancel(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    return this.bookingsService.cancel(workspaceId, id, req.user.id, reason);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update booking status' })
  @ApiParam({ name: 'id', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking status updated successfully' })
  @Roles('admin', 'manager', 'closer')
  async updateStatus(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status', new ParseEnumPipe(BookingStatus)) status: BookingStatus,
  ) {
    return this.bookingsService.updateStatus(workspaceId, id, status);
  }
}
