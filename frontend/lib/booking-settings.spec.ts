import { describe, expect, it } from 'vitest';
import {
  buildMeetingSlug,
  dayError,
  isValidTime,
  planAvailabilityChanges,
  slugify,
  WEEKDAYS,
  type DayRow,
} from './booking-settings';

const row = (over: Partial<DayRow> = {}): DayRow => ({
  dayOfWeek: 'monday',
  startTime: '09:00',
  endTime: '17:00',
  enabled: true,
  ...over,
});

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

describe('dayError', () => {
  it('passes a normal working day', () => {
    expect(dayError(row())).toBeNull();
  });

  // A day that is not worked cannot be wrong, whatever is left in its inputs.
  it('never complains about a day that is switched off', () => {
    expect(dayError(row({ enabled: false, startTime: 'nonsense', endTime: '' }))).toBeNull();
  });

  it('catches an end that is not after the start', () => {
    expect(dayError(row({ startTime: '17:00', endTime: '09:00' }))).toMatch(/după/);
    expect(dayError(row({ startTime: '09:00', endTime: '09:00' }))).toMatch(/după/);
  });

  it('catches a malformed hour', () => {
    expect(dayError(row({ endTime: '25:00' }))).toMatch(/HH:MM/);
  });
});

describe('planAvailabilityChanges', () => {
  it('creates a day that the closer has just switched on', () => {
    const plan = planAvailabilityChanges([], [row()]);

    expect(plan.create).toEqual([
      { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00', isActive: true },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('updates a day whose hours moved', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }],
      [row({ endTime: '18:00' })],
    );

    expect(plan.update).toEqual([{ id: 'a1', startTime: '09:00', endTime: '18:00', isActive: true }]);
    expect(plan.create).toEqual([]);
  });

  it('leaves an unchanged day completely alone', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }],
      [row()],
    );

    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  // The public page reads these rows, so a day switched off has to disappear.
  it('deletes a day that was switched off', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'a1', dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }],
      [row({ enabled: false })],
    );

    expect(plan.remove).toEqual(['a1']);
    expect(plan.create).toEqual([]);
  });

  it('deletes a stale row for a weekday the form does not show', () => {
    const plan = planAvailabilityChanges(
      [{ id: 'ghost', dayOfWeek: 'sunday', startTime: '10:00', endTime: '12:00' }],
      [row()],
    );

    expect(plan.remove).toEqual(['ghost']);
  });

  it('handles a whole week at once', () => {
    const existing = [
      { id: 'mon', dayOfWeek: 'monday' as const, startTime: '09:00', endTime: '17:00' },
      { id: 'tue', dayOfWeek: 'tuesday' as const, startTime: '09:00', endTime: '17:00' },
    ];
    const desired = [
      row({ dayOfWeek: 'monday', endTime: '16:00' }),
      row({ dayOfWeek: 'tuesday', enabled: false }),
      row({ dayOfWeek: 'wednesday' }),
    ];

    const plan = planAvailabilityChanges(existing, desired);

    expect(plan.update.map((u) => u.id)).toEqual(['mon']);
    expect(plan.remove).toEqual(['tue']);
    expect(plan.create.map((c) => c.dayOfWeek)).toEqual(['wednesday']);
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
