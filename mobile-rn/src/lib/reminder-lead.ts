/** The same choices and default the server uses (backend/src/activities/reminder-lead.ts). */
export const REMINDER_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 oră' },
  { value: 120, label: '2 ore' },
  { value: 0, label: 'Oprit' },
];
export const DEFAULT_REMINDER_MINUTES = 60;

export function currentReminderMinutes(preferences: Record<string, any> | null | undefined): number {
  const raw = Number(preferences?.reminderMinutesBefore);
  return REMINDER_OPTIONS.some((o) => o.value === raw) ? raw : DEFAULT_REMINDER_MINUTES;
}
