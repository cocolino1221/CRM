import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../database/entities/activity.entity';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { Contact, ContactSource } from '../database/entities/contact.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { applyLeadBucket } from '../contacts/lead-bucket';
import { Workspace } from '../database/entities/workspace.entity';

const DEFAULT_LIMIT = 50;

/**
 * What a won contact owes and has paid.
 *
 * `paid` is money Payflow confirmed; `total` is the contract the closer
 * agreed. They differ only on an instalment sale, which is the whole reason
 * this exists — "1000 EUR, 400 paid, 600 left" cannot be read off either
 * number alone.
 */
export interface PaymentSummary {
  currency: string;
  total: number;
  paid: number;
  remaining: number;
  inInstalments: boolean;
}

/** Where the people on the calling queues come from. */
export const QUEUE_SOURCES: ContactSource[] = [
  ContactSource.TYPEFORM,
  ContactSource.WOOCOMMERCE,
  ContactSource.MANUAL,
];

/** A requested source the queues know, or undefined for "all of them". */
/**
 * A date from the query string, or undefined when there is nothing usable.
 * An unparseable value filters nothing rather than silently emptying the
 * queue — a caller staring at zero leads would blame the data, not the URL.
 */
export function parseQueueDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseQueueSource(value?: string): ContactSource | undefined {
  return QUEUE_SOURCES.find((source) => source === value);
}

/**
 * The three lists a caller works from: who is overdue, who is booked, and who
 * filled in the form but was never scheduled.
 *
 * Read-only over data that already exists. Kept apart from ActivitiesService,
 * which owns the disposition transaction — a read surface and a transactional
 * writer are two different reasons to change.
 */
@Injectable()
export class WorkQueuesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  /**
   * The surface that makes followUpDate readable. Without it the column is
   * written and never seen, which is what the disposition work set out to fix.
   */
  async findFollowUpsDue(workspaceId: string, userId?: string, before?: Date): Promise<Activity[]> {
    const query = this.followUpQuery(workspaceId, userId);
    query.andWhere('activity.followUpDate <= :cutoff', { cutoff: before ?? new Date() });
    return query.getMany();
  }

  /**
   * Every follow-up on the books, overdue and future alike — the "Follow up"
   * tab, which is a diary rather than a worklist. findFollowUpsDue stays as it
   * is: the caller's "ring these now" list must not grow a tail of dates
   * weeks out.
   */
  async findAllFollowUps(workspaceId: string, userId?: string): Promise<Activity[]> {
    return this.followUpQuery(workspaceId, userId).getMany();
  }

  private followUpQuery(workspaceId: string, userId?: string) {
    const query = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.followUpRequired = :required', { required: true })
      .andWhere('activity.followUpDate IS NOT NULL')
      .leftJoinAndSelect('activity.contact', 'contact')
      .orderBy('activity.followUpDate', 'ASC');

    if (userId) {
      query.andWhere('activity.userId = :userId', { userId });
    }

    return query;
  }

  /** Upcoming appointments — the "Programați" list. */
  async findBooked(workspaceId: string, userId?: string, source?: ContactSource): Promise<Booking[]> {
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.workspaceId = :workspaceId', { workspaceId })
      .andWhere('booking.startTime >= :now', { now: new Date() })
      .andWhere('booking.status NOT IN (:...excluded)', {
        excluded: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
      })
      .leftJoinAndSelect('booking.contact', 'contact')
      .leftJoinAndSelect('booking.host', 'host')
      .orderBy('booking.startTime', 'ASC');

    // The person a booking belongs to is its host; Booking has no userId.
    if (userId) {
      query.andWhere('booking.hostId = :userId', { userId });
    }

    if (source) {
      query.andWhere('contact.source = :source', { source });
    }

    return query.getMany();
  }

  /**
   * The calling queue: people from the lead sources (Typeform, WooCommerce,
   * added by hand) who were never scheduled, optionally narrowed to one.
   *
   * A left join with IS NULL rather than a NOT IN subquery — this table holds
   * tens of thousands of contacts, and the join uses the existing index on
   * bookings.contactId.
   */
  async findUnbookedLeads(
    workspaceId: string,
    page = 1,
    limit = DEFAULT_LIMIT,
    source?: ContactSource,
    /** The window the lead arrived in. Both ends optional and inclusive. */
    createdFrom?: Date,
    createdTo?: Date,
  ): Promise<{ data: Contact[]; total: number; waiting: number }> {
    const sources = source ? [source] : QUEUE_SOURCES;
    const grace = await this.graceMinutes(workspaceId);

    const base = () =>
      this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.workspaceId = :workspaceId', { workspaceId })
        .andWhere('contact.source IN (:...sources)', { sources })
        .andWhere('contact.deletedAt IS NULL')
        .andWhere(createdFrom ? 'contact.createdAt >= :createdFrom' : '1=1', { createdFrom })
        .andWhere(createdTo ? 'contact.createdAt <= :createdTo' : '1=1', { createdTo })
        // A cancelled meeting is not a booking. Joining on contactId alone meant
        // a lead who booked and then cancelled vanished from both lists at once:
        // excluded from Programați by its status, and excluded from De sunat
        // because a row existed. Nobody ever called them again.
        .leftJoin(
          Booking,
          'booking',
          'booking.contactId = contact.id AND booking.status NOT IN (:...ignored)',
          { ignored: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
        )
        .andWhere('booking.id IS NULL');

    const [data, total] = await base()
      .andWhere(`NOT ${WorkQueuesService.RIPE_SQL}`, grace)
      .orderBy('contact.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Shown as "N în așteptare" rather than hidden outright, so nobody thinks
    // the lead they just saw in WooCommerce went missing.
    const waiting = await base().andWhere(WorkQueuesService.RIPE_SQL, grace).getCount();

    return { data, total, waiting };
  }

  /**
   * True while a lead is still inside its source's grace period.
   *
   * One expression rather than a branch per source: the queue has to be a
   * single query for paging to mean anything, and a CASE keeps the unknown
   * sources at zero instead of dropping them.
   */
  private static readonly RIPE_SQL = `(contact.createdAt > NOW() - (CASE contact.source
      WHEN 'typeform' THEN :graceTypeform
      WHEN 'woocommerce' THEN :graceWoocommerce
      WHEN 'manual' THEN :graceManual
      ELSE 0 END) * INTERVAL '1 minute')`;

  /**
   * The wait per source, as configured on the Integrations screen.
   *
   * Someone who just bought a book is very likely about to book a call, so
   * the default leaves them ten minutes to do it themselves. A lead typed in
   * by hand waits for nobody — whoever typed it is not about to self-book.
   */
  async graceMinutes(workspaceId: string): Promise<{
    graceTypeform: number;
    graceWoocommerce: number;
    graceManual: number;
  }> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    const configured = workspace?.settings?.leadGrace ?? {};
    const minutes = (value: unknown, fallback: number) => {
      const n = Number(value);
      // A negative or unparseable setting must not pull leads from the future.
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    return {
      graceTypeform: minutes(configured.typeform, 10),
      graceWoocommerce: minutes(configured.woocommerce, 10),
      // Never a wait: a lead typed in by a setter or caller is booked by them,
      // not by the lead, so there is nothing to wait for — whatever was saved.
      graceManual: 0,
    };
  }

  /**
   * The people who closed — the "Win" and "Lost" tabs.
   *
   * Closed is read off the pipeline stage's own flag rather than a name, so a
   * workspace that renamed "Closed Won" to "Client" still lands in the right
   * tab. A contact with no stage at all is in neither list.
   */
  async findClosed(
    workspaceId: string,
    won: boolean,
    source?: ContactSource,
    page = 1,
    limit = DEFAULT_LIMIT,
  ): Promise<{ data: Contact[]; total: number }> {
    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.deletedAt IS NULL')
      .leftJoinAndSelect('contact.pipelineStage', 'pipelineStage');
    // The same rule as the app's Vândut / Pierdut tabs: a sale or a loss
    // recorded from a call writes a deal or an outcome and never moves the
    // stage, so the stage flag alone missed every one made from the phone.
    applyLeadBucket(query, won ? 'won' : 'lost');
    query
      // The most recently closed first: this is a record of what happened,
      // and the useful end is the near one.
      .orderBy('contact.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (source) {
      query.andWhere('contact.source = :source', { source });
    }

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /**
   * What each won contact actually paid.
   *
   * Payflow writes one deal per transaction, stamped source=payflow in
   * customFields, so the confirmed money is the sum of those. The contract
   * total is whatever the closer put on the deal they raised by hand — Payflow
   * never sends a total, only the instalment that just cleared. Where no such
   * deal exists the sale was paid in one go and the total is what came in.
   */
  private static readonly PAID_DEAL_SQL = `COALESCE(deal."customFields" ->> 'source', '') IN ('payflow', 'woocommerce')
      OR COALESCE(deal."customFields" ->> 'wooOrderKey', '') <> ''`;

  async attachPaymentSummaries<T extends { id: string; payment?: PaymentSummary }>(
    workspaceId: string,
    rows: T[],
  ): Promise<T[]> {
    if (!rows.length) return rows;

    const raw = await this.dealRepository
      .createQueryBuilder('deal')
      .select('deal.contactId', 'contactid')
      // Money that actually came in: a Payflow transaction, or a WooCommerce
      // order (paid in the shop, or a hand-recorded sale matched to one).
      .addSelect(
        `COALESCE(SUM(CASE WHEN deal.stage = :won AND (${WorkQueuesService.PAID_DEAL_SQL})
                           THEN deal.value ELSE 0 END), 0)`,
        'paid',
      )
      .addSelect(
        `COALESCE(MAX(CASE WHEN NOT (${WorkQueuesService.PAID_DEAL_SQL})
                           THEN deal.value ELSE 0 END), 0)`,
        'contracted',
      )
      .addSelect(`BOOL_OR(deal."paymentMethod" = 'rate')`, 'ininstalments')
      .addSelect('MIN(deal.currency)', 'currency')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere('deal.contactId IN (:...contactIds)', { contactIds: rows.map((r) => r.id) })
      .andWhere('deal.deletedAt IS NULL')
      .setParameter('won', DealStage.CLOSED_WON)
      .groupBy('deal.contactId')
      .getRawMany();

    const byContact = new Map<string, PaymentSummary>();
    for (const row of raw) {
      const paid = Number(row.paid) || 0;
      const contracted = Number(row.contracted) || 0;
      // A contract smaller than what cleared would show a negative remainder,
      // so the larger of the two wins: money in the bank is not in dispute.
      const total = Math.max(contracted, paid);
      byContact.set(row.contactid, {
        currency: row.currency || 'EUR',
        total,
        paid,
        remaining: Math.max(total - paid, 0),
        inInstalments: row.ininstalments === true || row.ininstalments === 'true',
      });
    }

    return rows.map((row) =>
      byContact.has(row.id) ? { ...row, payment: byContact.get(row.id) } : row,
    );
  }

  /**
   * Attach the most recent call recording to each row, so a caller can hear the
   * last conversation before dialling again. Nothing new is recorded —
   * logCallActivity already writes metadata.recordingUrl.
   */
  async attachLatestRecordings<T extends { id: string; recordingUrl?: string }>(
    workspaceId: string,
    rows: T[],
  ): Promise<T[]> {
    if (!rows.length) return rows;

    const contactIds = rows.map((row) => row.id);
    const latest = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.contactId', 'contactid')
      .addSelect(`activity.metadata->>'recordingUrl'`, 'recordingurl')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.contactId IN (:...contactIds)', { contactIds })
      .andWhere(`activity.metadata->>'recordingUrl' IS NOT NULL`)
      .orderBy('activity.occurredAt', 'DESC')
      .getRawMany();

    const byContact = new Map<string, string>();
    for (const row of latest) {
      const contactId = row.contactid ?? row.contactId;
      const url = row.recordingurl ?? row.recordingUrl;
      if (contactId && url && !byContact.has(contactId)) byContact.set(contactId, url);
    }

    return rows.map((row) =>
      byContact.has(row.id) ? { ...row, recordingUrl: byContact.get(row.id) } : row,
    );
  }
}
