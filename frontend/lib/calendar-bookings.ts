/**
 * Bookings in the calendar. They live in their own table, not in tasks or
 * events, so a closer who was booked saw an empty day. These turn a booking
 * row from GET /bookings into what a calendar row needs.
 */

export interface CalendarBooking {
  id: string;
  startTime: string;
  endTime?: string;
  leadName: string;
  hostName: string;
  link?: string;
  platform: 'Zoom' | 'Google Meet' | null;
}

function fullName(person: any): string {
  return `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
}

export function toCalendarBooking(row: any): CalendarBooking | null {
  if (!row?.id || !row?.startTime) return null;
  if (Number.isNaN(new Date(row.startTime).getTime())) return null;
  // Cancelled and no-show bookings are not appointments any more.
  if (row.status && row.status !== 'confirmed' && row.status !== 'pending') return null;

  const link = /^https?:\/\//i.test(String(row.location || '')) ? String(row.location) : undefined;
  const type = String(row.locationType || '').toLowerCase();
  const platform = link ? (type === 'google_meet' || type === 'meet' || link.includes('meet.google') ? 'Google Meet' : 'Zoom') : null;

  return {
    id: String(row.id),
    startTime: String(row.startTime),
    endTime: row.endTime ? String(row.endTime) : undefined,
    leadName:
      String(row.guestName || '').trim() ||
      fullName(row.contact) ||
      String(row.guestPhone || row.contact?.phone || '').trim() ||
      'Lead',
    hostName: fullName(row.host),
    link,
    platform,
  };
}

export function toCalendarBookings(rows: unknown): CalendarBooking[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toCalendarBooking)
    .filter((b): b is CalendarBooking => Boolean(b))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
