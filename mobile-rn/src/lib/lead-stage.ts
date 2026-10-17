/**
 * Where a lead stands, in the three words a caller actually uses.
 *
 * The row used to show the contact's pipeline stage — "Contacted" and the
 * like. That stopped meaning anything when the list stopped being scoped to
 * one pipeline, and it was never the question anyway: what a caller wants to
 * know, scanning a list, is whether this person is booked, still needs
 * ringing, or has not been touched at all.
 *
 * The booked set comes from the bookings queue the backend already serves,
 * so nothing here needed a change on the server.
 */

export type LeadStageKey = 'new' | 'scheduled' | 'unscheduled';

export interface LeadStage {
  key: LeadStageKey;
  /** Romanian: this is what appears on the row. */
  label: string;
  color: string;
}

const STAGES: Record<LeadStageKey, LeadStage> = {
  scheduled: { key: 'scheduled', label: 'Programat', color: '#059669' },
  unscheduled: { key: 'unscheduled', label: 'Neprogramat', color: '#d97706' },
  new: { key: 'new', label: 'Nou', color: '#2563eb' },
};

export function leadStage(
  contact: { id?: string; lastContactedAt?: string | Date | null } | null | undefined,
  booked: Set<string>,
): LeadStage {
  // Being booked outranks everything: someone with an appointment is booked
  // whether or not anybody recorded the call that got them there.
  if (contact?.id && booked.has(contact.id)) return STAGES.scheduled;
  if (contact?.lastContactedAt) return STAGES.unscheduled;
  return STAGES.new;
}

/** The contacts with an appointment ahead of them, from the bookings queue. */
export function bookedContactIds(bookings: unknown): Set<string> {
  if (!Array.isArray(bookings)) return new Set();

  const ids = bookings
    // The API has returned the contact both nested and flat over time.
    .map((b: any) => b?.contact?.id ?? b?.contactId)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

  return new Set(ids);
}
