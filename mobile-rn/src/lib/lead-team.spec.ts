import { describe, expect, it } from 'vitest';
import { assigneeLabel, candidatesFor, UNASSIGNED } from './lead-team';

describe('assigneeLabel', () => {
  it('names the person in that place', () => {
    expect(assigneeLabel({ closer: { firstName: 'Ana', lastName: 'Pop' } }, 'closer')).toBe('Ana Pop');
  });

  // The default the list shows before anyone is picked.
  it('says Neasignat when nobody is assigned', () => {
    expect(assigneeLabel({}, 'closer')).toBe(UNASSIGNED);
    expect(assigneeLabel({ caller: null }, 'caller')).toBe(UNASSIGNED);
    expect(assigneeLabel({ caller: { firstName: ' ', lastName: '' } }, 'caller')).toBe(UNASSIGNED);
  });
});

describe('candidatesFor', () => {
  const users = [
    { id: '1', firstName: 'Zoe', lastName: '', role: 'closer' },
    { id: '2', firstName: 'Ana', lastName: '', role: 'CLOSER' },
    { id: '3', firstName: 'Ion', lastName: '', role: 'caller' },
    { id: '4', firstName: 'Dan', lastName: '', role: 'setter' },
    { id: '5', firstName: 'Mara', lastName: '', role: 'manager' },
  ];

  it('puts closers first, by name, for the closer tag', () => {
    const { fitting, others } = candidatesFor(users, 'closer');
    expect(fitting.map((u) => u.id)).toEqual(['2', '1']);
    expect(others.map((u) => u.id)).toEqual(['4', '3', '5']);
  });

  it('counts setters as callers', () => {
    expect(candidatesFor(users, 'caller').fitting.map((u) => u.id)).toEqual(['4', '3']);
  });
});
