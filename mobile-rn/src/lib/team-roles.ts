/**
 * Who may be credited with a lead.
 *
 * The lead form filtered each dropdown to the one role that shares its name —
 * setters for the setter slot, and so on. In a workspace with two admins, a
 * super_admin and two closers, and nobody holding the literal role "setter",
 * that produced an empty dropdown: a manually added lead could not be
 * credited to anyone, including the person adding it.
 *
 * Roles here describe permissions, not job descriptions. In a small team the
 * owner books the meetings and the owner is an admin.
 */

export interface TeamMember {
  id: string;
  role?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export type TeamSlot = 'setter' | 'caller' | 'closer';

/** Whoever runs the workspace can stand in for any of these jobs. */
const ALWAYS = ['admin', 'super_admin', 'manager', 'owner'];

const ELIGIBLE: Record<TeamSlot, string[]> = {
  // A caller books meetings too; a closer does not, and crediting them here
  // is how the numbers for the two jobs get mixed up.
  setter: [...ALWAYS, 'setter', 'caller', 'sales_rep'],
  caller: [...ALWAYS, 'caller', 'setter', 'sales_rep'],
  closer: [...ALWAYS, 'closer', 'sales_rep'],
};

export function assignableAs(team: TeamMember[] | null | undefined, slot: TeamSlot): TeamMember[] {
  if (!Array.isArray(team)) return [];
  const allowed = ELIGIBLE[slot] ?? [];
  // The API has returned roles in both cases over time.
  return team.filter((user) => allowed.includes(String(user?.role ?? '').toLowerCase()));
}

/**
 * The setter a manually added lead starts with: the person filling in the
 * form, which is what "the setter who added it" means in practice. Returns
 * '' when that person does not do the job, so nothing is credited falsely.
 */
export function defaultSetterFor(
  team: TeamMember[] | null | undefined,
  currentUser: TeamMember | null | undefined,
): string {
  if (!currentUser?.id) return '';
  const allowed = ELIGIBLE.setter.includes(String(currentUser.role ?? '').toLowerCase());
  return allowed ? currentUser.id : '';
}
