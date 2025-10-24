import {
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  IsUUID,
  IsObject,
  Length,
  Matches,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  meetingTypeId: string;

  @IsString()
  @Length(1, 255)
  guestName: string;

  @IsEmail()
  guestEmail: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[\d\s\-\(\)]+$/)
  guestPhone?: string;

  @IsDateString()
  startTime: string;

  @IsString()
  timezone: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  customAnswers?: Record<string, any>;
}
