/**
 * Turning the activity feed into the lead's history.
 *
 * GET /activities answers `{ data, total }`. The screen looked for
 * `res.data.activities`, found nothing, and hid "Recent Activity" — so every
 * call outcome a caller saved looked lost.
 */

export interface ActivityRow {
  id: string;
  type: string;
  title: string;
  description?: string;
  followUpNotes?: string;
  outcome?: string;
  dealId?: string;
  userId?: string;
  occurredAt: string;
}

export function parseActivityList(body: unknown): ActivityRow[] {
  const b = body as any;
  if (Array.isArray(b)) return b;
  if (Array.isArray(b?.data)) return b.data;
  if (Array.isArray(b?.activities)) return b.activities;
  return [];
}

const OUTCOME_LABELS: Record<string, string> = {
  successful: 'a răspuns',
  failed: 'refuz',
  no_answer: 'n-a răspuns',
  voicemail: 'mesagerie vocală',
  busy: 'ocupat',
  scheduled: 'programat',
  cancelled: 'anulat',
  rescheduled: 'reprogramat',
};

/** "Apel — refuz", "Apel — vândut"; anything else keeps its own title. */
export function activityHeadline(act: ActivityRow): string {
  if (act.type === 'call') {
    if (act.dealId) return 'Apel — vândut';
    const label = act.outcome ? OUTCOME_LABELS[act.outcome] : undefined;
    return label ? `Apel — ${label}` : 'Apel';
  }
  return act.title || act.type;
}

/** The note a caller typed: the follow-up note, else the description. */
export function activityNote(act: ActivityRow): string | undefined {
  const note = String(act.followUpNotes || act.description || '').trim();
  return note || undefined;
}

/** Red for a refusal, green for a sale or booking, grey otherwise. */
export function activityTone(act: ActivityRow): 'red' | 'green' | 'amber' | 'slate' {
  if (act.type !== 'call') return 'slate';
  if (act.dealId || act.outcome === 'scheduled') return 'green';
  if (act.outcome === 'failed') return 'red';
  if (act.outcome === 'no_answer' || act.outcome === 'voicemail' || act.outcome === 'busy') return 'amber';
  return 'slate';
}
