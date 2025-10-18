import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDate,
  IsInt,
  Min,
  IsBoolean,
  IsArray,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus, TaskPriority, TaskType } from '../../database/entities/task.entity';

export class CreateTaskDto {
  @ApiProperty({ description: 'Task title', example: 'Follow up call with client' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Task type',
    enum: TaskType,
    default: TaskType.OTHER,
  })
  @IsEnum(TaskType)
  @IsOptional()
  type?: TaskType;

  @ApiPropertyOptional({
    description: 'Task status',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Task priority',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: 'Task due date', example: '2025-12-31T15:00:00Z' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dueDate?: Date;

  @ApiPropertyOptional({ description: 'Estimated duration in minutes', example: 30, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  estimatedDuration?: number;

  @ApiPropertyOptional({ description: 'Assignee user ID' })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Contact ID' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Deal ID' })
  @IsUUID()
  @IsOptional()
  dealId?: string;

  @ApiPropertyOptional({ description: 'Tags for categorization', example: ['sales', 'follow-up'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Is task recurring', example: false })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({ description: 'Custom fields', example: { location: 'Conference Room A' } })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}