/**
 * The rules behind the public booking page — the one a Typeform lead lands on.
 *
 * Kept out of the component because every mistake here is a mistake about
 * time: a day labelled wrong, a slot shown in the viewer's timezone instead
 * of the workspace's, an hour offered that the closer is not actually free.
 * None of those throw; they just put someone on a call that nobody attends.
 */

export const WORKSPACE_TIMEZONE = 'Europe/Bucharest';

export interface BookingDay {
  /** YYYY-MM-DD, the shape the slots endpoint wants. */
  param: string;
  /** "Luni 20 oct." */
  label: string;
}

/** YYYY-MM-DD as that date reads in the given zone, not in UTC. */
export function dateParam(date: Date, timeZone = WORKSPACE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The days offered in the picker, starting from `from`. */
export function nextDays(from: Date, count: number, timeZone = WORKSPACE_TIMEZONE): BookingDay[] {
  const days: BookingDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
    days.push({
      param: dateParam(date, timeZone),
      label: new Intl.DateTimeFormat('ro-RO', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(date),
    });
  }
  return days;
}

/** The hour a slot starts, in the workspace's clock. */
export function formatSlotTime(iso: string, timeZone = WORKSPACE_TIMEZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export interface Guest {
  name: string;
  email: string;
  phone?: string;
}

/** The backend validates these too; saying it here saves a round trip. */
export function guestError(guest: Guest): string | null {
  if (!guest.name.trim()) return 'Spune-ne cum te cheamă.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email.trim())) return 'Adresa de email nu pare validă.';
  // Matches the DTO's own pattern, so a refusal never comes as a surprise.
  if (guest.phone?.trim() && !/^[+]?[\d\s\-()]+$/.test(guest.phone.trim())) {
    return 'Numărul de telefon conține caractere nepermise.';
  }
  return null;
}

export function buildBookingPayload(input: {
  meetingTypeId: string;
  startTime: string;
  guest: Guest;
  notes?: string;
  timeZone?: string;
}) {
  return {
    meetingTypeId: input.meetingTypeId,
    startTime: input.startTime,
    guestName: input.guest.name.trim(),
    guestEmail: input.guest.email.trim(),
    // An empty string would fail the DTO's phone pattern; absent is fine.
    guestPhone: input.guest.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    timezone: input.timeZone || WORKSPACE_TIMEZONE,
  };
}
