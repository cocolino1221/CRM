/**
 * Who may move, cancel or mark a booking: the closer who takes the meeting,
 * or someone who runs the team. Setters and callers create bookings but do
 * not get to rearrange a closer's day afterwards.
 */
const TEAM_LEADS = ['super_admin', 'admin', 'manager'];

export function canManageBooking(
  user: { id?: string; role?: string } | null | undefined,
  booking: { hostId?: string | null },
): boolean {
  if (!user?.id) return false;
  if (TEAM_LEADS.includes(String(user.role || '').toLowerCase())) return true;
  return !!booking.hostId && booking.hostId === user.id;
}
