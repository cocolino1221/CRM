/**
 * Mirrors backend/src/bookings/booking-permissions.ts so the Programați list
 * only offers Mută / Anulează to someone the server will let through. The
 * server still decides; this only keeps dead buttons off the screen.
 */
const TEAM_LEADS = ['super_admin', 'admin', 'manager'];

export function canManageBooking(
  user: { id?: string; role?: string } | null | undefined,
  booking: { host?: { id?: string } | null; hostId?: string | null },
): boolean {
  if (!user?.id) return false;
  if (TEAM_LEADS.includes(String(user.role || '').toLowerCase())) return true;
  const hostId = booking.hostId ?? booking.host?.id;
  return !!hostId && hostId === user.id;
}
