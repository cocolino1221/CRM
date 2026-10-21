import { seesWholeTeam, taskAssigneeScope } from './task-scope';

describe('task scope', () => {
  it('lets admins, super admins and managers see the team', () => {
    expect(seesWholeTeam('admin')).toBe(true);
    expect(seesWholeTeam('super_admin')).toBe(true);
    expect(seesWholeTeam('Manager')).toBe(true);
  });

  it('narrows everyone else', () => {
    expect(seesWholeTeam('closer')).toBe(false);
    expect(seesWholeTeam('setter')).toBe(false);
    expect(seesWholeTeam(undefined)).toBe(false);
  });

  it('keeps an admin filter on a colleague', () => {
    expect(taskAssigneeScope({ id: 'me', role: 'admin' }, 'colleague')).toBe('colleague');
    expect(taskAssigneeScope({ id: 'me', role: 'admin' })).toBeUndefined();
  });

  it('replaces a closer asking for a colleague with themselves', () => {
    expect(taskAssigneeScope({ id: 'me', role: 'closer' }, 'colleague')).toBe('me');
    expect(taskAssigneeScope({ id: 'me', role: 'closer' })).toBe('me');
  });
});
