import {
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  IsUUID,
  IsObject,
  Length,
  Matches,
  MaxLength,
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

  /** Which version of the booking page it came from (`?v=`); decides the questions checked. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  variant?: string;

  /** Where they came from: utm_* on the link and the referring page. Cleaned server-side. */
  @IsOptional()
  @IsObject()
  tracking?: Record<string, unknown>;
}
