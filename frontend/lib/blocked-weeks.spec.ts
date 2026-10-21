import { describe, expect, it } from 'vitest';
import { blockWeek, copyWeek, formatWeek, weekDays, weekStartOf } from './blocked-days';

describe('blocking and copying a week', () => {
  it('finds the Monday of any day', () => {
    expect(weekStartOf('2026-10-21')).toBe('2026-10-19'); // Wednesday
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // across a month
  });

  it('blocks the whole week', () => {
    expect(blockWeek([], '2026-10-19')).toEqual(weekDays('2026-10-19'));
    expect(weekDays('2026-10-26')).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ]);
  });

  it('repeats a week on the next two', () => {
    const days = ['2026-10-24', '2026-10-25']; // that weekend
    expect(copyWeek(days, '2026-10-19', 2)).toEqual([
      '2026-10-24', '2026-10-25',
      '2026-10-31', '2026-11-01',
      '2026-11-07', '2026-11-08',
    ]);
  });

  it('makes the copies match: a day free in the source is freed in them', () => {
    const days = ['2026-10-24', '2026-10-28', '2026-10-31'];
    // Source week blocks Saturday only; the next week had Wednesday blocked.
    expect(copyWeek(days, '2026-10-19', 1)).toEqual(['2026-10-24', '2026-10-31']);
  });

  it('leaves weeks it was not asked to touch', () => {
    const days = ['2026-10-24', '2026-11-11'];
    expect(copyWeek(days, '2026-10-19', 1)).toEqual(['2026-10-24', '2026-10-31', '2026-11-11']);
  });

  it('names the week', () => {
    expect(formatWeek('2026-10-19')).toBe('19 – 25 oct.');
    expect(formatWeek('2026-10-26')).toBe('26 oct. – 1 nov.');
  });
});
