import { describe, expect, it } from 'vitest';
import { currentReminderMinutes } from './reminder-lead';

describe('currentReminderMinutes', () => {
  it('is one hour for someone who never chose', () => {
    expect(currentReminderMinutes(undefined)).toBe(60);
    expect(currentReminderMinutes({})).toBe(60);
  });

  it('keeps a valid choice, including off', () => {
    expect(currentReminderMinutes({ reminderMinutesBefore: 15 })).toBe(15);
    expect(currentReminderMinutes({ reminderMinutesBefore: 0 })).toBe(0);
  });

  it('falls back on anything the server would not honour', () => {
    expect(currentReminderMinutes({ reminderMinutesBefore: 45 })).toBe(60);
    expect(currentReminderMinutes({ reminderMinutesBefore: 'x' })).toBe(60);
  });
});
