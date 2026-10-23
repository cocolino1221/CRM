/**
 * The funnel events the CRM sends to Meta from what happens to a lead in the
 * app — not only from pipeline stage moves, which the app's outcomes never
 * touch. Plain ASCII names: they are what gets mapped in Events Manager.
 */
export const META_EVENT = {
  scheduled: 'Programat',
  won: 'Vandut',
  lost: 'Pierdut',
} as const;

export type MetaOutcomeEvent = (typeof META_EVENT)[keyof typeof META_EVENT];

/**
 * The event a call outcome is worth, or null. A sale is a sale only with an
 * amount: "successful" alone is also what a plain note saves.
 */
export function outcomeEvent(dto: { outcome?: string | null; deal?: unknown }): MetaOutcomeEvent | null {
  if (dto.deal) return META_EVENT.won;
  if (dto.outcome === 'failed') return META_EVENT.lost;
  if (dto.outcome === 'scheduled') return META_EVENT.scheduled;
  return null;
}

/** Meta drops a second event with the same id, so a re-saved outcome counts once. */
export function outcomeEventId(sourceId: string, event: MetaOutcomeEvent): string {
  return `${sourceId}:${event}`;
}
