import { canHostMeetings, hasTimeOfDay, CALENDAR_ROLES } from './calendar-access';

/**
 * Who may be put in the calendar, and what counts as an hour.
 *
 * A booking for a host who does not work the calendar is a meeting nobody
 * turns up to: it was a super_admin test account that took the lead "Марат"
 * at three in the morning, because any user could be named as host and a
 * host booking themselves skipped the availability check entirely.
 */
describe('canHostMeetings', () => {
  it('accepts the three roles that work the calendar', () => {
    for (const role of ['closer', 'caller', 'setter']) {
      expect(canHostMeetings({ role })).toBe(true);
    }
  });

  it('refuses an account that only administers the workspace', () => {
    // The test super_admin that collected the 03:00 booking.
    expect(canHostMeetings({ role: 'super_admin' })).toBe(false);
    expect(canHostMeetings({ role: 'admin' })).toBe(false);
    expect(canHostMeetings({ role: 'manager' })).toBe(false);
    expect(canHostMeetings({ role: 'support_agent' })).toBe(false);
  });

  it('is case-insensitive and safe on a missing role', () => {
    expect(canHostMeetings({ role: 'CLOSER' })).toBe(true);
    expect(canHostMeetings({})).toBe(false);
    expect(canHostMeetings(null)).toBe(false);
  });

  it('names the roles in one place so the list can be read off', () => {
    expect([...CALENDAR_ROLES].sort()).toEqual(['caller', 'closer', 'setter']);
  });
});

describe('hasTimeOfDay', () => {
  it('accepts an instant', () => {
    expect(hasTimeOfDay('2026-10-24T15:30:00.000Z')).toBe(true);
    expect(hasTimeOfDay('2026-10-24T15:30:00+03:00')).toBe(true);
    expect(hasTimeOfDay('2026-10-24 15:30')).toBe(true);
  });

  it('refuses a date with no hour in it', () => {
    // "2026-10-24" is a valid ISO date, so @IsDateString() lets it through and
    // Postgres stores midnight UTC — which the app then shows as 03:00
    // Bucharest. That is the 03:00 booking nobody picked.
    expect(hasTimeOfDay('2026-10-24')).toBe(false);
    expect(hasTimeOfDay('2026-10-24T')).toBe(false);
    expect(hasTimeOfDay('')).toBe(false);
    expect(hasTimeOfDay(undefined)).toBe(false);
  });

  it('refuses something that is not a date at all', () => {
    expect(hasTimeOfDay('mâine la 10')).toBe(false);
  });
});
