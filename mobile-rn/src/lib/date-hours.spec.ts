import { describe, expect, it } from 'vitest';
import { emptyWeek, unitsToIntervals } from './booking-settings';
import {
  clearDate,
  copyDateTo,
  dateChip,
  dateTitle,
  dateUnitsFrom,
  dayHoursChanges,
  resetDate,
  toggleDateCell,
  unitsForDate,
  weekdayOf,
} from './date-hours';

const week = () => {
  const w = emptyWeek();
  for (let m = 9 * 60; m < 17 * 60; m += 15) w.friday.add(m);
  return w;
};

describe('hours for one date', () => {
  it('knows the weekday and writes the date', () => {
    expect(weekdayOf('2026-10-23')).toBe('friday');
    expect(weekdayOf('2026-10-25')).toBe('sunday');
    expect(dateChip('2026-10-30')).toEqual({ day: 'Vin', date: '30' });
    expect(dateTitle('2026-10-30')).toBe('Vineri, 30 oct.');
  });

  it('shows the weekday hours until the date gets its own', () => {
    const w = week();
    expect(unitsToIntervals(unitsForDate('2026-10-30', w, {}))).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
    const dated = dateUnitsFrom({ '2026-10-30': [{ startTime: '10:00', endTime: '12:00' }] });
    expect(unitsToIntervals(unitsForDate('2026-10-30', w, dated))).toEqual([{ startTime: '10:00', endTime: '12:00' }]);
    expect(unitsToIntervals(unitsForDate('2026-10-23', w, dated))).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
  });

  it('edits one date without touching the same weekday elsewhere', () => {
    const w = week();
    const dated = toggleDateCell({}, '2026-10-30', w, 9 * 60, 60);
    expect(unitsToIntervals(dated['2026-10-30'])).toEqual([{ startTime: '10:00', endTime: '17:00' }]);
    expect(dated['2026-10-23']).toBeUndefined();
    expect(unitsToIntervals(w.friday)).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
  });

  it('clears a date, resets it to the week, and copies it', () => {
    const w = week();
    expect(clearDate({}, '2026-10-30')['2026-10-30'].size).toBe(0);
    expect(resetDate({ '2026-10-30': new Set() }, '2026-10-30')).toEqual({});
    const copied = copyDateTo({}, '2026-10-30', w, ['2026-10-26', '2026-10-30']);
    expect(Object.keys(copied)).toEqual(['2026-10-26']);
    expect(unitsToIntervals(copied['2026-10-26'])).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
  });

  it('sends only what changed, null for a date reset to the week', () => {
    const saved = dateUnitsFrom({ '2026-10-24': [{ startTime: '10:00', endTime: '12:00' }], '2026-10-25': [] });
    const edited = { ...dateUnitsFrom({ '2026-10-24': [{ startTime: '10:00', endTime: '12:00' }] }), ...dateUnitsFrom({ '2026-10-30': [{ startTime: '14:00', endTime: '15:00' }] }) };
    expect(dayHoursChanges(saved, edited)).toEqual([
      { date: '2026-10-25', intervals: null },
      { date: '2026-10-30', intervals: [{ startTime: '14:00', endTime: '15:00' }] },
    ]);
  });
});
