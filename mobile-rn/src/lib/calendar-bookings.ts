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
  phone?: string;
  email?: string;
  contactId?: string;
  notes?: string;
  meetingName?: string;
}

/** Leads from Meta/WhatsApp carry a made-up address; it is not worth showing. */
function realEmail(value: unknown): string | undefined {
  const e = String(value || '').trim();
  if (!e || /placeholder|\.invalid$/i.test(e)) return undefined;
  return e;
}

function fullName(person: any): string {
  return `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim();
}

export function toCalendarBooking(row: any): CalendarBooking | null {
  // Cancelled and no-show bookings are not appointments any more.
  if (row?.status && row.status !== 'confirmed' && row.status !== 'pending') return null;
  return describeBooking(row);
}

/** A booking row as the screens show it, whatever its status. */
function describeBooking(row: any): CalendarBooking | null {
  if (!row?.id || !row?.startTime) return null;
  if (Number.isNaN(new Date(row.startTime).getTime())) return null;

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
    phone: String(row.guestPhone || row.contact?.phone || '').trim() || undefined,
    email: realEmail(row.guestEmail) || realEmail(row.contact?.email),
    contactId: row.contactId || row.contact?.id || undefined,
    notes: String(row.notes || '').trim() || undefined,
    meetingName: row.meetingType?.name || undefined,
  };
}

/**
 * The bookings for the calendar. Given `now`, meetings already over are left
 * out: they move to the "Trecute" list instead of cluttering the diary.
 */
export function toCalendarBookings(rows: unknown, now?: Date): CalendarBooking[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => !now || !isPastBooking(row, now))
    .map(toCalendarBooking)
    .filter((b): b is CalendarBooking => Boolean(b))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** When the meeting ends: its end time, else start + duration (an hour if unknown). */
export function bookingEndMs(row: any): number {
  const end = row?.endTime ? new Date(row.endTime).getTime() : NaN;
  if (!Number.isNaN(end)) return end;
  const start = new Date(row?.startTime).getTime();
  return start + (Number(row?.duration) || 60) * 60_000;
}

export function isPastBooking(row: any, now: Date = new Date()): boolean {
  return bookingEndMs(row) <= now.getTime();
}

export type BookingStatus = 'confirmed' | 'pending' | 'completed' | 'no_show' | 'cancelled';

export interface PastBooking extends CalendarBooking {
  status: BookingStatus;
}

/** Meetings already over, newest first, with what became of them. */
export function toPastBookings(rows: unknown, now: Date = new Date()): PastBooking[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => isPastBooking(row, now))
    .map((row) => {
      const b = describeBooking(row);
      return b ? { ...b, status: (String(row.status || 'confirmed') as BookingStatus) } : null;
    })
    .filter((b): b is PastBooking => Boolean(b))
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
}

export interface PastStats {
  /** Every meeting that was due, cancelled ones included. */
  total: number;
  /** Took place: marked held, or still confirmed (nobody said otherwise). */
  held: number;
  /** Still "confirmed": nobody marked it held or no-show yet. */
  unmarked: number;
  noShow: number;
  cancelled: number;
  /** Held with a Zoom or Meet link. */
  online: number;
}

export function pastStats(list: PastBooking[]): PastStats {
  const stats: PastStats = { total: list.length, held: 0, unmarked: 0, noShow: 0, cancelled: 0, online: 0 };
  for (const b of list) {
    if (b.status === 'cancelled') stats.cancelled++;
    else if (b.status === 'no_show') stats.noShow++;
    else {
      stats.held++;
      if (b.status !== 'completed') stats.unmarked++;
      if (b.link) stats.online++;
    }
  }
  return stats;
}

export const PAST_STATUS_LABEL: Record<BookingStatus, string> = {
  completed: 'Ținută',
  confirmed: 'Nemarcată',
  pending: 'Nemarcată',
  no_show: 'No-show',
  cancelled: 'Anulată',
};
