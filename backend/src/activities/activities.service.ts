import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Activity } from '../database/entities/activity.entity';
import { QueryActivitiesDto } from './dto/query-activities.dto';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
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
}
