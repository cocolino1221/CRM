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

export type LeadStageKey = 'new' | 'scheduled' | 'unscheduled' | 'follow_up';

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
  follow_up: { key: 'follow_up', label: 'Revenire', color: '#7c3aed' },
};

/** "Revenire 16:00" today, "Revenire mâine 10:00", else "Revenire 22 oct.". */
export function followUpLabel(at: string | Date, now: Date = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'Revenire';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return `Revenire ${hm}`;
  if (diff === 1) return `Revenire mâine ${hm}`;
  if (diff < 0) return 'Revenire întârziată';
  const months = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return `Revenire ${d.getDate()} ${months[d.getMonth()]}.`;
}

export function leadStage(
  contact: { id?: string; lastContactedAt?: string | Date | null; nextFollowUpAt?: string | Date | null } | null | undefined,
  booked: Set<string>,
): LeadStage {
  // Being booked outranks everything: someone with an appointment is booked
  // whether or not anybody recorded the call that got them there.
  if (contact?.id && booked.has(contact.id)) return STAGES.scheduled;
  // A call-back set by a caller is a plan, not "unscheduled".
  if (contact?.nextFollowUpAt) {
    const overdue = new Date(contact.nextFollowUpAt).getTime() < Date.now();
    return { ...STAGES.follow_up, label: followUpLabel(contact.nextFollowUpAt), color: overdue ? '#dc2626' : STAGES.follow_up.color };
  }
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

/**
 * The badge on a row inside a tab. Pierdut and Vândut are decided by the
 * server, which the booked/contacted guess above cannot see, so a lost lead
 * would otherwise read "Neprogramat" under Pierdut.
 */
export function stageForTab(stage: LeadStage, bucket?: string): LeadStage {
  if (bucket === 'lost') return { key: stage.key, label: 'Pierdut', color: '#dc2626' };
  if (bucket === 'won') return { key: stage.key, label: 'Vândut', color: '#059669' };
  return stage;
}
