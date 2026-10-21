/**
 * Whose tasks a request may see.
 *
 * Every task endpoint was workspace-wide: a closer opening the calendar in the
 * app got the whole team's call-backs — other people's leads, other people's
 * hours — and could not tell which ones were theirs. Admins and managers book
 * for the team and supervise it, so they keep the full view; everyone else
 * works their own list.
 */

const TEAM_WIDE_ROLES = ['admin', 'super_admin', 'manager'];

export function seesWholeTeam(role?: string | null): boolean {
  return TEAM_WIDE_ROLES.includes(String(role ?? '').toLowerCase());
}

/**
 * The assignee a query must be narrowed to, or `undefined` for the whole team.
 *
 * A requested `assigneeId` is honoured only for the roles that may see others;
 * for everyone else it is replaced by their own id rather than refused, so a
 * stale client cannot read a colleague's list by passing their id.
 */
export function taskAssigneeScope(
  user: { id?: string; role?: string } | null | undefined,
  requested?: string,
): string | undefined {
  if (seesWholeTeam(user?.role)) return requested;
  return user?.id;
}
