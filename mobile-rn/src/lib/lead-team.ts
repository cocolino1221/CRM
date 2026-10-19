/**
 * Who a lead belongs to on the team — the closer who takes the meeting and the
 * caller who rings them — as shown in the tags on each row of the lead list.
 */

export type TeamSlot = 'closer' | 'caller';

export const TEAM_SLOT_LABEL: Record<TeamSlot, string> = { closer: 'Closer', caller: 'Caller' };
export const UNASSIGNED = 'Neasignat';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; role?: string | null };

export function personName(person: Person | null | undefined): string {
  return `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
}

/** "Ana Pop", or Neasignat when nobody holds that place yet. */
export function assigneeLabel(contact: { closer?: Person | null; caller?: Person | null }, slot: TeamSlot): string {
  return personName(contact[slot]) || UNASSIGNED;
}

// A setter rings leads too, so they belong in the caller list.
const ROLES_FOR: Record<TeamSlot, string[]> = {
  closer: ['closer'],
  caller: ['caller', 'setter'],
};

/**
 * The people offered for a slot: those whose role fits, first; then everyone
 * else, so a manager who also closes can still be picked.
 */
export function candidatesFor<T extends Person>(users: T[], slot: TeamSlot): { fitting: T[]; others: T[] } {
  const wanted = ROLES_FOR[slot];
  const byName = (a: T, b: T) => personName(a).localeCompare(personName(b), 'ro');
  const active = users.filter((u) => u?.id);
  return {
    fitting: active.filter((u) => wanted.includes(String(u.role || '').toLowerCase())).sort(byName),
    others: active.filter((u) => !wanted.includes(String(u.role || '').toLowerCase())).sort(byName),
  };
}
