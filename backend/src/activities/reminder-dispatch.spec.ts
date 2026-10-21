import { ReminderDispatchService } from './reminder-dispatch.service';
import { TaskStatus } from '../database/entities/task.entity';
import { NotificationType } from '../database/entities/notification.entity';

const WORKSPACE = 'workspace-1';
const NOW = new Date('2026-10-17T10:00:00Z');

function build(tasks: any[], bookings: any[] = []) {
  const saved: any[] = [];
  const taskRepository = {
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(tasks),
    })),
    save: jest.fn().mockImplementation((t: any) => {
      saved.push(t);
      return Promise.resolve(t);
    }),
  };
  const bookingRepository = {
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(bookings),
    })),
    update: jest.fn().mockResolvedValue({}),
  };
  // The reminder now goes out as an in-app notification row; the push rides
  // along inside NotificationsService.create, which swallows its own errors.
  const notifications = {
    create: jest.fn().mockImplementation((workspaceId: string, dto: any) =>
      Promise.resolve({ id: 'notification-1', workspaceId, ...dto }),
    ),
  };

  return {
    service: new ReminderDispatchService(taskRepository as any, bookingRepository as any, notifications as any),
    notifications,
    saved,
    taskRepository,
    bookingRepository,
  };
}

const dueTask = (overrides: any = {}) => ({
  id: 'task-1',
  workspaceId: WORKSPACE,
  title: 'Revenire apel',
  assigneeId: 'user-1',
  contactId: 'contact-1',
  dueDate: new Date('2026-10-17T09:55:00Z'),
  status: TaskStatus.PENDING,
  customFields: {},
  ...overrides,
});

describe('ReminderDispatchService.dispatchDue', () => {
  it('notifies the assignee for a task that is due', async () => {
    const { service, notifications } = build([dueTask()]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toBe(WORKSPACE);
    expect(notifications.create.mock.calls[0][1]).toMatchObject({ userId: 'user-1' });
  });

  // Production had five "Revenire" tasks all marked reminderNotifiedAt and
  // not one `task` row in notifications: the job only ever pushed. The row is
  // what the notification list in the app reads.
  it('writes an in-app notification row the app can list and deep-link', async () => {
    const { service, notifications } = build([dueTask()]);

    await service.dispatchDue(NOW);

    expect(notifications.create).toHaveBeenCalledWith(WORKSPACE, {
      type: NotificationType.TASK,
      userId: 'user-1',
      // dueTask() is already past due, so it reads as a plain memento; the
      // "Revenire in X" wording is covered in the lead-time block below.
      title: 'Memento',
      message: 'Revenire apel',
      link: '/leads?contactId=contact-1',
      category: 'task:reminder',
      metadata: { taskId: 'task-1', contactId: 'contact-1' },
    });
  });

  // Review Focus 2 — the job runs every five minutes, and a task due at 10:00
  // is still due at 10:05. Without a marker the caller is pushed forever.
  it('does not notify again for a task already notified', async () => {
    const { service, notifications } = build([
      dueTask({ customFields: { reminderNotifiedAt: '2026-10-17T09:56:00.000Z' } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('records the marker without discarding other customFields', async () => {
    const { service, saved } = build([dueTask({ customFields: { origin: 'disposition' } })]);

    await service.dispatchDue(NOW);

    expect(saved[0].customFields).toMatchObject({ origin: 'disposition' });
    expect(saved[0].customFields.reminderNotifiedAt).toEqual(expect.any(String));
  });

  it('skips a task with no assignee', async () => {
    const { service, notifications } = build([dueTask({ assigneeId: null })]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('asks the database only for pending and in-progress tasks', async () => {
    const { service, taskRepository } = build([]);

    await service.dispatchDue(NOW);

    const builder = taskRepository.createQueryBuilder.mock.results[0].value;
    const params = builder.andWhere.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
    const statuses = params.find((p: any) => Array.isArray(p.statuses))?.statuses;
    expect(statuses).toEqual(expect.arrayContaining([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]));
  });

  // The cron used to mark a reminder delivered whatever happened, on the word
  // of a push call that returned true as soon as the user had a device token.
  // Now the marker follows the row: no row, no marker, and the next run
  // tries again.
  it('does not mark a reminder whose notification row failed to write', async () => {
    const { service, saved, notifications } = build([dueTask()]);
    notifications.create.mockRejectedValue(new Error('db down'));

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(saved).toHaveLength(0);
  });

  // A caller who only uses the web has no device registered. The push is
  // nothing to wait on — create() fires it itself and keeps its own failures
  // to itself — so the reminder is delivered and marked all the same.
  it('marks a reminder delivered in-app even with no device to push to', async () => {
    const { service, saved } = build([dueTask()]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(saved[0].customFields.reminderNotifiedAt).toEqual(expect.any(String));
  });

  it('asks only for tasks due recently, not every overdue task ever written', async () => {
    const { service, taskRepository } = build([]);

    await service.dispatchDue(NOW);

    const builder = taskRepository.createQueryBuilder.mock.results[0].value;
    const sql = builder.andWhere.mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(sql).toContain('dueDate >= :floor');
  });

  it('keeps going when one notification fails', async () => {
    const { service, notifications } = build([dueTask(), dueTask({ id: 'task-2', assigneeId: 'user-2' })]);
    notifications.create.mockRejectedValueOnce(new Error('db hiccup'));

    // One failed delivery must not cost the other caller their reminder.
    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(notifications.create).toHaveBeenCalledTimes(2);
  });
});

describe('ReminderDispatchService — lead time', () => {
  const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

  it('notifies about a follow-up an hour ahead by default', async () => {
    const { service, notifications } = build([dueTask({ dueDate: inMinutes(55), assignee: { preferences: {} } })]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(notifications.create.mock.calls[0][1].title).toContain('Revenire');
  });

  it('waits when the follow-up is further away than the person asked for', async () => {
    const { service, notifications } = build([
      dueTask({ dueDate: inMinutes(55), assignee: { preferences: { reminderMinutesBefore: 15 } } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('sends nothing to someone who switched reminders off, and stops looking', async () => {
    const { service, notifications, saved } = build([
      dueTask({ dueDate: inMinutes(10), assignee: { preferences: { reminderMinutesBefore: 0 } } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
    expect(saved[0].customFields.reminderNotifiedAt).toBe('off');
  });
});

describe('ReminderDispatchService.dispatchMeetingReminders', () => {
  const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
  const booking = (overrides: any = {}) => ({
    id: 'booking-1',
    workspaceId: WORKSPACE,
    hostId: 'closer-1',
    host: { preferences: {} },
    contactId: 'contact-1',
    contact: { firstName: 'Ana', lastName: 'Pop' },
    startTime: inMinutes(50),
    hostRemindedAt: null,
    ...overrides,
  });

  it('notifies the closer an hour before by default and marks it', async () => {
    const { service, notifications, bookingRepository } = build([], [booking()]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(1);
    expect(notifications.create.mock.calls[0][0]).toBe(WORKSPACE);
    expect(notifications.create.mock.calls[0][1]).toMatchObject({
      type: NotificationType.MEETING,
      userId: 'closer-1',
      category: 'meeting:reminder',
      metadata: { bookingId: 'booking-1', contactId: 'contact-1' },
    });
    expect(notifications.create.mock.calls[0][1].message).toContain('Ana Pop');
    expect(bookingRepository.update).toHaveBeenCalledWith({ id: 'booking-1' }, { hostRemindedAt: expect.any(Date) });
  });

  it('respects a closer who wants it 15 minutes before', async () => {
    const { service, notifications } = build([], [booking({ host: { preferences: { reminderMinutesBefore: 15 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('honours two hours ahead', async () => {
    const { service } = build([], [booking({ startTime: inMinutes(110), host: { preferences: { reminderMinutesBefore: 120 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(1);
  });

  it('sends nothing when the closer turned reminders off', async () => {
    const { service, notifications } = build([], [booking({ host: { preferences: { reminderMinutesBefore: 0 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('leaves it unmarked when the notification row failed to write', async () => {
    const { service, notifications, bookingRepository } = build([], [booking()]);
    notifications.create.mockRejectedValue(new Error('db down'));

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(bookingRepository.update).not.toHaveBeenCalled();
  });
});
