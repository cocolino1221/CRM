/**
 * Holds the call that just ended, so the disposition dialog can still ask
 * about it.
 *
 * call-manager clears its own state about 2.5 seconds after a call ends, to
 * let a fresh call start. The dialog outlives that, and a caller who takes
 * twenty seconds to pick an outcome would otherwise be asked about a call the
 * app has forgotten. Nothing here reads live call state — the manager pushes
 * a copy in at the moment the call ends.
 *
 * Duplicated from frontend/lib/ended-call-latch.ts, with the same spec, for
 * the same reason: there is no shared package either client builds from.
 */

export interface EndedCall {
  /** Absent when logging the call failed; the dialog then creates the activity. */
  activityId?: string;
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
  if (input.status === 'failed') return;

  ended = {
    activityId: input.activityId,
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
