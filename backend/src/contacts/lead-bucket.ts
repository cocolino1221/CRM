import { SelectQueryBuilder } from 'typeorm';

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

// The latest recorded outcome, so a lead marked lost and then won is not both.
const LATEST_OUTCOME = `(
  SELECT a.outcome::text FROM activities a
  WHERE a."contactId" = "contact".id AND a."deletedAt" IS NULL AND a.outcome IS NOT NULL
  ORDER BY a."occurredAt" DESC NULLS LAST, a."createdAt" DESC LIMIT 1)`;

const LOST = `("pipelineStage"."isClosedLost" = true OR ${LATEST_OUTCOME} = 'failed')`;

const FOLLOW_UP = `EXISTS (
  SELECT 1 FROM tasks t
  WHERE t."contactId" = "contact".id AND t."deletedAt" IS NULL
    AND t.status IN ('pending', 'overdue') AND t."dueDate" IS NOT NULL)`;

const CLOSED = `(${WON} OR ${LOST})`;

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
      qb.andWhere(`"contact"."lastContactedAt" IS NULL AND NOT ${BOOKED} AND NOT ${CLOSED}`);
      return;
    default:
      return;
  }
}
