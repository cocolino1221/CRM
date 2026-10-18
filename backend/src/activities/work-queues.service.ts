import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity } from '../database/entities/activity.entity';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { Contact, ContactSource } from '../database/entities/contact.entity';

const DEFAULT_LIMIT = 50;

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
  ) {}

  /**
   * The surface that makes followUpDate readable. Without it the column is
   * written and never seen, which is what the disposition work set out to fix.
   */
  async findFollowUpsDue(workspaceId: string, userId?: string, before?: Date): Promise<Activity[]> {
    const cutoff = before ?? new Date();

    const query = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.followUpRequired = :required', { required: true })
      .andWhere('activity.followUpDate IS NOT NULL')
      .andWhere('activity.followUpDate <= :cutoff', { cutoff })
      .leftJoinAndSelect('activity.contact', 'contact')
      .orderBy('activity.followUpDate', 'ASC');

    if (userId) {
      query.andWhere('activity.userId = :userId', { userId });
    }

    return query.getMany();
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
  ): Promise<{ data: Contact[]; total: number }> {
    const sources = source ? [source] : QUEUE_SOURCES;
    const [data, total] = await this.contactRepository
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
      .andWhere('booking.id IS NULL')
      .orderBy('contact.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
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
