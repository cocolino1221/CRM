import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Task, TaskStatus } from '../database/entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { normalizeTagFilter, normalizeTags, tagsOverlapCondition } from '../common/utils/simple-array-tags.util';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(workspaceId: string, query: QueryTasksDto) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      priority,
      type,
      assigneeId,
      contactId,
      dealId,
      tag,
      dueDateFrom,
      dueDateTo,
      overdue,
      completedOnly,
      sortBy = 'dueDate',
      sortOrder = 'ASC',
    } = query;

    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.contact', 'contact')
      .leftJoinAndSelect('task.deal', 'deal')
      .leftJoinAndSelect('task.creator', 'creator')
      .where('task.workspaceId = :workspaceId', { workspaceId })
      .andWhere('task.deletedAt IS NULL');

    if (search) {
      queryBuilder.andWhere(
        '(task.title ILIKE :search OR task.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) queryBuilder.andWhere('task.status = :status', { status });
    if (priority) queryBuilder.andWhere('task.priority = :priority', { priority });
    if (type) queryBuilder.andWhere('task.type = :type', { type });
    if (assigneeId) queryBuilder.andWhere('task.assigneeId = :assigneeId', { assigneeId });
    if (contactId) queryBuilder.andWhere('task.contactId = :contactId', { contactId });
    if (dealId) queryBuilder.andWhere('task.dealId = :dealId', { dealId });
    const tagFilter = normalizeTagFilter(tag);
    if (tagFilter.length > 0) {
      queryBuilder.andWhere(tagsOverlapCondition('task.tags'), { tags: tagFilter });
    }

    if (dueDateFrom) queryBuilder.andWhere('task.dueDate >= :dueDateFrom', { dueDateFrom });
    if (dueDateTo) queryBuilder.andWhere('task.dueDate <= :dueDateTo', { dueDateTo });

    if (overdue) {
      queryBuilder
        .andWhere('task.dueDate < :today', { today: new Date() })
        .andWhere('task.status != :completed', { completed: TaskStatus.COMPLETED });
    }

    if (completedOnly) {
      queryBuilder.andWhere('task.status = :completed', { completed: TaskStatus.COMPLETED });
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'dueDate', 'title', 'priority'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'dueDate';
    queryBuilder.orderBy(`task.${finalSortBy}`, sortOrder);

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [tasks, total] = await queryBuilder.getManyAndCount();

    return {
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(workspaceId: string, id: string, relations: string[] = []) {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.id = :id', { id })
      .andWhere('task.workspaceId = :workspaceId', { workspaceId })
      .andWhere('task.deletedAt IS NULL');

    const validRelations = ['assignee', 'contact', 'deal', 'creator'];
    relations.forEach((relation) => {
      if (validRelations.includes(relation)) {
        queryBuilder.leftJoinAndSelect(`task.${relation}`, relation);
      }
    });

    const task = await queryBuilder.getOne();

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async create(workspaceId: string, creatorId: string, createTaskDto: CreateTaskDto) {
    try {
      const task = this.taskRepository.create({
        ...createTaskDto,
        // A tag may not hold a comma: the column joins its values with one.
        ...(createTaskDto.tags === undefined ? {} : { tags: normalizeTags(createTaskDto.tags) }),
        workspaceId,
        creatorId,
      });

      const savedTask = await this.taskRepository.save(task);
      this.logger.log(`Task created: ${savedTask.id} in workspace ${workspaceId}`);

      // Emit task.created event for workflow triggers
      this.eventEmitter.emit('task.created', {
        task: savedTask,
        workspaceId,
      });
      this.logger.log(`Task created event emitted for task ${savedTask.id}`);

      return this.findOne(workspaceId, savedTask.id, ['assignee', 'contact', 'deal']);
    } catch (error) {
      this.logger.error(`Error creating task: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to create task');
    }
  }

  async update(workspaceId: string, id: string, updateTaskDto: UpdateTaskDto) {
    const task = await this.findOne(workspaceId, id);
    const oldStatus = task.status;

    try {
      Object.assign(task, updateTaskDto);
      if (updateTaskDto.tags !== undefined) {
        task.tags = normalizeTags(updateTaskDto.tags);
      }
      const updatedTask = await this.taskRepository.save(task);

      this.logger.log(`Task updated: ${id} in workspace ${workspaceId}`);

      // Emit task.completed event when status changes to completed
      if (updateTaskDto.status && updateTaskDto.status === TaskStatus.COMPLETED && oldStatus !== TaskStatus.COMPLETED) {
        this.eventEmitter.emit('task.completed', {
          task: updatedTask,
          workspaceId,
        });
        this.logger.log(`Task completed event emitted for task ${updatedTask.id}`);
      }

      return this.findOne(workspaceId, id, ['assignee', 'contact', 'deal']);
    } catch (error) {
      this.logger.error(`Error updating task: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to update task');
    }
  }

  async remove(workspaceId: string, id: string, actor?: { id?: string; role?: string }) {
    const task = await this.findOne(workspaceId, id);
    // Whoever runs the team may delete any task; everyone else only the ones
    // given to them or that they made.
    const role = String(actor?.role || '').toLowerCase();
    const lead = ['super_admin', 'admin', 'manager'].includes(role);
    if (actor && !lead && task.assigneeId !== actor.id && task.creatorId !== actor.id) {
      throw new ForbiddenException('Poți șterge doar task-urile tale.');
    }
    await this.taskRepository.softDelete(id);

    this.logger.log(`Task deleted: ${id} in workspace ${workspaceId}`);

    return { message: 'Task deleted successfully' };
  }

  async complete(workspaceId: string, id: string, notes?: string) {
    const task = await this.findOne(workspaceId, id);

    task.complete(notes);
    await this.taskRepository.save(task);

    this.logger.log(`Task completed: ${id}`);

    return this.findOne(workspaceId, id, ['assignee', 'contact', 'deal']);
  }

  /**
   * `assigneeId` narrows the month to one person's work. The calendar in the
   * app used to show the whole workspace, so a closer scrolled through
   * colleagues' call-backs to find their own.
   */
  async getCalendar(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    assigneeId?: string,
  ) {
    const tasks = await this.taskRepository.find({
      where: {
        workspaceId,
        dueDate: Between(startDate, endDate),
        deletedAt: null,
        ...(assigneeId ? { assigneeId } : {}),
      },
      relations: ['assignee', 'contact', 'deal'],
      order: { dueDate: 'ASC' },
    });

    return {
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        status: task.status,
        priority: task.priority,
        type: task.type,
        assignee: task.assignee ? {
          id: task.assignee.id,
          name: `${task.assignee.firstName} ${task.assignee.lastName}`
        } : null,
      })),
    };
  }

  /** `assigneeId` counts one person's tasks, so the figures match their list. */
  async getStats(workspaceId: string, assigneeId?: string) {
    const mine = assigneeId ? { assigneeId } : {};
    const [
      totalTasks,
      pendingTasks,
      completedTasks,
      overdueTasks,
    ] = await Promise.all([
      this.taskRepository.count({ where: { workspaceId, deletedAt: null, ...mine } }),
      this.taskRepository.count({
        where: { workspaceId, status: TaskStatus.PENDING, deletedAt: null, ...mine },
      }),
      this.taskRepository.count({
        where: { workspaceId, status: TaskStatus.COMPLETED, deletedAt: null, ...mine },
      }),
      this.taskRepository.count({
        where: {
          workspaceId,
          dueDate: LessThan(new Date()),
          status: TaskStatus.PENDING,
          deletedAt: null,
          ...mine,
        },
      }),
    ]);

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return {
      totalTasks,
      pendingTasks,
      completedTasks,
      overdueTasks,
      completionRate: Math.round(completionRate * 10) / 10,
    };
  }

  async bulkDelete(workspaceId: string, ids: string[]) {
    const tasks = await this.taskRepository.find({
      where: { id: In(ids), workspaceId, deletedAt: null },
    });

    if (tasks.length !== ids.length) {
      throw new BadRequestException('Some tasks not found or not accessible');
    }

    await this.taskRepository.softDelete(ids);

    this.logger.log(`Bulk deleted ${ids.length} tasks in workspace ${workspaceId}`);

    return { deleted: ids.length };
  }

  async bulkUpdateStatus(workspaceId: string, ids: string[], status: TaskStatus) {
    const tasks = await this.taskRepository.find({
      where: { id: In(ids), workspaceId, deletedAt: null },
    });

    if (tasks.length !== ids.length) {
      throw new BadRequestException('Some tasks not found or not accessible');
    }

    await this.taskRepository.update({ id: In(ids) }, { status });

    this.logger.log(`Bulk updated ${ids.length} tasks to status ${status} in workspace ${workspaceId}`);

    return { updated: ids.length };
  }
}