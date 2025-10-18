import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDate,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DealStage, DealPriority, DealSource } from '../../database/entities/deal.entity';

export class CreateDealDto {
  @ApiProperty({ description: 'Deal title', example: 'Enterprise SaaS Deal' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Deal value', example: 50000 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: 'Currency code', example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    description: 'Deal stage',
    enum: DealStage,
    default: DealStage.LEAD,
  })
  @IsEnum(DealStage)
  @IsOptional()
  stage?: DealStage;

  @ApiPropertyOptional({
    description: 'Deal priority',
    enum: DealPriority,
    default: DealPriority.MEDIUM,
  })
  @IsEnum(DealPriority)
  @IsOptional()
  priority?: DealPriority;

  @ApiPropertyOptional({ description: 'Win probability (0-100)', example: 50, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  probability?: number;

  @ApiPropertyOptional({
    description: 'Deal source',
    enum: DealSource,
  })
  @IsEnum(DealSource)
  @IsOptional()
  source?: DealSource;

  @ApiPropertyOptional({ description: 'Expected close date', example: '2025-12-31' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  expectedCloseDate?: Date;

  @ApiPropertyOptional({ description: 'Deal description' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Owner user ID' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Contact ID' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Company ID' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Number of decision makers', example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  decisionMakers?: number;

  @ApiPropertyOptional({ description: 'Budget confirmed', example: false })
  @IsBoolean()
  @IsOptional()
  budgetConfirmed?: boolean;

  @ApiPropertyOptional({ description: 'Tags for categorization', example: ['enterprise', 'q4-2025'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Custom fields', example: { industry: 'technology', region: 'north-america' } })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}