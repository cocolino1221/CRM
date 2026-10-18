import { describe, expect, it } from 'vitest';
import { assignableAs, defaultSetterFor } from './team-roles';

/**
 * The lead form filtered the setter dropdown to users whose role was exactly
 * "setter". This workspace has two admins, a super_admin and two closers —
 * and nobody with that role — so the dropdown was empty and a manually added
 * lead could never be credited to anyone.
 */
const team = [
  { id: 'u-admin', role: 'admin', firstName: 'Ana', lastName: 'A' },
  { id: 'u-super', role: 'super_admin', firstName: 'Bogdan', lastName: 'B' },
  { id: 'u-manager', role: 'manager', firstName: 'Cora', lastName: 'C' },
  { id: 'u-setter', role: 'setter', firstName: 'Dan', lastName: 'D' },
  { id: 'u-closer', role: 'closer', firstName: 'Elena', lastName: 'E' },
  { id: 'u-caller', role: 'caller', firstName: 'Florin', lastName: 'F' },
  { id: 'u-support', role: 'support_agent', firstName: 'Gabi', lastName: 'G' },
];

describe('assignableAs("setter")', () => {
  it('includes the people who actually book meetings', () => {
    const ids = assignableAs(team, 'setter').map((u) => u.id);

    expect(ids).toContain('u-setter');
    expect(ids).toContain('u-caller');
  });

  // In a small team the owner adds the leads, and they are an admin.
  it('includes admins, super admins and managers', () => {
    const ids = assignableAs(team, 'setter').map((u) => u.id);

    expect(ids).toEqual(expect.arrayContaining(['u-admin', 'u-super', 'u-manager']));
  });

  it('leaves out people who do not do that job', () => {
    const ids = assignableAs(team, 'setter').map((u) => u.id);

    expect(ids).not.toContain('u-support');
  });

  it('offers closers for the closer slot, and not the other way round', () => {
    expect(assignableAs(team, 'closer').map((u) => u.id)).toContain('u-closer');
    expect(assignableAs(team, 'setter').map((u) => u.id)).not.toContain('u-closer');
  });

  it('is case-insensitive about the role, as the API has spelled it both ways', () => {
    expect(assignableAs([{ id: 'x', role: 'SETTER' }] as any, 'setter')).toHaveLength(1);
  });

  it('survives a user with no role at all', () => {
    expect(assignableAs([{ id: 'x' }] as any, 'setter')).toHaveLength(0);
    expect(assignableAs(undefined as any, 'setter')).toEqual([]);
  });
});

describe('defaultSetterFor', () => {
  // "the setter who adds it" — whoever is filling in the form.
  it('is whoever is adding the lead, when they could be a setter', () => {
    expect(defaultSetterFor(team, { id: 'u-admin', role: 'admin' } as any)).toBe('u-admin');
    expect(defaultSetterFor(team, { id: 'u-setter', role: 'setter' } as any)).toBe('u-setter');
  });

  it('leaves it empty for someone who does not do that job', () => {
    expect(defaultSetterFor(team, { id: 'u-support', role: 'support_agent' } as any)).toBe('');
  });

  it('leaves it empty when nobody is signed in yet', () => {
    expect(defaultSetterFor(team, null)).toBe('');
    expect(defaultSetterFor(team, undefined)).toBe('');
  });
});
