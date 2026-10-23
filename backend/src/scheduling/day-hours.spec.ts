import { applyDayHoursChanges, cleanIntervals, dayHoursOf, overrideRowsFor, withinIntervals } from './day-hours';

describe('hours for one date', () => {
  const now = new Date('2026-10-23T09:00:00Z');

  it('keeps real windows, sorted', () => {
    expect(
      cleanIntervals([
        { startTime: '14:00', endTime: '16:00' },
        { startTime: '10:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '11:00' },
        { startTime: '9', endTime: '10:00' },
        'junk',
      ]),
    ).toEqual([
      { startTime: '10:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '16:00' },
    ]);
    expect(cleanIntervals('nope')).toEqual([]);
  });

  it('sets a date, empties one, and removes one', () => {
    const start = { '2026-10-30': [{ startTime: '09:00', endTime: '17:00' }], '2026-10-31': [] };
    const next = applyDayHoursChanges(
      start,
      [
        { date: '2026-10-24', intervals: [{ startTime: '10:00', endTime: '14:00' }] },
        { date: '2026-10-31', intervals: null },
        { date: '2026-11-02', intervals: [] },
      ],
      now,
    );
    expect(next).toEqual({
      '2026-10-24': [{ startTime: '10:00', endTime: '14:00' }],
      '2026-10-30': [{ startTime: '09:00', endTime: '17:00' }],
      '2026-11-02': [],
    });
  });

  it('drops past dates and bad keys', () => {
    expect(applyDayHoursChanges({ '2026-10-01': [] }, [{ date: '31.10.2026', intervals: [] }], now)).toEqual({});
  });

  it('gives the windows of a date with its own hours, in the host zone', () => {
    const user = {
      preferences: { dayHours: { '2026-10-30': [{ startTime: '10:00', endTime: '14:00' }] }, dayHoursZone: 'Europe/Bucharest' },
    };
    expect(overrideRowsFor(user, '2026-10-30')).toEqual([
      { startTime: '10:00', endTime: '14:00', timezone: 'Europe/Bucharest' },
    ]);
    expect(overrideRowsFor(user, '2026-10-29')).toBeNull();
    expect(overrideRowsFor({ preferences: { dayHours: { '2026-10-30': [] } } }, '2026-10-30')).toEqual([]);
  });

  it('reads what is stored, ignoring junk', () => {
    expect(dayHoursOf({ preferences: { dayHours: { x: [], '2026-10-30': [{ startTime: '10:00', endTime: '11:00' }] } } })).toEqual({
      '2026-10-30': [{ startTime: '10:00', endTime: '11:00' }],
    });
    expect(dayHoursOf(null)).toEqual({});
  });

  it('checks a meeting fits a window', () => {
    const windows = [{ startTime: '10:00', endTime: '12:00' }];
    expect(withinIntervals(windows, 600, 630)).toBe(true);
    expect(withinIntervals(windows, 700, 730)).toBe(false);
  });
});
