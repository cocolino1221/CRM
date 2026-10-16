import { dayRangeInTimeZone } from './day-range.util';

describe('dayRangeInTimeZone', () => {
  it('spans local midnight to local end-of-day for Bucharest in summer (UTC+3)', () => {
    // 2026-08-26T12:00Z is 15:00 in Bucharest, so the local day is 26 August.
    const { start, end } = dayRangeInTimeZone(new Date('2026-08-26T12:00:00Z'), 'Europe/Bucharest');

    expect(start.toISOString()).toBe('2026-08-25T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-26T20:59:59.999Z');
  });

  it('uses the winter offset for Bucharest (UTC+2)', () => {
    const { start, end } = dayRangeInTimeZone(new Date('2026-01-15T12:00:00Z'), 'Europe/Bucharest');

    expect(start.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-15T21:59:59.999Z');
  });

  // The case that makes this worth having: a call placed late in the evening
  // in Bucharest falls on the next UTC day, and a server-clock range would
  // report it on the wrong day.
  it('puts a 23:30 Bucharest call on that local day, not the next UTC one', () => {
    const lateCall = new Date('2026-08-26T20:30:00Z'); // 23:30 in Bucharest
    const { start, end } = dayRangeInTimeZone(lateCall, 'Europe/Bucharest');

    expect(lateCall >= start && lateCall <= end).toBe(true);
    expect(start.toISOString()).toBe('2026-08-25T21:00:00.000Z');
  });

  it('falls back to UTC for an unknown zone', () => {
    const { start, end } = dayRangeInTimeZone(new Date('2026-08-26T12:00:00Z'), 'Not/AZone');

    expect(start.toISOString()).toBe('2026-08-26T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-26T23:59:59.999Z');
  });

  it('treats UTC as a zone like any other', () => {
    const { start } = dayRangeInTimeZone(new Date('2026-08-26T12:00:00Z'), 'UTC');
    expect(start.toISOString()).toBe('2026-08-26T00:00:00.000Z');
  });
});
