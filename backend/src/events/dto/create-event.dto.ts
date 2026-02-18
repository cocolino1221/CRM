import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsBoolean,
  IsArray,
  IsUUID,
  MaxLength,
  MinLength,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EventType,
  EventStatus,
  MeetingPlatform,
} from '../../database/entities/event.entity';

export class CreateEventDto {
  @ApiProperty({ description: 'Event title', example: 'Sales call with John Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'Event description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Event type',
    enum: EventType,
    default: EventType.MEETING,
  })
  @IsEnum(EventType)
  @IsOptional()
  type?: EventType;

  @ApiPropertyOptional({
    description: 'Event status',
    enum: EventStatus,
    default: EventStatus.SCHEDULED,
  })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @ApiProperty({
    description: 'Event start date and time',
    example: '2025-12-25T10:00:00Z',
  })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiProperty({
    description: 'Event end date and time',
    example: '2025-12-25T11:00:00Z',
  })
  @IsDate()
  @Type(() => Date)
  endDate: Date;

  @ApiPropertyOptional({ description: 'Is all day event', default: false })
  @IsBoolean()
  @IsOptional()
  isAllDay?: boolean;

  @ApiPropertyOptional({
    description: 'Event location or address',
    example: 'Conference Room A',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({
    description: 'Meeting platform',
    enum: MeetingPlatform,
  })
  @IsEnum(MeetingPlatform)
  @IsOptional()
  meetingPlatform?: MeetingPlatform;

  @ApiPropertyOptional({
    description: 'Meeting link',
    example: 'https://zoom.us/j/123456789',
  })
  @IsString()
  @IsOptional()
  meetingLink?: string;

  @ApiPropertyOptional({ description: 'Meeting ID', example: '123 456 789' })
  @IsString()
  @IsOptional()
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Meeting password', example: 'abc123' })
  @IsString()
  @IsOptional()
  meetingPassword?: string;

  @ApiPropertyOptional({
    description: 'Event color for calendar',
    example: '#3B82F6',
  })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Attendee user IDs',
    example: ['uuid1', 'uuid2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attendeeIds?: string[];

  @ApiPropertyOptional({ description: 'Related contact ID' })
  @IsUUID()
  @IsOptional()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Related deal ID' })
  @IsUUID()
  @IsOptional()
  dealId?: string;

  @ApiPropertyOptional({ description: 'Is recurring event', default: false })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description: 'Recurrence rule',
    example: { frequency: 'weekly', interval: 1 },
  })
  @IsObject()
  @IsOptional()
  recurrenceRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    count?: number;
  };

  @ApiPropertyOptional({
    description: 'Reminder settings',
    example: { email: true, minutes: [15, 60] },
  })
  @IsObject()
  @IsOptional()
  reminders?: {
    email?: boolean;
    sms?: boolean;
    minutes?: number[];
  };

  @ApiPropertyOptional({ description: 'Custom fields' })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Send meeting invite email to the contact', default: false })
  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;

  @ApiPropertyOptional({ description: 'Auto-generate a real Zoom/Google Meet link', default: false })
  @IsBoolean()
  @IsOptional()
  autoGenerateMeetingLink?: boolean;
}
