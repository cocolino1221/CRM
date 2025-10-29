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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DayOfWeek } from '../database/entities/availability.entity';

@ApiTags('Availability')
@Controller('availability')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Get all availability slots (filtered by user if specified)' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiResponse({ status: 200, description: 'Availability slots retrieved successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('userId') userId?: string,
  ) {
    return this.availabilityService.findAll(workspaceId, userId);
  }

  @Get('my-availability')
  @ApiOperation({ summary: 'Get current user availability slots' })
  @ApiResponse({ status: 200, description: 'Availability slots retrieved successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async getMyAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.availabilityService.findByUser(workspaceId, userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get availability slots for specific user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Availability slots retrieved successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async getUserAvailability(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.availabilityService.findByUser(workspaceId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create availability slot for current user' })
  @ApiResponse({ status: 201, description: 'Availability slot created successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: {
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    return this.availabilityService.create(workspaceId, userId, dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create availability slots for current user' })
  @ApiResponse({ status: 201, description: 'Availability slots created successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async bulkCreate(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: {
      slots: Array<{
        dayOfWeek: DayOfWeek;
        startTime: string;
        endTime: string;
        timezone?: string;
      }>;
    },
  ) {
    return this.availabilityService.bulkCreate(workspaceId, userId, dto.slots);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update availability slot' })
  @ApiParam({ name: 'id', description: 'Availability slot ID' })
  @ApiResponse({ status: 200, description: 'Availability slot updated successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async update(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      dayOfWeek?: DayOfWeek;
      startTime?: string;
      endTime?: string;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    return this.availabilityService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete availability slot' })
  @ApiParam({ name: 'id', description: 'Availability slot ID' })
  @ApiResponse({ status: 204, description: 'Availability slot deleted successfully' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async remove(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.availabilityService.remove(workspaceId, id);
  }
}
