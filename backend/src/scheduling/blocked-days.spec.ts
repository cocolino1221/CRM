import { blockedDaysOf, hostZoneOf, isBlockedAt, isValidYmd, normalizeBlockedDays, ymdInZone } from './blocked-days';

describe('blocked days', () => {
  const now = new Date('2026-10-21T09:00:00Z');

  it('keeps real future dates, sorted and once each', () => {
    expect(normalizeBlockedDays(['2026-10-25', '2026-10-24', '2026-10-24'], now)).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('drops days already past, junk and impossible dates', () => {
    expect(normalizeBlockedDays(['2026-10-01', 'mâine', 42, '2026-02-30', null], now)).toEqual([]);
  });

  it('accepts a full ISO timestamp by its date', () => {
    expect(normalizeBlockedDays(['2026-10-24T00:00:00.000Z'], now)).toEqual(['2026-10-24']);
  });

  it('treats anything that is not a list as no days', () => {
    expect(normalizeBlockedDays('2026-10-24', now)).toEqual([]);
    expect(normalizeBlockedDays(undefined, now)).toEqual([]);
  });

  it('validates dates', () => {
    expect(isValidYmd('2026-10-24')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('24.10.2026')).toBe(false);
  });

  // 23:30 UTC on Friday is already Saturday in Bucharest: the closer's
  // calendar decides, not the server's.
  it('reads the day in the closer\'s zone', () => {
    const fridayNightUtc = new Date('2026-10-23T23:30:00Z');
    expect(ymdInZone(fridayNightUtc, 'Europe/Bucharest')).toBe('2026-10-24');
    expect(isBlockedAt(['2026-10-24'], fridayNightUtc, 'Europe/Bucharest')).toBe(true);
    expect(isBlockedAt(['2026-10-24'], fridayNightUtc, 'UTC')).toBe(false);
  });

  it('reads what is stored on the user, ignoring junk', () => {
    expect(blockedDaysOf({ preferences: { blockedDays: ['2026-10-24', 'x'] } })).toEqual(['2026-10-24']);
    expect(blockedDaysOf({ preferences: null })).toEqual([]);
    expect(blockedDaysOf(null)).toEqual([]);
  });

  it('takes the zone the hours were typed in', () => {
    expect(hostZoneOf([{ timezone: 'Europe/Bucharest' }])).toBe('Europe/Bucharest');
    expect(hostZoneOf([])).toBe('UTC');
  });
});
