import { describe, expect, it } from 'vitest';
import { emptyWeek, planAvailabilityChanges, weekFromRows } from './booking-settings';

describe('a week with no hours at all', () => {
  const rows = [{ id: 'r1', dayOfWeek: 'monday' as const, startTime: '09:00', endTime: '17:00' }];
  const marker = { id: 'm1', dayOfWeek: 'monday' as const, startTime: '00:00', endTime: '00:15', isActive: false };

  it('keeps a closed-week marker instead of deleting every row', () => {
    const change = planAvailabilityChanges(rows, emptyWeek());
    expect(change.remove).toEqual(['r1']);
    expect(change.create).toEqual([{ dayOfWeek: 'monday', startTime: '00:00', endTime: '00:15', isActive: false }]);
  });

  it('reads the marker back as an empty week, not the default one', () => {
    const week = weekFromRows([marker]);
    expect(Object.values(week).every((units) => units.size === 0)).toBe(true);
  });

  it('saves nothing new when the week stays closed', () => {
    expect(planAvailabilityChanges([marker], emptyWeek())).toEqual({ create: [], remove: [] });
  });

  it('drops the marker once hours come back', () => {
    const week = weekFromRows([{ dayOfWeek: 'tuesday', startTime: '10:00', endTime: '11:00' }]);
    const change = planAvailabilityChanges([marker], week);
    expect(change.remove).toEqual(['m1']);
    expect(change.create).toEqual([{ dayOfWeek: 'tuesday', startTime: '10:00', endTime: '11:00', isActive: true }]);
  });
});
