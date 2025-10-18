import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  IsUUID,
  Min,
  Max,
  IsDate,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus, TaskPriority, TaskType } from '../../database/entities/task.entity';

export class QueryTasksDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search query (searches title, description)' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: TaskPriority })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Filter by type', enum: TaskType })
  @IsEnum(TaskType)
  @IsOptional()
  type?: TaskType;

  @ApiPropertyOptional({ description: 'Filter by assignee ID' })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Filter by contact ID' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Filter by deal ID' })
  @IsUUID()
  @IsOptional()
  dealId?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Due date from' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dueDateFrom?: Date;

  @ApiPropertyOptional({ description: 'Due date to' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dueDateTo?: Date;

  @ApiPropertyOptional({ description: 'Show only overdue tasks' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Show only completed tasks' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  completedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['createdAt', 'updatedAt', 'dueDate', 'title', 'priority'],
    default: 'dueDate'
  })
  @IsString()
  @IsOptional()
  sortBy?: string = 'dueDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}