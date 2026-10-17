import { ReminderDispatchService } from './reminder-dispatch.service';
import { TaskStatus } from '../database/entities/task.entity';

const WORKSPACE = 'workspace-1';
const NOW = new Date('2026-10-17T10:00:00Z');

function build(tasks: any[]) {
  const saved: any[] = [];
  const taskRepository = {
    createQueryBuilder: jest.fn(() => ({
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
  const push = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new ReminderDispatchService(taskRepository as any, push as any),
    push,
    saved,
    taskRepository,
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

  it('keeps going when one push fails', async () => {
    const { service, push } = build([dueTask(), dueTask({ id: 'task-2', assigneeId: 'user-2' })]);
    push.sendPushToUser.mockRejectedValueOnce(new Error('APNs down'));

    // One failed delivery must not cost the other caller their reminder.
    await expect(service.dispatchDue(NOW)).resolves.toBe(1);
    expect(push.sendPushToUser).toHaveBeenCalledTimes(2);
  });
});
