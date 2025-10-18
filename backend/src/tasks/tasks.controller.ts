import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { TaskStatus } from '../database/entities/task.entity';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) query: QueryTasksDto,
  ) {
    return this.tasksService.findAll(workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Task statistics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getStats(@CurrentWorkspace('id') workspaceId: string) {
    return this.tasksService.getStats(workspaceId);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Get tasks calendar view' })
  @ApiQuery({ name: 'startDate', required: true, description: 'Start date', type: String })
  @ApiQuery({ name: 'endDate', required: true, description: 'End date', type: String })
  @ApiResponse({ status: 200, description: 'Calendar data retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getCalendar(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('Start date and end date are required');
    }
    return this.tasksService.getCalendar(
      workspaceId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiQuery({ name: 'include', required: false, description: 'Relations to include (assignee,contact,deal,creator)' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Roles('admin', 'user', 'viewer')
  async findOne(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('include') include?: string,
  ) {
    const relations = include ? include.split(',').filter(r => ['assignee', 'contact', 'deal', 'creator'].includes(r)) : [];
    return this.tasksService.findOne(workspaceId, id, relations);
  }

  @Post()
  @ApiOperation({ summary: 'Create new task' })
  @ApiBody({ type: CreateTaskDto })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @Roles('admin', 'user')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body(ValidationPipe) createTaskDto: CreateTaskDto,
  ) {
    return this.tasksService.create(workspaceId, userId, createTaskDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task by ID' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiBody({ type: UpdateTaskDto })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Roles('admin', 'user')
  async update(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateTaskDto: UpdateTaskDto,
  ) {
    return this.tasksService.update(workspaceId, id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete task by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'user')
  async remove(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tasksService.remove(workspaceId, id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark task as complete' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiBody({ schema: { type: 'object', properties: { notes: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Task marked as complete' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Roles('admin', 'user')
  async complete(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes?: string,
  ) {
    return this.tasksService.complete(workspaceId, id, notes);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete tasks' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } } })
  @ApiResponse({ status: 200, description: 'Tasks deleted successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkDelete(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    return this.tasksService.bulkDelete(workspaceId, ids);
  }

  @Post('bulk/status')
  @ApiOperation({ summary: 'Bulk update task status' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        status: { enum: Object.values(TaskStatus) }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Task statuses updated successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkUpdateStatus(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
    @Body('status') status: TaskStatus,
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    if (!Object.values(TaskStatus).includes(status)) {
      throw new BadRequestException('Invalid status value');
    }
    return this.tasksService.bulkUpdateStatus(workspaceId, ids, status);
  }
}