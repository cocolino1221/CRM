import { describe, expect, it } from 'vitest';
import { TEAM_FIELD, TEAM_SLOTS, assigneeId, assigneeLabel, candidatesFor, lastNoteLine } from './lead-team';

describe('the setter place', () => {
  it('sits between closer and caller', () => {
    expect(TEAM_SLOTS).toEqual(['closer', 'setter', 'caller']);
  });

  it('is saved as setterId and read back', () => {
    expect(TEAM_FIELD.setter).toBe('setterId');
    expect(assigneeId({ setterId: 's1' }, 'setter')).toBe('s1');
    expect(assigneeId({}, 'setter')).toBeNull();
    expect(assigneeLabel({ setter: { firstName: 'Sabine', lastName: 'K' } }, 'setter')).toBe('Sabine K');
  });

  it('offers setters first', () => {
    const users = [
      { id: '1', firstName: 'Ion', role: 'caller' },
      { id: '2', firstName: 'Dan', role: 'setter' },
    ];
    expect(candidatesFor(users, 'setter').fitting.map((u) => u.id)).toEqual(['2']);
  });
});

describe('lastNoteLine', () => {
  it('shows the note with who wrote it and when', () => {
    const line = lastNoteLine({ text: 'E deja in echipa', at: '2026-10-21T12:47:40Z', by: 'Maria Teslariu' });
    expect(line?.startsWith('E deja in echipa — Maria, 21')).toBe(true);
  });

  it('flattens line breaks and skips empty notes', () => {
    expect(lastNoteLine({ text: 'a\n\nb', at: '' })).toBe('a b');
    expect(lastNoteLine({ text: '   ', at: '2026-10-21' })).toBeNull();
    expect(lastNoteLine(null)).toBeNull();
  });
});
