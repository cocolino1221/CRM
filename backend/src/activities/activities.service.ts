import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../database/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  Activity,
  ActivityDirection,
  ActivityType,
} from '../database/entities/activity.entity';
import { Contact } from '../database/entities/contact.entity';
import { appendDatedNote } from '../common/utils/lead-notes.util';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { Task, TaskPriority, TaskStatus, TaskType } from '../database/entities/task.entity';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { CreateAndDispositionDto, DispositionDto } from './dto/disposition.dto';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    workspaceId: string,
    query: QueryActivitiesDto,
  ): Promise<{ data: Activity[]; total: number }> {
    const where: FindOptionsWhere<Activity> = { workspaceId };
    if (query.contactId) where.contactId = query.contactId;
    if (query.type) where.type = query.type;
    if (query.outcome) where.outcome = query.outcome;
    if (query.userId) where.userId = query.userId;

    const limit = query.limit ?? DEFAULT_LIMIT;
    const page = query.page ?? 1;

    const [data, total] = await this.activityRepository.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Scoped by workspaceId, so an id belonging to another tenant resolves to
   * null and surfaces as a 404 rather than leaking its existence.
   */
  async findOne(workspaceId: string, id: string): Promise<Activity> {
    const activity = await this.activityRepository.findOne({
      where: { workspaceId, id },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    return activity;
  }

  /**
   * Record the outcome of a call and everything that follows from it.
   *
   * Runs inside one transaction through the manager's repositories rather than
   * TasksService/DealsService: those write through their own repositories and
   * would not enrol here, so a failed deal would leave an orphan task behind.
   */
  async applyDisposition(
    workspaceId: string,
    userId: string,
    activityId: string,
    dto: DispositionDto,
  ): Promise<Activity> {
    return this.dataSource.transaction(async (manager) => {
      const activityRepository = manager.getRepository(Activity);
      const activity = await activityRepository.findOne({
        where: { workspaceId, id: activityId },
      });
      if (!activity) throw new NotFoundException('Activity not found');

      return this.writeDisposition(manager, workspaceId, userId, activity, dto);
    });
  }

  /**
   * For calls placed outside the app — an ordinary phone call — where no
   * activity exists yet.
   */
  async createAndDisposition(
    workspaceId: string,
    userId: string,
    contactId: string,
    dto: CreateAndDispositionDto | (DispositionDto & { occurredAt?: string; durationSeconds?: number }),
  ): Promise<Activity> {
    return this.dataSource.transaction(async (manager) => {
      const activityRepository = manager.getRepository(Activity);

      // The guard inside writeDisposition compares against the activity's own
      // metadata, which on this path is a brand-new empty object — so it
      // could never fire and a retry after a timeout sold the same thing
      // twice. The earlier attempt has to be looked up before one is built.
      // A query builder, not find() + Raw(): Raw hands over an unquoted
      // `Activity.metadata`, which Postgres folds to "activity" and rejects —
      // every save from the app's lead sheet failed on this lookup.
      const earlier = await activityRepository
        .createQueryBuilder('activity')
        .where('activity.workspaceId = :workspaceId', { workspaceId })
        .andWhere(`activity.metadata->>'dispositionRequestId' = :requestId`, {
          requestId: dto.clientRequestId,
        })
        .getOne();
      if (earlier) return earlier;

      // contactId arrives straight off the wire with only @IsUUID() on it.
      // Without this, a user could attach a call — and a closed-won deal — to
      // another tenant's contact, whose name and email then rendered here.
      const contact = await manager.getRepository(Contact).findOne({
        where: { id: contactId, workspaceId },
      });
      if (!contact) {
        throw new NotFoundException('Contactul nu a fost găsit');
      }

      const activity = activityRepository.create({
        workspaceId,
        contactId,
        userId,
        type: ActivityType.CALL,
        direction: ActivityDirection.OUTBOUND,
        title: 'Call',
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        duration: dto.durationSeconds ? Math.round(dto.durationSeconds / 60) : undefined,
        metadata: {},
      });

      return this.writeDisposition(manager, workspaceId, userId, activity as Activity, dto);
    });
  }

  private async writeDisposition(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
    activity: Activity,
    dto: DispositionDto,
  ): Promise<Activity> {
    const metadata: Record<string, any> = { ...(activity.metadata ?? {}) };

    // A retry carries the same clientRequestId. Returning early is what stops
    // a flaky connection from producing two reminders and two deals.
    if (metadata.dispositionRequestId === dto.clientRequestId) {
      return activity;
    }

    activity.outcome = dto.outcome;
    if (dto.notes !== undefined) {
      activity.followUpNotes = dto.notes;
      // The lead's history on the web and in the app shows the activity's
      // description; a note kept only in followUpNotes was saved but never
      // shown, and read as "Salvează does nothing".
      activity.description = String(dto.notes || '').trim() || activity.description;
    }

    const taskRepository = manager.getRepository(Task);
    const existingTaskId = metadata.dispositionTaskId;

    if (dto.followUp) {
      const dueDate = new Date(dto.followUp.at);
      // Who rings back: a colleague picked on the sheet (the lead's closer, say),
      // or whoever logged the call. Checked against this workspace so a stray
      // id cannot hand the reminder to someone in another tenant.
      let assigneeId = userId;
      if (dto.followUp.assigneeId && dto.followUp.assigneeId !== userId) {
        const colleague = await manager.getRepository(User).findOne({
          where: { id: dto.followUp.assigneeId, workspaceId },
        });
        if (!colleague) throw new NotFoundException('Colegul ales nu a fost găsit');
        assigneeId = colleague.id;
      }
      activity.followUpRequired = true;
      activity.followUpDate = dueDate;

      if (existingTaskId) {
        // A correction re-states the same call. Inserting again gave the
        // caller two reminders for one conversation.
        const existing = await taskRepository.findOne({
          where: { id: existingTaskId, workspaceId },
        });
        if (existing) {
          existing.title = dto.followUp.title || existing.title;
          existing.dueDate = dueDate;
          existing.assigneeId = assigneeId;
          existing.status = TaskStatus.PENDING;
          // Clear the marker so the cron treats the new date as unnotified.
          existing.customFields = { ...(existing.customFields ?? {}), reminderNotifiedAt: null };
          await taskRepository.save(existing);
        }
      } else {
        // One open call-back per lead: saving again (a caller who thought the
        // first save did nothing) moves the existing reminder instead of
        // adding a second one that rings twice.
        const open = await taskRepository
          .createQueryBuilder('task')
          .where('task.workspaceId = :workspaceId', { workspaceId })
          .andWhere('task.contactId = :contactId', { contactId: activity.contactId })
          .andWhere(`task.status IN ('pending', 'in_progress', 'overdue')`)
          .andWhere(`task."customFields"->>'origin' = 'disposition'`)
          .orderBy('task.createdAt', 'DESC')
          .getOne();
        if (open) {
          open.title = dto.followUp.title || open.title;
          open.dueDate = dueDate;
          open.assigneeId = assigneeId;
          open.status = TaskStatus.PENDING;
          open.customFields = { ...(open.customFields ?? {}), reminderNotifiedAt: null };
          await taskRepository.save(open);
          metadata.dispositionTaskId = (open as any).id;
        } else {
        const task = taskRepository.create({
          workspaceId,
          title: dto.followUp.title || 'Revenire apel',
          dueDate,
          status: TaskStatus.PENDING,
          assigneeId,
          contactId: activity.contactId,
          customFields: { origin: 'disposition' },
        });
        const savedTask = await taskRepository.save(task);
        metadata.dispositionTaskId = (savedTask as any).id;
        }
      }
    } else if (existingTaskId) {
      // The caller corrected the outcome and dropped the follow-up. Leaving
      // the task pending kept the reminder armed and kept the call in the
      // follow-ups queue for something explicitly un-scheduled.
      activity.followUpRequired = false;
      activity.followUpDate = null as any;
      const existing = await taskRepository.findOne({
        where: { id: existingTaskId, workspaceId },
      });
      if (existing) {
        existing.status = TaskStatus.CANCELLED;
        await taskRepository.save(existing);
      }
      delete metadata.dispositionTaskId;
    }

    // Only ever one deal per call: a correction re-states the outcome, it does
    // not sell the same thing twice.
    if (dto.deal && !activity.dealId) {
      const deal = manager.getRepository(Deal).create({
        workspaceId,
        title: 'Vanzare din apel',
        value: dto.deal.value,
        currency: dto.deal.currency,
        contactId: activity.contactId,
        ownerId: userId,
        // Closed on this call, not left open. A deal on the entity's default
        // stage is invisible to every report: dealsWon and revenue both count
        // closed-won only, so the amount a caller typed would never have
        // reached the numbers anyone reads.
        stage: DealStage.CLOSED_WON,
        probability: 100,
        actualCloseDate: new Date(),
      });
      const savedDeal = await manager.getRepository(Deal).save(deal);
      activity.dealId = (savedDeal as any).id;
    }

    if (dto.bookingSent !== undefined) metadata.bookingSent = dto.bookingSent;
    metadata.dispositionRequestId = dto.clientRequestId;
    metadata.dispositionedBy = userId;
    metadata.dispositionedAt = new Date().toISOString();
    activity.metadata = metadata;

    const saved = await manager.getRepository(Activity).save(activity);

    // The end-of-day report derives followUpsNeeded from lastContactedAt.
    if (activity.contactId) {
      const contactRepository = manager.getRepository(Contact);
      const contact = await contactRepository.findOne({
        where: { workspaceId, id: activity.contactId },
      });
      if (contact) {
        contact.lastContactedAt = new Date();
        // Whoever worked the lead is put on it when that seat is empty: a
        // closer who called someone found them still "Closer: Neasignat"
        // afterwards. An existing assignment is never overwritten.
        const caller = await manager.getRepository(User).findOne({ where: { id: userId, workspaceId } });
        const role = String((caller as any)?.role || '').toLowerCase();
        if (role === 'closer' && !contact.closerId) contact.closerId = userId;
        if ((role === 'caller' || role === 'setter') && !contact.callerId) contact.callerId = userId;
        this.appendCallNote(contact, dto.notes);
        await contactRepository.save(contact);
      }
    }

    return saved as Activity;
  }

  /**
   * What the caller typed about the person goes on the lead, newest first.
   *
   * It used to live only on the activity, so the "Notițe" box on the lead
   * showed whatever an import had put there — a WooCommerce order line, most
   * often — and the closer's own note read as lost. The activity keeps its
   * copy; this is the one a human looks for. Shared with the Sheets sync,
   * which had the same problem with the sheet's own notes column.
   */
  private appendCallNote(contact: Contact, notes?: string): void {
    const next = appendDatedNote(contact.notes, notes);
    if (next !== null) contact.notes = next;
  }
}
