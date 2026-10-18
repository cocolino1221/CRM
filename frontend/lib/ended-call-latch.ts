/**
 * Holds the call that just ended, so the disposition dialog can still ask
 * about it.
 *
 * call-manager clears its own state about 2.5 seconds after a call ends, to
 * let a fresh call start. The dialog outlives that, and a caller who takes
 * twenty seconds to pick an outcome would otherwise be asked about a call the
 * app has forgotten. Nothing here reads live call state — the manager pushes
 * a copy in at the moment the call ends.
 */

export interface EndedCall {
  /** Absent when logging the call failed; the dialog then creates the activity. */
  activityId?: string;
  /**
   * The contact this call was with. Kept apart from waId: both gates used to
   * pass the phone number as contactId, so the one case the optional
   * activityId exists for — the log having failed — posted a phone number
   * into a field the server validates as a UUID and failed every time.
   */
  contactId?: string;
  waId: string;
  contactName: string;
  durationSeconds: number;
  /** Present only when the caller recorded the call; recording is consent-gated. */
  recordingUrl?: string;
  /** Set here, not by the caller — two calls in a row must look like two calls. */
  endedAt: number;
}

export interface LatchInput {
  activityId?: string;
  contactId?: string;
  waId: string;
  contactName: string;
  durationSeconds: number;
  recordingUrl?: string;
  /** The manager's own outcome. A technical failure is not worth asking about. */
  status?: string;
}

let ended: EndedCall | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function latchEndedCall(input: LatchInput): void {
  // We failed to place the call; that is our bug, not an outcome the caller
  // has anything to report about.
  if (input.status === 'failed') {
    // And clear whatever was held: leaving the previous call latched meant
    // the caller was asked about the wrong conversation, with its duration
    // and its recording.
    clearEndedCall();
    return;
  }

  ended = {
    activityId: input.activityId,
    contactId: input.contactId,
    waId: input.waId,
    contactName: input.contactName,
    durationSeconds: input.durationSeconds,
    recordingUrl: input.recordingUrl,
    endedAt: Date.now(),
  };
  notify();
}

/** Stable between changes, so useSyncExternalStore does not re-render forever. */
export function getEndedCall(): EndedCall | null {
  return ended;
}

export function clearEndedCall(): void {
  if (ended === null) return;
  ended = null;
  notify();
}

export function subscribeEndedCall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
