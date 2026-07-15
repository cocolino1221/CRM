import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class QuietHoursDto {
  @IsBoolean()
  enabled: boolean;

  @Matches(TIME_PATTERN, { message: 'start must be HH:MM (24h)' })
  start: string;

  @Matches(TIME_PATTERN, { message: 'end must be HH:MM (24h)' })
  end: string;

  @IsString()
  timezone: string;
}

export class UpdateNotificationPreferencesDto {
  // Per-category push switches, e.g. { "message:whatsapp": false }.
  // NOTE: decorators are required — the global ValidationPipe runs with
  // whitelist:true and strips any property that has none (which silently
  // discarded the whole payload before this fix).
  @IsOptional()
  @IsObject()
  push?: Record<string, boolean>;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours?: QuietHoursDto;
}
