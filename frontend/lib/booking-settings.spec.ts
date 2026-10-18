import { describe, expect, it } from 'vitest';
import {
  buildMeetingSlug,
  cellState,
  defaultWeek,
  emptyWeek,
  intervalToUnits,
  isValidTime,
  planAvailabilityChanges,
  rangeUnits,
  slugify,
  toMinutes,
  unitsToIntervals,
  weekFromRows,
  WEEKDAYS,
  type Weekday,
} from './booking-settings';

describe('WEEKDAYS', () => {
  it('starts the week on Monday and covers all seven days', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0].value).toBe('monday');
    expect(WEEKDAYS[6].value).toBe('sunday');
  });
});

describe('isValidTime', () => {
  it('accepts the shapes the backend accepts', () => {
    expect(isValidTime('09:00')).toBe(true);
    expect(isValidTime('9:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('09:60')).toBe(false);
    expect(isValidTime('9')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });
});

const h = (time: string) => toMinutes(time);

describe('unitsToIntervals', () => {
  it('merges contiguous units and splits at gaps', () => {
    const units = [...rangeUnits(h('09:00'), h('10:00')), ...rangeUnits(h('11:30'), h('12:30'))];
    expect(unitsToIntervals(units)).toEqual([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '11:30', endTime: '12:30' },
    ]);
  });

  it('is order-independent', () => {
    expect(unitsToIntervals([h('09:15'), h('09:00')])).toEqual([{ startTime: '09:00', endTime: '09:30' }]);
  });

  // The backend refuses 24:00, so a day that runs to midnight is stored as 23:59.
  it('writes midnight as 23:59', () => {
    expect(unitsToIntervals([h('23:45')])).toEqual([{ startTime: '23:45', endTime: '23:59' }]);
  });

  it('returns nothing for an empty day', () => {
    expect(unitsToIntervals([])).toEqual([]);
  });
});

describe('intervalToUnits', () => {
  it('round-trips with unitsToIntervals, midnight included', () => {
    const interval = { startTime: '22:00', endTime: '23:59' };
    expect(unitsToIntervals(intervalToUnits(interval))).toEqual([interval]);
  });

  // An hour typed before the grid existed must never be widened.
  it('only keeps units wholly inside an off-grid interval', () => {
    expect(intervalToUnits({ startTime: '09:10', endTime: '10:05' })).toEqual([h('09:15'), h('09:30'), h('09:45')]);
  });

  it('accepts the HH:MM:SS the time column returns', () => {
    expect(intervalToUnits({ startTime: '09:00:00', endTime: '09:30:00' })).toEqual([h('09:00'), h('09:15')]);
  });
});

describe('weekFromRows / defaultWeek', () => {
  it('collects several windows on one day', () => {
    const week = weekFromRows([
      { dayOfWeek: 'monday', startTime: '09:00:00', endTime: '10:00:00' },
      { dayOfWeek: 'monday', startTime: '11:30:00', endTime: '12:30:00' },
    ]);
    expect(week.monday.size).toBe(8);
    expect(week.tuesday.size).toBe(0);
  });

  it('starts with weekdays nine to five and the weekend off', () => {
    const week = defaultWeek();
    expect(unitsToIntervals(week.friday)).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
    expect(week.saturday.size).toBe(0);
  });
});

describe('cellState', () => {
  const units = new Set([h('09:00'), h('09:15'), h('09:30')]);
  it('reports a half-selected coarse cell as partial', () => {
    expect(cellState(units, h('09:00'), 30)).toBe('all');
    expect(cellState(units, h('09:30'), 30)).toBe('some');
    expect(cellState(units, h('10:00'), 30)).toBe('none');
  });
});

describe('planAvailabilityChanges', () => {
  const week = (rows: Array<[Weekday, string, string]>) => {
    const w = emptyWeek();
    for (const [day, start, end] of rows) for (const m of rangeUnits(h(start), h(end))) w[day].add(m);
    return w;
  };

  it('creates every window of a split day', () => {
    const plan = planAvailabilityChanges([], week([['monday', '09:00', '10:00'], ['monday', '11:30', '12:30']]));
    expect(plan.create).toEqual([
      { dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', isActive: true },
      { dayOfWeek: 'monday', startTime: '11:30', endTime: '12:30', isActive: true },
    ]);
    expect(plan.remove).toEqual([]);
  });

  it('leaves a row that already matches alone, even as HH:MM:SS', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'monday', startTime: '09:00:00', endTime: '17:00:00' }],
      week([['monday', '09:00', '17:00']]),
    );
    expect(plan).toEqual({ create: [], remove: [] });
  });

  it('replaces a window whose hours moved', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }],
      week([['monday', '09:00', '12:00']]),
    );
    expect(plan.remove).toEqual(['a1']);
    expect(plan.create).toEqual([{ dayOfWeek: 'monday', startTime: '09:00', endTime: '12:00', isActive: true }]);
  });

  // The public page reads these rows, so a day cleared in the grid must vanish.
  it('deletes a cleared day', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'sunday', startTime: '10:00', endTime: '12:00' }],
      emptyWeek(),
    );
    expect(plan.remove).toEqual(['a1']);
  });

  it('drops a duplicate of a row it keeps', () => {
    const row = { dayOfWeek: 'monday' as const, startTime: '09:00', endTime: '10:00' };
    const plan = planAvailabilityChanges([{ id: 'a', ...row }, { id: 'b', ...row }], week([['monday', '09:00', '10:00']]));
    expect(plan).toEqual({ create: [], remove: ['b'] });
  });

  // Two adjacent rows would make a straddling booking fail server-side.
  it('merges what were two adjacent rows into one', () => {
    const plan = planAvailabilityChanges(
      [
        { id: 'a', dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00' },
        { id: 'b', dayOfWeek: 'monday', startTime: '10:00', endTime: '11:00' },
      ],
      week([['monday', '09:00', '11:00']]),
    );
    expect(plan.remove).toEqual(['a', 'b']);
    expect(plan.create).toEqual([{ dayOfWeek: 'monday', startTime: '09:00', endTime: '11:00', isActive: true }]);
  });
});

describe('slugify', () => {
  it('flattens Romanian diacritics rather than dropping them', () => {
    expect(slugify('Consultație gratuită')).toBe('consultatie-gratuita');
    expect(slugify('Ședință')).toBe('sedinta');
  });

  it('collapses punctuation and trims the edges', () => {
    expect(slugify('  Apel — 30 min!  ')).toBe('apel-30-min');
  });

  it('returns empty for a name with nothing usable in it', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('buildMeetingSlug', () => {
  // The column is unique across every workspace, not per workspace.
  it('always appends the suffix that keeps it unique', () => {
    expect(buildMeetingSlug('Consultație', 'ab12cd')).toBe('consultatie-ab12cd');
  });

  it('falls back to a usable base when the name has no letters', () => {
    expect(buildMeetingSlug('???', 'ab12cd')).toBe('consultatie-ab12cd');
  });
});
