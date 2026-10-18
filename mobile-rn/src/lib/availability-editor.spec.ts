import { describe, expect, it } from 'vitest';
import { emptyWeek, rangeUnits, unitsToIntervals, type WeekUnits } from './booking-settings';
import {
  clearDay,
  copyDayToWorkdays,
  daySummary,
  needsFullDay,
  toggleCell,
  validateMeeting,
  weekHours,
} from './availability-editor';

const week = (fill: Partial<Record<keyof WeekUnits, number[]>>): WeekUnits => {
  const w = emptyWeek();
  for (const [day, units] of Object.entries(fill)) w[day as keyof WeekUnits] = new Set(units);
  return w;
};

const at = (h: number, m = 0) => h * 60 + m;

describe('toggleCell', () => {
  it('fills an empty cell at the chosen step', () => {
    const next = toggleCell(emptyWeek(), 'monday', at(9), 60);

    expect([...next.monday].sort((a, b) => a - b)).toEqual(rangeUnits(at(9), at(10)));
  });

  it('clears a cell that is already full', () => {
    const next = toggleCell(week({ monday: rangeUnits(at(9), at(10)) }), 'monday', at(9), 60);

    expect(next.monday.size).toBe(0);
  });

  it('fills the rest of a half-selected cell rather than clearing it', () => {
    const half = week({ monday: [at(9), at(9, 15)] });

    const next = toggleCell(half, 'monday', at(9), 60);

    expect([...next.monday].sort((a, b) => a - b)).toEqual(rangeUnits(at(9), at(10)));
  });

  it('leaves the other days and the original week alone', () => {
    const before = week({ monday: rangeUnits(at(9), at(10)), tuesday: rangeUnits(at(14), at(15)) });

    const next = toggleCell(before, 'monday', at(11), 30);

    expect([...next.tuesday]).toEqual([...before.tuesday]);
    expect([...before.monday].sort((a, b) => a - b)).toEqual(rangeUnits(at(9), at(10)));
  });
});

describe('copyDayToWorkdays', () => {
  it('copies one day onto Monday through Friday and leaves the weekend as it was', () => {
    const before = week({ monday: rangeUnits(at(9), at(10)), sunday: rangeUnits(at(12), at(13)) });

    const next = copyDayToWorkdays(before, 'monday');

    for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const) {
      expect([...next[day]].sort((a, b) => a - b)).toEqual(rangeUnits(at(9), at(10)));
    }
    expect([...next.sunday].sort((a, b) => a - b)).toEqual(rangeUnits(at(12), at(13)));
    expect(next.saturday.size).toBe(0);
  });

  it('copies an empty day too, clearing the week', () => {
    const next = copyDayToWorkdays(week({ tuesday: rangeUnits(at(9), at(17)) }), 'monday');

    expect(next.tuesday.size).toBe(0);
  });

  it('does not share the set between days', () => {
    const next = copyDayToWorkdays(week({ monday: rangeUnits(at(9), at(10)) }), 'monday');

    next.tuesday.add(at(20));

    expect(next.monday.has(at(20))).toBe(false);
  });
});

describe('clearDay', () => {
  it('empties one day only', () => {
    const next = clearDay(week({ monday: rangeUnits(at(9), at(10)), friday: [at(9)] }), 'monday');

    expect(next.monday.size).toBe(0);
    expect([...next.friday]).toEqual([at(9)]);
  });
});

describe('daySummary', () => {
  it('reads out every window of the day', () => {
    const units = [...rangeUnits(at(9), at(12)), ...rangeUnits(at(14), at(17))];

    expect(daySummary(new Set(units))).toBe('09:00–12:00 · 14:00–17:00');
  });

  it('says so when the day is free', () => {
    expect(daySummary(new Set())).toBe('Liber');
  });

  it('shows a day that runs to midnight as 24:00, the way it is read back', () => {
    // The hours column cannot hold 24:00, so midnight is stored as 23:59 and
    // read back as midnight. Printing 23:59 would look like a typo.
    const units = rangeUnits(at(23), 24 * 60);

    expect(unitsToIntervals(units)[0].endTime).toBe('23:59');
    expect(daySummary(new Set(units))).toBe('23:00–24:00');
  });
});

describe('weekHours', () => {
  it('counts the quarter hours, not the windows', () => {
    const w = week({ monday: rangeUnits(at(9), at(17)), saturday: [at(10)] });

    expect(weekHours(w)).toBe(8.25);
  });

  it('is zero for an untouched week', () => {
    expect(weekHours(emptyWeek())).toBe(0);
  });
});

describe('validateMeeting', () => {
  it('accepts a named meeting with a sane duration', () => {
    expect(validateMeeting('Consultație', 30)).toBeNull();
  });

  it('demands a name', () => {
    expect(validateMeeting('   ', 30)).toBe('Pune un nume întâlnirii.');
  });

  it('rejects a duration the server would refuse', () => {
    expect(validateMeeting('Consultație', 0)).toBe('Durata trebuie între 5 și 480 de minute.');
    expect(validateMeeting('Consultație', 500)).toBe('Durata trebuie între 5 și 480 de minute.');
    expect(validateMeeting('Consultație', 30.5)).toBe('Durata trebuie între 5 și 480 de minute.');
  });
});

describe('needsFullDay', () => {
  it('is false for a week inside the visible window', () => {
    expect(needsFullDay(week({ monday: rangeUnits(at(9), at(17)) }))).toBe(false);
  });

  it('is true for an early start the narrow window would hide', () => {
    // A 06:00 window saved on the web grid must not be invisible here: the
    // save replaces whatever the grid does not show, so hiding it deletes it.
    expect(needsFullDay(week({ monday: rangeUnits(at(6), at(8)) }))).toBe(true);
  });

  it('is true for a late finish', () => {
    expect(needsFullDay(week({ sunday: [at(22)] }))).toBe(true);
  });

  it('counts the last visible quarter as visible', () => {
    expect(needsFullDay(week({ friday: [at(21, 45)] }))).toBe(false);
  });
});
