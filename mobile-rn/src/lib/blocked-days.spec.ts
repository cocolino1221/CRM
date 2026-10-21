import { describe, expect, it } from 'vitest';
import { addDays, formatBlockedDay, isPastDay, monthGrid, nextWeekend, toggleDay, toYmd, upcomingDays } from './blocked-days';

describe('blocked days', () => {
  it('lays October 2026 out from Monday', () => {
    const weeks = monthGrid(2026, 9);
    // 1 Oct 2026 is a Thursday: three empty cells first.
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('toggles a day on and off', () => {
    const on = toggleDay(['2026-10-25'], '2026-10-24');
    expect(on).toEqual(['2026-10-24', '2026-10-25']);
    expect(toggleDay(on, '2026-10-24')).toEqual(['2026-10-25']);
  });

  it('finds the coming weekend', () => {
    expect(nextWeekend(new Date(2026, 9, 21))).toEqual(['2026-10-24', '2026-10-25']); // Wednesday
    expect(nextWeekend(new Date(2026, 9, 24))).toEqual(['2026-10-24', '2026-10-25']); // Saturday
    expect(nextWeekend(new Date(2026, 9, 25))).toEqual(['2026-10-25']); // Sunday
  });

  it('adds days without duplicates', () => {
    expect(addDays(['2026-10-24'], ['2026-10-24', '2026-10-25'])).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('knows past days and keeps only what is ahead', () => {
    const now = new Date(2026, 9, 21, 15);
    expect(isPastDay('2026-10-20', now)).toBe(true);
    expect(isPastDay('2026-10-21', now)).toBe(false);
    expect(upcomingDays(['2026-10-25', '2026-10-01', '2026-10-21'], now)).toEqual(['2026-10-21', '2026-10-25']);
  });

  it('writes the day the Romanian way, in local time', () => {
    expect(formatBlockedDay('2026-10-24')).toBe('sâm. 24 oct.');
    expect(toYmd(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
