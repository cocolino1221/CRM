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
import { DealStage, DealPriority, DealSource } from '../../database/entities/deal.entity';

export class QueryDealsDto {
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

  @ApiPropertyOptional({ description: 'Filter by stage', enum: DealStage })
  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: DealPriority })
  @IsEnum(DealPriority)
  @IsOptional()
  priority?: DealPriority;

  @ApiPropertyOptional({ description: 'Filter by source', enum: DealSource })
  @IsEnum(DealSource)
  @IsOptional()
  source?: DealSource;

  @ApiPropertyOptional({ description: 'Filter by owner ID' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Filter by contact ID' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Filter by company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiPropertyOptional({ description: 'Minimum deal value' })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @IsOptional()
  minValue?: number;

  @ApiPropertyOptional({ description: 'Maximum deal value' })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @IsOptional()
  maxValue?: number;

  @ApiPropertyOptional({ description: 'Expected close date from' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  closeDateFrom?: Date;

  @ApiPropertyOptional({ description: 'Expected close date to' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  closeDateTo?: Date;

  @ApiPropertyOptional({ description: 'Show only overdue deals' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Show only open deals (not closed)' })
  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  openOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['createdAt', 'updatedAt', 'value', 'expectedCloseDate', 'title', 'probability'],
    default: 'createdAt'
  })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}