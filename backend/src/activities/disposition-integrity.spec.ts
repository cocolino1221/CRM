import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { Activity } from '../database/entities/activity.entity';
import { Contact } from '../database/entities/contact.entity';
import { Task } from '../database/entities/task.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { User } from '../database/entities/user.entity';

const WORKSPACE = 'ws-1';
const USER = 'user-1';
const CONTACT = 'c-1';

/**
 * What the branch review found in this file: the create path had no
 * idempotency at all (its guard compares against a brand-new activity's empty
 * metadata, so it can never fire), a correction inserted a second follow-up
 * task, un-scheduling left the old one armed, and contactId was trusted
 * straight off the wire.
 */
function buildHarness(options: { existingByRequestId?: any; contact?: any; existingTask?: any; colleague?: any } = {}) {
  const saved: Record<string, any[]> = { tasks: [], deals: [], activities: [], contacts: [] };

  const contact =
    options.contact === undefined
      ? Object.assign(new Contact(), { id: CONTACT, workspaceId: WORKSPACE })
      : options.contact;

  const repoFor = (bucket: string, findOneResult: any) => ({
    findOne: jest.fn().mockResolvedValue(findOneResult),
    // The earlier-attempt lookup goes through a query builder; record what it filtered on.
    lookups: [] as Array<Record<string, any>>,
    createQueryBuilder: jest.fn(function (this: any) {
      const params: Record<string, any> = {};
      const repo = this;
      const qb: any = {
        where: jest.fn((_sql: string, p?: any) => (Object.assign(params, p), qb)),
        andWhere: jest.fn((_sql: string, p?: any) => (Object.assign(params, p), qb)),
        orderBy: jest.fn(() => qb),
        getOne: jest.fn(() => (repo.lookups.push(params), Promise.resolve(findOneResult))),
      };
      return qb;
    }),
    create: jest.fn().mockImplementation((entity: any) => ({ ...entity })),
    save: jest.fn().mockImplementation((entity: any) => {
      const persisted = { id: entity.id ?? `${bucket}-saved`, ...entity };
      saved[bucket].push(persisted);
      return Promise.resolve(persisted);
    }),
  });

  const activityRepo = repoFor('activities', options.existingByRequestId ?? null);
  const taskRepo = repoFor('tasks', options.existingTask ?? null);

  const repos = new Map<any, any>([
    [Activity, activityRepo],
    [Contact, repoFor('contacts', contact)],
    [Task, taskRepo],
    [Deal, repoFor('deals', null)],
    [User, { findOne: jest.fn().mockResolvedValue(options.colleague ?? null) }],
  ]);

  const manager = { getRepository: jest.fn((entity: any) => repos.get(entity)) };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };

  return {
    service: new ActivitiesService(activityRepo as any, dataSource as any),
    saved,
    activityRepo,
    taskRepo,
  };
}

const dto = (over: any = {}) => ({
  outcome: 'successful',
  clientRequestId: 'req-abc12345',
  ...over,
});

describe('createAndDisposition — idempotency', () => {
  it('writes the call once', async () => {
    const { service, saved } = buildHarness();

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, dto({
      deal: { value: 1500, currency: 'RON' },
    }) as any);

    expect(saved.deals).toHaveLength(1);
  });

  // The defect: a retry after a timeout created a second closed-won deal, so
  // the day's revenue doubled for one sale.
  it('returns the first result for a retry instead of selling twice', async () => {
    const already = Object.assign(new Activity(), {
      id: 'activity-1',
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      dealId: 'deal-1',
      metadata: { dispositionRequestId: 'req-abc12345' },
    });
    const { service, saved } = buildHarness({ existingByRequestId: already });

    const result = await service.createAndDisposition(WORKSPACE, USER, CONTACT, dto({
      deal: { value: 1500, currency: 'RON' },
    }) as any);

    expect(result.id).toBe('activity-1');
    expect(saved.deals).toHaveLength(0);
    expect(saved.tasks).toHaveLength(0);
  });

  it('looks for the earlier attempt by workspace and request id', async () => {
    const { service, activityRepo } = buildHarness();

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, dto() as any);

    expect(activityRepo.lookups).toEqual([
      { workspaceId: WORKSPACE, requestId: 'req-abc12345' },
    ]);
  });
});

describe('createAndDisposition — whose contact is it', () => {
  // A contactId from another workspace used to be written onto the activity
  // and the deal, so that tenant's name and email rendered on these screens.
  it('refuses a contact that is not in this workspace', async () => {
    const { service } = buildHarness({ contact: null });

    await expect(
      service.createAndDisposition(WORKSPACE, USER, 'contact-elsewhere', dto() as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('writeDisposition — the follow-up task', () => {
  const activityWith = (over: any = {}) =>
    Object.assign(new Activity(), {
      id: 'activity-1',
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      metadata: {},
      ...over,
    });

  it('creates the task once', async () => {
    const { service, saved } = buildHarness({ existingByRequestId: activityWith() });

    await service.applyDisposition(WORKSPACE, USER, 'activity-1', dto({
      followUp: { at: '2026-10-20T09:00:00.000Z', title: 'Revenire' },
    }) as any);

    expect(saved.tasks).toHaveLength(1);
  });

  // A caller fixing a typo submitted again with a new request id; the second
  // write inserted another task, so the same call pushed two reminders.
  it('does not create a second task when the outcome is corrected', async () => {
    const corrected = activityWith({
      metadata: { dispositionRequestId: 'req-older999', dispositionTaskId: 'task-1' },
    });
    const { service, saved } = buildHarness({ existingByRequestId: corrected });

    await service.applyDisposition(WORKSPACE, USER, 'activity-1', dto({
      clientRequestId: 'req-newer999',
      followUp: { at: '2026-10-21T09:00:00.000Z', title: 'Revenire' },
    }) as any);

    const created = saved.tasks.filter((t) => t.id === 'tasks-saved');
    expect(created).toHaveLength(0);
  });

  // Correcting an outcome to "failed" left the old task pending, so the
  // reminder still fired for a call that had been explicitly un-scheduled.
  it('cancels the task when a correction drops the follow-up', async () => {
    const scheduled = activityWith({
      followUpRequired: true,
      followUpDate: new Date('2026-10-20T09:00:00.000Z'),
      metadata: { dispositionRequestId: 'req-older999', dispositionTaskId: 'task-1' },
    });
    const { service, saved } = buildHarness({
      existingByRequestId: scheduled,
      existingTask: { id: 'task-1', workspaceId: WORKSPACE, status: 'pending' },
    });

    const result = await service.applyDisposition(WORKSPACE, USER, 'activity-1', dto({
      clientRequestId: 'req-newer999',
      outcome: 'failed',
    }) as any);

    expect(result.followUpRequired).toBe(false);
    expect(result.followUpDate).toBeNull();
    const cancelled = saved.tasks.find((t) => t.id === 'task-1');
    expect(cancelled?.status).toBe('cancelled');
  });
});

describe('the deal a disposition closes', () => {
  it('closes it won, with a close date', async () => {
    const activity = Object.assign(new Activity(), {
      id: 'activity-1',
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      metadata: {},
    });
    const { service, saved } = buildHarness({ existingByRequestId: activity });

    await service.applyDisposition(WORKSPACE, USER, 'activity-1', dto({
      deal: { value: 1200, currency: 'RON' },
    }) as any);

    expect(saved.deals[0].stage).toBe(DealStage.CLOSED_WON);
    expect(saved.deals[0].actualCloseDate).toBeInstanceOf(Date);
  });
});

describe('createAndDisposition — who rings back', () => {
  it('gives the reminder to the colleague picked on the sheet', async () => {
    const { service, saved } = buildHarness({ colleague: { id: 'closer-9', workspaceId: WORKSPACE } });

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, dto({
      outcome: 'no_answer',
      followUp: { at: '2026-10-21T08:00:00.000Z', assigneeId: 'closer-9' },
    }) as any);

    expect(saved.tasks[0].assigneeId).toBe('closer-9');
  });

  it('keeps it with the caller when nobody else is picked', async () => {
    const { service, saved } = buildHarness();

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, dto({
      outcome: 'no_answer',
      followUp: { at: '2026-10-21T08:00:00.000Z' },
    }) as any);

    expect(saved.tasks[0].assigneeId).toBe(USER);
  });

  it('refuses a colleague from another workspace', async () => {
    const { service } = buildHarness({ colleague: null });

    await expect(
      service.createAndDisposition(WORKSPACE, USER, CONTACT, dto({
        outcome: 'no_answer',
        followUp: { at: '2026-10-21T08:00:00.000Z', assigneeId: 'stranger-1' },
      }) as any),
    ).rejects.toThrow('Colegul ales nu a fost găsit');
  });
});
