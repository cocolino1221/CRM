import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from '../database/entities/task.entity';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { MAX_REMINDER_MINUTES, inHowLong, reminderDue, reminderLeadMinutes } from './reminder-lead';
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
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    const now = new Date();
    const sent = await this.dispatchDue(now);
    if (sent) this.logger.log(`Sent ${sent} task reminder(s)`);
    // Same tick on purpose: a second poll would wake the database twice as
    // often for nothing (Neon bills by the hour it is awake).
    const meetings = await this.dispatchMeetingReminders(now);
    if (meetings) this.logger.log(`Sent ${meetings} meeting reminder(s)`);
  }

  /** @returns how many reminders were delivered. */
  async dispatchDue(now: Date): Promise<number> {
    const due = await this.taskRepository
      .createQueryBuilder('task')
      // Whose reminder it is decides how early it goes, so the person comes along.
      .leftJoinAndSelect('task.assignee', 'assignee')
      .where('task.dueDate IS NOT NULL')
      // As far ahead as anyone may ask; each row is then held to its own person's choice.
      .andWhere('task.dueDate <= :horizon', { horizon: new Date(now.getTime() + MAX_REMINDER_MINUTES * 60_000) })
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
      // Quoted by hand: TypeORM left this one bare, and Postgres folded it to
      // task.customfields — the job failed every run and no reminder went out.
      .andWhere(`COALESCE("task"."customFields"->>'reminderNotifiedAt', '') = ''`)
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

      const lead = reminderLeadMinutes(task.assignee?.preferences);
      if (lead === 0) {
        // Switched off: settled once, so the row stops being looked at.
        task.customFields = { ...(task.customFields ?? {}), reminderNotifiedAt: 'off' };
        await this.taskRepository.save(task);
        continue;
      }
      // An overdue one goes now; a future one waits for its person's lead time.
      if (task.dueDate && !reminderDue(new Date(task.dueDate), lead, now)) continue;

      try {
        // sendPushToUser resolves without throwing when there is nothing to
        // deliver to — push not configured, no registered device, the
        // category switched off, quiet hours. Marking those as sent meant a
        // web-only caller's reminder fired never, while the log counted it.
        const delivered = await this.pushNotificationService.sendPushToUser(task.assigneeId, {
          type: NotificationType.TASK,
          title: task.dueDate && new Date(task.dueDate) > now ? `Revenire ${inHowLong(new Date(task.dueDate), now)}` : 'Memento',
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

  /**
   * The closer's push before a booking — as long before as they set in the
   * app (one hour unless they chose otherwise, never if they switched it off).
   * hostRemindedAt is the marker; moving a booking clears it.
   *
   * @returns how many reminders were delivered.
   */
  async dispatchMeetingReminders(now: Date): Promise<number> {
    const upcoming = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.host', 'host')
      .leftJoinAndSelect('booking.contact', 'contact')
      .where('booking.startTime > :now', { now })
      .andWhere('booking.startTime <= :horizon', { horizon: new Date(now.getTime() + MAX_REMINDER_MINUTES * 60_000) })
      .andWhere('booking.status IN (:...live)', { live: [BookingStatus.CONFIRMED, BookingStatus.PENDING] })
      .andWhere('booking.deletedAt IS NULL')
      .andWhere('booking.hostRemindedAt IS NULL')
      .orderBy('booking.startTime', 'ASC')
      .take(BATCH_SIZE)
      .getMany();

    let sent = 0;
    for (const booking of upcoming) {
      if (!booking.hostId || booking.hostRemindedAt) continue;
      const lead = reminderLeadMinutes(booking.host?.preferences);
      if (!reminderDue(new Date(booking.startTime), lead, now)) continue;

      const who =
        `${booking.contact?.firstName ?? ''} ${booking.contact?.lastName ?? ''}`.trim() ||
        booking.guestName ||
        'un lead';
      const time = new Intl.DateTimeFormat('ro-RO', {
        timeZone: 'Europe/Bucharest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(booking.startTime));

      try {
        const delivered = await this.pushNotificationService.sendPushToUser(booking.hostId, {
          type: NotificationType.MEETING,
          title: `Întâlnire ${inHowLong(new Date(booking.startTime), now)}`,
          message: `${who} la ${time}`,
          link: booking.contactId ? `/leads?contactId=${booking.contactId}` : '/calendar',
          category: 'meeting:reminder',
          metadata: { bookingId: booking.id, contactId: booking.contactId },
        });
        if (delivered === false) {
          this.logger.warn(`Meeting reminder for booking ${booking.id} had nowhere to go; leaving it for the next run`);
          continue;
        }
        await this.bookingRepository.update({ id: booking.id }, { hostRemindedAt: new Date() });
        sent += 1;
      } catch (error: any) {
        this.logger.warn(`Meeting reminder for booking ${booking.id} failed: ${error?.message}`);
      }
    }
    return sent;
  }
}
