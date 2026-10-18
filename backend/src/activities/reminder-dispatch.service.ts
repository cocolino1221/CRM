import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from '../database/entities/task.entity';
import { NotificationType } from '../database/entities/notification.entity';
import { PushNotificationService } from '../notifications/push-notification.service';

/** A single run never handles more than this, so one backlog cannot stall the job. */
const BATCH_SIZE = 200;

/**
 * Fires the reminder a caller asked for when they dispositioned a call.
 *
 * Nothing in this codebase noticed a due task before: the only scheduled work
 * was the campaign scheduler, and the only delayed-job precedent needed Redis.
 * A poll over dueDate is enough here and adds no new infrastructure.
 */
@Injectable()
export class ReminderDispatchService {
  private readonly logger = new Logger(ReminderDispatchService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    const sent = await this.dispatchDue(new Date());
    if (sent) this.logger.log(`Sent ${sent} task reminder(s)`);
  }

  /** @returns how many reminders were delivered. */
  async dispatchDue(now: Date): Promise<number> {
    const due = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.dueDate IS NOT NULL')
      .andWhere('task.dueDate <= :now', { now })
      // Without a floor, the first run after deploy drains every overdue task
      // ever written — oldest first, 200 at a time — so a reminder set today
      // waits behind hours of back-dated pushes.
      .andWhere('task.dueDate >= :floor', { floor: new Date(now.getTime() - 7 * 86_400_000) })
      .andWhere('task.status IN (:...statuses)', {
        statuses: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
      })
      .andWhere('task.deletedAt IS NULL')
      // The marker is what stops a five-minute poll from pushing forever: a
      // task due at 10:00 is still due at 10:05.
      .andWhere(`COALESCE(task.customFields->>'reminderNotifiedAt', '') = ''`)
      .orderBy('task.dueDate', 'ASC')
      .take(BATCH_SIZE)
      .getMany();

    let sent = 0;

    for (const task of due) {
      if (!task.assigneeId) continue;
      // Also checked in SQL. Kept here too: notifying someone twice is the one
      // failure this job must not have, and a query guard is one edit away
      // from being lost.
      if ((task.customFields as any)?.reminderNotifiedAt) continue;

      try {
        // sendPushToUser resolves without throwing when there is nothing to
        // deliver to — push not configured, no registered device, the
        // category switched off, quiet hours. Marking those as sent meant a
        // web-only caller's reminder fired never, while the log counted it.
        const delivered = await this.pushNotificationService.sendPushToUser(task.assigneeId, {
          type: NotificationType.TASK,
          title: 'Memento',
          message: task.title,
          link: task.contactId ? `/leads?contactId=${task.contactId}` : '/tasks',
          category: 'task:reminder',
          metadata: { taskId: task.id, contactId: task.contactId },
        });

        if (delivered === false) {
          // Left unmarked on purpose: the next run tries again rather than
          // silently dropping the reminder.
          this.logger.warn(
            `Reminder for task ${task.id} had nowhere to go; leaving it for the next run`,
          );
          continue;
        }

        // customFields replaces wholesale, so carry the existing keys forward.
        task.customFields = {
          ...(task.customFields ?? {}),
          reminderNotifiedAt: new Date().toISOString(),
        };
        await this.taskRepository.save(task);
        sent += 1;
      } catch (error: any) {
        // One undelivered push must not cost every other caller their reminder.
        this.logger.warn(`Reminder for task ${task.id} failed: ${error?.message}`);
      }
    }

    return sent;
  }
}
