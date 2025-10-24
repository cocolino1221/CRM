import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  Max,
  Length,
  IsHexColor,
  IsObject,
} from 'class-validator';

export class CreateMeetingTypeDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(5)
  @Max(480)
  duration: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferBefore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  bufferAfter?: number;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxBookingDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  minNoticeHours?: number;

  @IsOptional()
  @IsArray()
  customQuestions?: Array<{
    id: string;
    question: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    required: boolean;
    options?: string[];
  }>;
}
