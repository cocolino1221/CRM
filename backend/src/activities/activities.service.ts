import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  Activity,
  ActivityDirection,
  ActivityType,
} from '../database/entities/activity.entity';
import { Contact } from '../database/entities/contact.entity';
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
    if (dto.notes !== undefined) activity.followUpNotes = dto.notes;

    if (dto.followUp) {
      activity.followUpRequired = true;
      activity.followUpDate = new Date(dto.followUp.at);

      const task = manager.getRepository(Task).create({
        workspaceId,
        title: dto.followUp.title || 'Revenire apel',
        type: TaskType.CALL,
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(dto.followUp.at),
        assigneeId: userId,
        contactId: activity.contactId,
      });
      await manager.getRepository(Task).save(task);
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
        await contactRepository.save(contact);
      }
    }

    return saved as Activity;
  }
}
