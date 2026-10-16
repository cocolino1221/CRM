import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ActivityOutcome, ActivityType } from '../../database/entities/activity.entity';

export class QueryActivitiesDto {
  @ApiPropertyOptional({ description: 'Only activities for this contact' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @ApiPropertyOptional({ enum: ActivityOutcome })
  @IsOptional()
  @IsEnum(ActivityOutcome)
  outcome?: ActivityOutcome;

  @ApiPropertyOptional({ description: 'Only activities owned by this user' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
