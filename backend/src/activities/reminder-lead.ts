/**
 * How long before a meeting or a follow-up someone wants their push, as they
 * set it in the app. One hour unless they chose otherwise; 0 means off.
 */
export const REMINDER_CHOICES = [0, 15, 30, 60, 120] as const;
export const DEFAULT_REMINDER_MINUTES = 60;
/** The furthest ahead anyone can ask to be told — bounds the query window. */
export const MAX_REMINDER_MINUTES = 120;

export function reminderLeadMinutes(preferences: Record<string, any> | null | undefined): number {
  const raw = Number(preferences?.reminderMinutesBefore);
  return (REMINDER_CHOICES as readonly number[]).includes(raw) ? raw : DEFAULT_REMINDER_MINUTES;
}

/** Whether the push for something starting at `at` is due by `now`. */
export function reminderDue(at: Date, leadMinutes: number, now: Date): boolean {
  if (leadMinutes <= 0) return false;
  return at.getTime() - leadMinutes * 60_000 <= now.getTime();
}

/** "în 1 oră", "în 30 de minute" — for the push text. */
export function inHowLong(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60_000));
  if (minutes <= 1) return 'acum';
  if (minutes < 60) return `în ${minutes} ${minutes < 20 ? 'minute' : 'de minute'}`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'în 1 oră' : `în ${hours} ore`;
}
