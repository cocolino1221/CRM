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

  // Required: this form is the one the public books from, and a booking with
  // no number is one the callers cannot work. Only createPublicBooking uses
  // this DTO, so nothing else is tightened by it.
  @IsString()
  @Matches(/^[+]?[\d\s\-\(\)]+$/, { message: 'guestPhone contains characters that are not allowed' })
  @Matches(/(\D*\d){8,}/, { message: 'guestPhone looks incomplete' })
  guestPhone: string;

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
}
