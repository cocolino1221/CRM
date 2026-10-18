/**
 * The seven call outcomes and what each one writes.
 *
 * Kept apart from the dialog so the part that decides what reaches the server
 * — the payload, the amount parsing, the defaults — is testable without a DOM.
 * The labels are UI copy fixed by the spec's Part 2 table; do not reword them
 * without changing the spec.
 */

/** What the backend stores. Three UI rows share `successful` by design. */
import { parseMoney } from './money';

export type ActivityOutcome =
  | 'successful'
  | 'failed'
  | 'no_answer'
  | 'voicemail'
  | 'busy'
  | 'scheduled';

/** Which follow-on question a row asks. */
export type FollowOn = 'amount' | 'followup_date' | 'reason' | 'callback' | 'booking';

export interface OutcomeRow {
  id: string;
  key: string;
  label: string;
  outcome: ActivityOutcome;
  followOn: FollowOn;
}

export const OUTCOMES: OutcomeRow[] = [
  { id: 'interested', key: '1', label: 'A răspuns — interesat', outcome: 'successful', followOn: 'amount' },
  { id: 'not_now', key: '2', label: 'A răspuns — nu acum', outcome: 'successful', followOn: 'followup_date' },
  { id: 'refused', key: '3', label: 'A răspuns — refuz', outcome: 'failed', followOn: 'reason' },
  { id: 'no_answer', key: '4', label: 'N-a răspuns', outcome: 'no_answer', followOn: 'callback' },
  { id: 'voicemail', key: '5', label: 'Mesagerie vocală', outcome: 'voicemail', followOn: 'callback' },
  { id: 'busy', key: '6', label: 'Ocupat', outcome: 'busy', followOn: 'callback' },
  { id: 'scheduled', key: '7', label: 'Programat', outcome: 'scheduled', followOn: 'booking' },
];

export function outcomeByKey(key: string): OutcomeRow | undefined {
  return OUTCOMES.find((o) => o.key === key);
}

export function outcomeById(id: string | null): OutcomeRow | null {
  return OUTCOMES.find((o) => o.id === id) ?? null;
}

/**
 * The follow-up a row starts with, so the common case is one keystroke and
 * submit. Null means the caller picks, or the spec says none at all.
 */
/** Nobody answers a callback at 00:40, so a late one lands the next morning. */
function withinCallingHours(at: Date): Date {
  const hour = at.getHours();
  if (hour >= 9 && hour < 21) return at;

  const moved = new Date(at);
  if (hour >= 21) moved.setDate(moved.getDate() + 1);
  moved.setHours(9, 0, 0, 0);
  return moved;
}

export function defaultFollowUpFor(rowId: string, now: Date = new Date()): string | null {
  if (rowId === 'busy') {
    return withinCallingHours(new Date(now.getTime() + 3600 * 1000)).toISOString();
  }
  if (rowId === 'not_now') {
    return withinCallingHours(new Date(now.getTime() + 3 * 24 * 3600 * 1000)).toISOString();
  }
  return null;
}

/** The three callback offers behind "N-a răspuns", "Mesagerie vocală" and "Ocupat". */
export const CALLBACK_CHOICES = [
  {
    id: 'in_1h',
    label: 'Peste o oră',
    // Snapped to the minute. Recomputed to the millisecond on every render,
    // this value never equalled the one in state, so the chip could never
    // show as selected and the caller kept re-clicking it.
    at: (now = new Date()) => {
      const at = new Date(now.getTime() + 3600 * 1000);
      at.setSeconds(0, 0);
      return at;
    },
  },
  {
    id: 'today_18',
    // Past 18:00 the same click used to schedule tomorrow while still saying
    // "Azi", so the label is computed rather than fixed.
    label: 'Azi la 18:00',
    labelFor: (now = new Date()) => (atHour(18, now).getDate() === now.getDate() ? 'Azi la 18:00' : 'Mâine la 18:00'),
    at: (now = new Date()) => atHour(18, now),
  },
  { id: 'tomorrow_10', label: 'Mâine la 10:00', at: (now = new Date()) => atHour(10, now, 1) },
];

function atHour(hour: number, now: Date, dayOffset = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  // Already past today: the caller means tomorrow.
  return d.getTime() <= now.getTime() ? atHour(hour, now, dayOffset + 1) : d;
}

export interface DispositionPayloadInput {
  row: OutcomeRow;
  clientRequestId: string;
  contactId: string;
  contactName: string;
  notes?: string;
  amount?: string;
  followUpAt?: string | null;
  bookingSent?: boolean;
  activityId?: string;
  durationSeconds?: number;
}

export interface DispositionPayload {
  outcome: ActivityOutcome;
  clientRequestId: string;
  notes?: string;
  followUp?: { at: string; title: string };
  deal?: { value: number; currency: string };
  bookingSent?: true;
  contactId?: string;
  durationSeconds?: number;
}

export function buildDispositionPayload(input: DispositionPayloadInput): DispositionPayload {
  const payload: DispositionPayload = {
    outcome: input.row.outcome,
    clientRequestId: input.clientRequestId,
  };

  if (input.notes?.trim()) payload.notes = input.notes.trim();

  if (input.followUpAt) {
    payload.followUp = {
      at: input.followUpAt,
      title: `Revenire apel — ${input.contactName}`,
    };
  }

  if (input.row.followOn === 'amount') {
    const value = parseMoney(input.amount);
    if (value !== null) payload.deal = { value, currency: 'RON' };
  }

  if (input.bookingSent) payload.bookingSent = true;

  // Only a call that was never logged needs these — otherwise the activity
  // already carries them.
  if (!input.activityId) {
    payload.contactId = input.contactId;
    if (typeof input.durationSeconds === 'number') payload.durationSeconds = input.durationSeconds;
  }

  return payload;
}

export function dispositionEndpoint(activityId: string | undefined): string {
  return activityId ? `/activities/${activityId}/disposition` : '/activities/disposition';
}

/**
 * Whether this payload can be saved, or what to tell the caller instead.
 *
 * The web dialog used to submit an "interested" outcome with an unreadable
 * amount and record no deal at all — silently, while the phone refused the
 * identical action. Same button, two different results.
 */
export function describeBlocker(input: DispositionPayloadInput): string | null {
  if (input.row.followOn === 'amount' && parseMoney(input.amount) === null) {
    return 'Pune suma încasată — altfel se înregistrează o vânzare de zero.';
  }
  return null;
}
