/**
 * Who a lead belongs to on the team — the closer who takes the meeting and the
 * caller who rings them — as shown in the tags on each row of the lead list.
 */

export type TeamSlot = 'closer' | 'setter' | 'caller';

export const TEAM_SLOTS: TeamSlot[] = ['closer', 'setter', 'caller'];

export const TEAM_SLOT_LABEL: Record<TeamSlot, string> = { closer: 'Closer', setter: 'Setter', caller: 'Caller' };
export const UNASSIGNED = 'Neasignat';

type Person = { id?: string; firstName?: string | null; lastName?: string | null; role?: string | null };

export function personName(person: Person | null | undefined): string {
  return `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
}

/** "Ana Pop", or Neasignat when nobody holds that place yet. */
export function assigneeLabel(
  contact: { closer?: Person | null; setter?: Person | null; caller?: Person | null },
  slot: TeamSlot,
): string {
  return personName(contact[slot]) || UNASSIGNED;
}

// A setter rings leads too, so they belong in the caller list.
const ROLES_FOR: Record<TeamSlot, string[]> = {
  closer: ['closer'],
  setter: ['setter'],
  caller: ['caller', 'setter'],
};

/** The id field each place is saved under. */
export const TEAM_FIELD: Record<TeamSlot, 'closerId' | 'setterId' | 'callerId'> = {
  closer: 'closerId',
  setter: 'setterId',
  caller: 'callerId',
};

/** Who holds that place on the lead, or null. */
export function assigneeId(
  contact: { closerId?: string | null; setterId?: string | null; callerId?: string | null },
  slot: TeamSlot,
): string | null {
  return contact[TEAM_FIELD[slot]] ?? null;
}

export interface LastNote {
  text: string;
  at: string;
  by?: string | null;
}

/** "E deja in echipa — Maria, 21 oct." for the line under a lead's name. */
export function lastNoteLine(note: LastNote | null | undefined): string | null {
  const text = String(note?.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const when = note?.at ? new Date(note.at) : null;
  const day =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
      : '';
  const first = String(note?.by || '').trim().split(' ')[0];
  const tail = [first, day].filter(Boolean).join(', ');
  return tail ? `${text} — ${tail}` : text;
}

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
