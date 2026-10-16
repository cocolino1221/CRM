import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ActivityOutcome } from '../../database/entities/activity.entity';

export class DispositionFollowUpDto {
  @ApiProperty({ description: 'When the caller should come back to this contact (ISO 8601)' })
  @IsDateString()
  at: string;

  @ApiPropertyOptional({ description: 'Reminder title; a default is used when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}

export class DispositionDealDto {
  @ApiProperty({ description: 'Amount agreed on the call' })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiProperty({ example: 'RON' })
  @IsString()
  @MaxLength(3)
  currency: string;
}

export class DispositionDto {
  @ApiProperty({ enum: ActivityOutcome })
  @IsEnum(ActivityOutcome)
  outcome: ActivityOutcome;

  @ApiPropertyOptional({ description: 'What was said on the call' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: DispositionFollowUpDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DispositionFollowUpDto)
  followUp?: DispositionFollowUpDto;

  @ApiPropertyOptional({ type: DispositionDealDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DispositionDealDto)
  deal?: DispositionDealDto;

  @ApiPropertyOptional({ description: 'Whether a booking link was sent to the contact' })
  @IsOptional()
  @IsBoolean()
  bookingSent?: boolean;

  /**
   * Generated once per dialog instance, not per submit attempt. A caller on a
   * bad connection retries with the same value, and the retry must not create a
   * second task or a second deal.
   */
  @ApiProperty({ description: 'Client-generated id making a retry safe' })
  @IsUUID()
  clientRequestId: string;
}

export class CreateAndDispositionDto extends DispositionDto {
  @ApiProperty({ description: 'Contact the call was with' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ description: 'When the call happened (ISO 8601); defaults to now' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'Call length in seconds' })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;
}
