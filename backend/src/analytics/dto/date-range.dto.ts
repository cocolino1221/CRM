import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsEnum } from 'class-validator';

export enum TimeRange {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_QUARTER = 'this_quarter',
  LAST_QUARTER = 'last_quarter',
  THIS_YEAR = 'this_year',
  LAST_YEAR = 'last_year',
  CUSTOM = 'custom',
}

export class DateRangeDto {
  @ApiPropertyOptional({ description: 'Time range preset', enum: TimeRange })
  @IsEnum(TimeRange)
  @IsOptional()
  range?: TimeRange;

  @ApiPropertyOptional({ description: 'Custom start date (ISO 8601)', example: '2025-01-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Custom end date (ISO 8601)', example: '2025-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}