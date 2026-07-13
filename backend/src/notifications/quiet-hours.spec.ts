import { isWithinQuietHours } from './quiet-hours';

// Build a Date whose wall-clock time in the given IANA tz is hh:mm.
function atTz(tz: string, hh: number, mm: number): Date {
  // 2026-06-15 is DST-active for Europe/Bucharest; pick a fixed day.
  const iso = `2026-06-15T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  // Interpret iso as wall time in tz by measuring tz offset at that instant.
  const asUtc = new Date(iso + 'Z');
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(asUtc).find((p) => p.type === 'timeZoneName')!.value; // e.g. "GMT+3"
  const offsetH = Number(tzName.replace('GMT', '')) || 0;
  return new Date(asUtc.getTime() - offsetH * 3600 * 1000);
}

describe('isWithinQuietHours', () => {
  const tz = 'Europe/Bucharest';
  it('returns false when disabled or missing', () => {
    expect(isWithinQuietHours(undefined)).toBe(false);
    expect(isWithinQuietHours({ enabled: false, start: '22:00', end: '08:00', timezone: tz })).toBe(false);
  });
  it('handles an overnight window (22:00–08:00)', () => {
    const q = { enabled: true, start: '22:00', end: '08:00', timezone: tz };
    expect(isWithinQuietHours(q, atTz(tz, 23, 30))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 2, 0))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 7, 59))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 8, 0))).toBe(false);
    expect(isWithinQuietHours(q, atTz(tz, 12, 0))).toBe(false);
  });
  it('handles a same-day window (13:00–14:00)', () => {
    const q = { enabled: true, start: '13:00', end: '14:00', timezone: tz };
    expect(isWithinQuietHours(q, atTz(tz, 13, 30))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 14, 1))).toBe(false);
    expect(isWithinQuietHours(q, atTz(tz, 9, 0))).toBe(false);
  });
  it('returns false for an invalid timezone instead of throwing', () => {
    const q = { enabled: true, start: '22:00', end: '08:00', timezone: 'Not/AZone' };
    expect(isWithinQuietHours(q, new Date('2026-06-15T23:30:00Z'))).toBe(false);
  });
  it('returns false when quietHours is null', () => {
    expect(isWithinQuietHours(null)).toBe(false);
  });
});
