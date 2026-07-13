export class QuietHoursDto {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}

export class UpdateNotificationPreferencesDto {
  push?: Record<string, boolean>;
  quietHours?: QuietHoursDto;
}
