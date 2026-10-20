import { Repository, SelectQueryBuilder } from 'typeorm';

/**
 * The tabs at the top of the app's lead list: where a lead stands, not which
 * pipeline stage it sits in. A sale or a loss recorded from the app writes a
 * deal or a call outcome rather than moving the pipeline stage, so each tab
 * reads both — otherwise a lead sold from the phone would never reach Vândut.
 */
export const LEAD_BUCKETS = ['new', 'scheduled', 'follow_up', 'won', 'lost'] as const;
export type LeadBucket = (typeof LEAD_BUCKETS)[number];

const BOOKED = `EXISTS (
  SELECT 1 FROM bookings b
  WHERE b."contactId" = "contact".id AND b."deletedAt" IS NULL
    AND b."startTime" >= now() AND b.status NOT IN ('cancelled', 'no_show'))`;

const WON = `("pipelineStage"."isClosedWon" = true OR EXISTS (
  SELECT 1 FROM deals d
  WHERE d."contactId" = "contact".id AND d."deletedAt" IS NULL AND d.stage = 'closed_won'))`;

// The latest call outcome, so a lead marked lost and then won is not both.
// Calls only: "A răspuns — refuz" is recorded as a call that failed, while a
// WhatsApp template that failed to send is also outcome 'failed' and says
// nothing about the lead — 199 of those had put people to call under Pierdut.
const LATEST_OUTCOME = `(
  SELECT a.outcome::text FROM activities a
  WHERE a."contactId" = "contact".id AND a."deletedAt" IS NULL AND a.outcome IS NOT NULL
    AND a.type = 'call'
  ORDER BY a."occurredAt" DESC NULLS LAST, a."createdAt" DESC LIMIT 1)`;

const LOST = `("pipelineStage"."isClosedLost" = true OR ${LATEST_OUTCOME} = 'failed')`;

const FOLLOW_UP = `EXISTS (
  SELECT 1 FROM tasks t
  WHERE t."contactId" = "contact".id AND t."deletedAt" IS NULL
    AND t.status IN ('pending', 'overdue') AND t."dueDate" IS NOT NULL)`;

const CLOSED = `(${WON} OR ${LOST})`;

/**
 * Won or lost, for each of these contacts — the same rule as the tabs, so a
 * row's badge says Vândut in "Toți" too, not only inside the Vândut tab.
 */
export async function outcomesFor(
  repository: Repository<any>,
  workspaceId: string,
  ids: string[],
): Promise<Map<string, 'won' | 'lost'>> {
  const outcomes = new Map<string, 'won' | 'lost'>();
  if (!ids.length) return outcomes;
  const rows: Array<{ id: string; won: boolean; lost: boolean }> = await repository
    .createQueryBuilder('contact')
    .leftJoin('contact.pipelineStage', 'pipelineStage')
    .select('contact.id', 'id')
    .addSelect(WON, 'won')
    .addSelect(LOST, 'lost')
    .where('contact.workspaceId = :workspaceId', { workspaceId })
    .andWhere('contact.id IN (:...ids)', { ids })
    .getRawMany();
  for (const row of rows) {
    if (row.won) outcomes.set(row.id, 'won');
    else if (row.lost) outcomes.set(row.id, 'lost');
  }
  return outcomes;
}

/** Requires the `pipelineStage` join, which findAll always adds. */
export function applyLeadBucket(qb: SelectQueryBuilder<any>, bucket?: LeadBucket | string): void {
  switch (bucket) {
    case 'won':
      qb.andWhere(WON);
      return;
    case 'lost':
      qb.andWhere(`${LOST} AND NOT ${WON}`);
      return;
    case 'scheduled':
      qb.andWhere(BOOKED);
      return;
    case 'follow_up':
      qb.andWhere(`${FOLLOW_UP} AND NOT ${BOOKED} AND NOT ${CLOSED}`);
      return;
    case 'new':
      // "De sunat": everyone still to be won over — never called or called
      // and not booked yet — but not those already sold or lost.
      qb.andWhere(`NOT ${BOOKED} AND NOT ${CLOSED}`);
      return;
    default:
      return;
  }
}
