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

export interface CallbackForm {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}

/**
 * The lead who will not pick an hour still has to be reachable, so the phone
 * is required here where it is optional for a booking: a booking carries a
 * time everyone has agreed on, a callback carries only a promise to ring.
 */
export function callbackError(form: CallbackForm): string | null {
  if (!form.name.trim()) return 'Spune-ne cum te cheamă.';
  const digits = form.phone.replace(/\D/g, '');
  if (digits.length < 9) return 'Lasă-ne un număr de telefon valid.';
  if (form.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
    return 'Adresa de email nu pare validă.';
  }
  return null;
}

export function buildCallbackPayload(form: CallbackForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email?.trim() || undefined,
    notes: form.notes?.trim() || undefined,
  };
}

/** "Andrei", "Andrei sau Ioana", "Andrei și încă 2" — kept short for a chip. */
export function hostsLabel(hosts: Array<{ name: string }>): string {
  const names = hosts.map((h) => h.name).filter(Boolean);
  if (names.length === 0) return 'Cineva din echipă';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} sau ${names[1]}`;
  return `${names[0]} și încă ${names.length - 1}`;
}
