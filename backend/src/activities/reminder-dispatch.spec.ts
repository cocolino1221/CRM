import { ReminderDispatchService } from './reminder-dispatch.service';
import { TaskStatus } from '../database/entities/task.entity';

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
  const push = { sendPushToUser: jest.fn().mockResolvedValue(true) };

  return {
    service: new ReminderDispatchService(taskRepository as any, bookingRepository as any, push as any),
    push,
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
  it('pushes to the assignee for a task that is due', async () => {
    const { service, push } = build([dueTask()]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(push.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(push.sendPushToUser.mock.calls[0][0]).toBe('user-1');
  });

  // Review Focus 2 — the job runs every five minutes, and a task due at 10:00
  // is still due at 10:05. Without a marker the caller is pushed forever.
  it('does not push again for a task already notified', async () => {
    const { service, push } = build([
      dueTask({ customFields: { reminderNotifiedAt: '2026-10-17T09:56:00.000Z' } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('records the marker without discarding other customFields', async () => {
    const { service, saved } = build([dueTask({ customFields: { origin: 'disposition' } })]);

    await service.dispatchDue(NOW);

    expect(saved[0].customFields).toMatchObject({ origin: 'disposition' });
    expect(saved[0].customFields.reminderNotifiedAt).toEqual(expect.any(String));
  });

  it('skips a task with no assignee', async () => {
    const { service, push } = build([dueTask({ assigneeId: null })]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('asks the database only for pending and in-progress tasks', async () => {
    const { service, taskRepository } = build([]);

    await service.dispatchDue(NOW);

    const builder = taskRepository.createQueryBuilder.mock.results[0].value;
    const params = builder.andWhere.mock.calls.map((c: any[]) => c[1]).filter(Boolean);
    const statuses = params.find((p: any) => Array.isArray(p.statuses))?.statuses;
    expect(statuses).toEqual(expect.arrayContaining([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]));
  });

  // The cron used to mark a reminder delivered whatever happened. A caller
  // who only uses the web has no device registered, so their reminder was
  // "sent" at 14:00, marked, and never shown to anyone.
  it('does not mark a reminder that had nowhere to go', async () => {
    const { service, saved, push } = build([dueTask()]);
    push.sendPushToUser.mockResolvedValue(false);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('asks only for tasks due recently, not every overdue task ever written', async () => {
    const { service, taskRepository } = build([]);

    await service.dispatchDue(NOW);

    const builder = taskRepository.createQueryBuilder.mock.results[0].value;
    const sql = builder.andWhere.mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(sql).toContain('dueDate >= :floor');
  });

  it('keeps going when one push fails', async () => {
    const { service, push } = build([dueTask(), dueTask({ id: 'task-2', assigneeId: 'user-2' })]);
    push.sendPushToUser.mockRejectedValueOnce(new Error('APNs down'));

    // One failed delivery must not cost the other caller their reminder.
    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(push.sendPushToUser).toHaveBeenCalledTimes(2);
  });
});

describe('ReminderDispatchService — lead time', () => {
  const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

  it('pushes a follow-up an hour ahead by default', async () => {
    const { service, push } = build([dueTask({ dueDate: inMinutes(55), assignee: { preferences: {} } })]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(push.sendPushToUser.mock.calls[0][1].title).toContain('Revenire');
  });

  it('waits when the follow-up is further away than the person asked for', async () => {
    const { service, push } = build([
      dueTask({ dueDate: inMinutes(55), assignee: { preferences: { reminderMinutesBefore: 15 } } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('sends nothing to someone who switched reminders off, and stops looking', async () => {
    const { service, push, saved } = build([
      dueTask({ dueDate: inMinutes(10), assignee: { preferences: { reminderMinutesBefore: 0 } } }),
    ]);

    await expect(service.dispatchDue(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
    expect(saved[0].customFields.reminderNotifiedAt).toBe('off');
  });
});

describe('ReminderDispatchService.dispatchMeetingReminders', () => {
  const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
  const booking = (overrides: any = {}) => ({
    id: 'booking-1',
    hostId: 'closer-1',
    host: { preferences: {} },
    contactId: 'contact-1',
    contact: { firstName: 'Ana', lastName: 'Pop' },
    startTime: inMinutes(50),
    hostRemindedAt: null,
    ...overrides,
  });

  it('pushes the closer an hour before by default and marks it', async () => {
    const { service, push, bookingRepository } = build([], [booking()]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(1);
    expect(push.sendPushToUser.mock.calls[0][0]).toBe('closer-1');
    expect(push.sendPushToUser.mock.calls[0][1].message).toContain('Ana Pop');
    expect(bookingRepository.update).toHaveBeenCalledWith({ id: 'booking-1' }, { hostRemindedAt: expect.any(Date) });
  });

  it('respects a closer who wants it 15 minutes before', async () => {
    const { service, push } = build([], [booking({ host: { preferences: { reminderMinutesBefore: 15 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('honours two hours ahead', async () => {
    const { service } = build([], [booking({ startTime: inMinutes(110), host: { preferences: { reminderMinutesBefore: 120 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(1);
  });

  it('sends nothing when the closer turned reminders off', async () => {
    const { service, push } = build([], [booking({ host: { preferences: { reminderMinutesBefore: 0 } } })]);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('leaves it unmarked when the push had nowhere to go', async () => {
    const { service, push, bookingRepository } = build([], [booking()]);
    push.sendPushToUser.mockResolvedValue(false);

    await expect(service.dispatchMeetingReminders(NOW)).resolves.toBe(0);
    expect(bookingRepository.update).not.toHaveBeenCalled();
  });
});
