import { NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { Activity, ActivityOutcome } from '../database/entities/activity.entity';
import { Contact } from '../database/entities/contact.entity';
import { Task } from '../database/entities/task.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
import { User } from '../database/entities/user.entity';

const WORKSPACE = 'workspace-1';
const USER = 'user-1';
const ACTIVITY = 'activity-1';
const CONTACT = 'contact-1';

/**
 * The disposition runs entirely through the transaction manager's repositories,
 * so the test mocks the manager rather than individual injected repositories.
 */
function buildHarness(options: { activity?: Partial<Activity> | null; role?: string; contact?: Partial<Contact>; openTask?: any } = {}) {
  const activity = options.activity === null
    ? null
    : Object.assign(new Activity(), {
        id: ACTIVITY,
        workspaceId: WORKSPACE,
        contactId: CONTACT,
        metadata: {},
        ...options.activity,
      });

  const contact = Object.assign(new Contact(), { id: CONTACT, workspaceId: WORKSPACE, ...options.contact });

  const saved: { tasks: any[]; deals: any[]; activities: any[]; contacts: any[] } = {
    tasks: [], deals: [], activities: [], contacts: [],
  };

  const repoFor = (bucket: keyof typeof saved, findOneResult: any) => ({
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
      const persisted = { id: `${bucket}-saved`, ...entity };
      saved[bucket].push(persisted);
      return Promise.resolve(persisted);
    }),
  });

  const repos = new Map<any, any>([
    [Activity, repoFor('activities', activity)],
    [Contact, repoFor('contacts', contact)],
    [Task, repoFor('tasks', options.openTask ?? null)],
    [Deal, repoFor('deals', null)],
    [User, repoFor('contacts', { id: USER, role: options.role ?? 'closer' })],
  ]);

  const manager = { getRepository: jest.fn((entity: any) => repos.get(entity)) };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
  };

  const service = new ActivitiesService(
    repos.get(Activity) as any,
    dataSource as any,
  );

  return { service, repos, saved, dataSource, activity };
}

const baseDto = {
  outcome: ActivityOutcome.SUCCESSFUL,
  clientRequestId: 'req-1',
};

describe('ActivitiesService.applyDisposition', () => {
  it('sets outcome and followUpNotes on the activity', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, {
      ...baseDto,
      notes: 'Revine marti',
    });

    expect(saved.activities[0]).toMatchObject({
      outcome: ActivityOutcome.SUCCESSFUL,
      followUpNotes: 'Revine marti',
    });
  });

  it('creates a Task when followUp is given, with dueDate and the caller as assignee', async () => {
    const { service, saved } = buildHarness();
    const at = '2026-10-20T09:00:00.000Z';

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, followUp: { at } });

    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({
      workspaceId: WORKSPACE,
      assigneeId: USER,
      contactId: CONTACT,
    });
    expect(new Date(saved.tasks[0].dueDate).toISOString()).toBe(at);
    expect(saved.activities[0]).toMatchObject({ followUpRequired: true });
  });

  it('moves the lead\'s open call-back instead of adding a second one', async () => {
    const openTask = { id: 'task-open', status: 'pending', dueDate: new Date('2026-10-20T13:00:00Z'), customFields: { origin: 'disposition' } };
    const { service, saved } = buildHarness({ openTask });
    const at = '2026-10-21T08:00:00.000Z';

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, followUp: { at } });

    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0].id).toBe('task-open');
    expect(new Date(saved.tasks[0].dueDate).toISOString()).toBe(at);
    expect(saved.activities[0].metadata.dispositionTaskId).toBe('task-open');
  });

  it('creates a Deal with the given value', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, {
      ...baseDto,
      deal: { value: 1200, currency: 'RON' },
    });

    expect(saved.deals).toHaveLength(1);
    expect(saved.deals[0]).toMatchObject({ value: 1200, currency: 'RON', workspaceId: WORKSPACE });

    // A deal left on the default stage never reaches the reports: dealsWon
    // and revenue both count only closed-won. The caller typing an amount is
    // telling us the sale happened on this call.
    expect(saved.deals[0].stage).toBe(DealStage.CLOSED_WON);
    expect(saved.deals[0].actualCloseDate).toBeInstanceOf(Date);
    expect(saved.deals[0].probability).toBe(100);
  });

  it('updates contact.lastContactedAt', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, baseDto);

    expect(saved.contacts[0].lastContactedAt).toBeInstanceOf(Date);
  });

  it('shows the note in the lead history, not only in followUpNotes', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, notes: 'Anul viitor' });

    expect(saved.activities[0]).toMatchObject({ followUpNotes: 'Anul viitor', description: 'Anul viitor' });
  });

  it('puts the closer who called on a lead that had no closer', async () => {
    const { service, saved } = buildHarness({ role: 'closer' });
    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, baseDto);
    expect(saved.contacts[0].closerId).toBe(USER);
  });

  it('puts a caller on as caller, not closer', async () => {
    const { service, saved } = buildHarness({ role: 'caller' });
    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, baseDto);
    expect(saved.contacts[0]).toMatchObject({ callerId: USER });
    expect(saved.contacts[0].closerId).toBeUndefined();
  });

  it('never replaces someone already assigned', async () => {
    const { service, saved } = buildHarness({ role: 'closer', contact: { closerId: 'someone-else' } });
    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, baseDto);
    expect(saved.contacts[0].closerId).toBe('someone-else');
  });

  it('does not assign an admin who logs a call', async () => {
    const { service, saved } = buildHarness({ role: 'admin' });
    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, baseDto);
    expect(saved.contacts[0].closerId).toBeUndefined();
    expect(saved.contacts[0].callerId).toBeUndefined();
  });

  // Review Focus 1 — a caller on bad signal submits, times out, and retries.
  it('is idempotent: the same clientRequestId twice creates one Task and one Deal', async () => {
    const { service, saved } = buildHarness();
    const dto = {
      ...baseDto,
      followUp: { at: '2026-10-20T09:00:00.000Z' },
      deal: { value: 500, currency: 'RON' },
    };

    const first = await service.applyDisposition(WORKSPACE, USER, ACTIVITY, dto);

    // The retry sees the activity as the first call left it.
    const replay = buildHarness({
      activity: { metadata: { dispositionRequestId: 'req-1' }, outcome: ActivityOutcome.SUCCESSFUL },
    });
    await replay.service.applyDisposition(WORKSPACE, USER, ACTIVITY, dto);

    expect(saved.tasks).toHaveLength(1);
    expect(saved.deals).toHaveLength(1);
    expect(replay.saved.tasks).toHaveLength(0);
    expect(replay.saved.deals).toHaveLength(0);
    expect(first).toBeDefined();
  });

  // Review Focus 3 — the id is a UUID in a URL; only the filter stops a cross-tenant write.
  it('throws NotFoundException for an activity in another workspace', async () => {
    const { service } = buildHarness({ activity: null });

    await expect(
      service.applyDisposition(WORKSPACE, USER, 'activity-elsewhere', baseDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Review Focus 4 — a caller corrects a mistake.
  it('re-dispositioning with a new clientRequestId updates the outcome without a second Deal', async () => {
    const { service, saved } = buildHarness({
      activity: { metadata: { dispositionRequestId: 'req-1' }, dealId: 'deal-existing' },
    });

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, {
      outcome: ActivityOutcome.NO_ANSWER,
      clientRequestId: 'req-2',
      deal: { value: 900, currency: 'RON' },
    });

    expect(saved.activities[0]).toMatchObject({ outcome: ActivityOutcome.NO_ANSWER });
    expect(saved.deals).toHaveLength(0);
  });

  it('propagates a failure from Deal creation so the transaction rolls back', async () => {
    const { service, repos } = buildHarness();
    repos.get(Deal).save.mockRejectedValue(new Error('deal insert failed'));

    await expect(
      service.applyDisposition(WORKSPACE, USER, ACTIVITY, {
        ...baseDto,
        followUp: { at: '2026-10-20T09:00:00.000Z' },
        deal: { value: 100, currency: 'RON' },
      }),
    ).rejects.toThrow('deal insert failed');
  });
});

describe('ActivitiesService.createAndDisposition', () => {
  it('creates a CALL activity for the contact and dispositions it', async () => {
    const { service, saved } = buildHarness({ activity: null });

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, {
      ...baseDto,
      notes: 'Sunat de pe mobil',
    });

    expect(saved.activities).toHaveLength(1);
    expect(saved.activities[0]).toMatchObject({
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      userId: USER,
      outcome: ActivityOutcome.SUCCESSFUL,
      followUpNotes: 'Sunat de pe mobil',
    });
  });
});

/**
 * A closer writes what she learned about someone and expects to find it on the
 * lead. It only ever reached the activity, so the "Notițe" box on the lead
 * showed whatever the WooCommerce ingest had put there and her note looked
 * lost. Reported from the field on 21.10.2026.
 */
describe('ActivitiesService — the call note reaches the lead\'s Notes', () => {
  it('writes the note the caller typed into the lead\'s Notes', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, {
      ...baseDto,
      notes: 'Perioadă aglomerată, revine după divorț',
    });

    expect(saved.contacts[0].notes).toContain('Perioadă aglomerată, revine după divorț');
  });

  it('keeps what the Notes already held', async () => {
    const { service, saved } = buildHarness({
      contact: { notes: 'WooCommerce order #4967: 1× Ghid pentru sportivi' },
    });

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, notes: 'E deja in echipa' });

    expect(saved.contacts[0].notes).toContain('E deja in echipa');
    expect(saved.contacts[0].notes).toContain('WooCommerce order #4967');
  });

  it('puts the newest note first, so the lead opens on what was just said', async () => {
    const { service, saved } = buildHarness({ contact: { notes: 'Nota veche' } });

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, notes: 'Nota nouă' });

    const notes: string = saved.contacts[0].notes;
    expect(notes).toContain('Nota nouă');
    expect(notes).toContain('Nota veche');
    expect(notes.indexOf('Nota nouă')).toBeLessThan(notes.indexOf('Nota veche'));
  });

  it('dates the entry so a long lead history stays readable', async () => {
    const { service, saved } = buildHarness();

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, notes: 'Revine marti' });

    expect(saved.contacts[0].notes).toMatch(/^\d{2}\.\d{2}\.\d{4} — Revine marti/);
  });

  // Saving the same call again (a correction, or a caller who thought the
  // first save did nothing) must not stack the same sentence twice.
  it('does not write the same note twice when the call is saved again', async () => {
    const { service, saved } = buildHarness({
      contact: { notes: '20.10.2026 — E deja in echipa' },
    });

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto, notes: 'E deja in echipa' });

    const occurrences = saved.contacts[0].notes.split('E deja in echipa').length - 1;
    expect(occurrences).toBe(1);
  });

  it('leaves the Notes alone when the caller typed no note', async () => {
    const { service, saved } = buildHarness({ contact: { notes: 'Nota existenta' } });

    await service.applyDisposition(WORKSPACE, USER, ACTIVITY, { ...baseDto });

    expect(saved.contacts[0].notes).toBe('Nota existenta');
  });

  it('writes the note from a call logged on the phone too', async () => {
    const { service, saved } = buildHarness({ activity: null });

    await service.createAndDisposition(WORKSPACE, USER, CONTACT, {
      ...baseDto,
      notes: 'Sunat de pe mobil',
    });

    expect(saved.contacts[0].notes).toContain('Sunat de pe mobil');
  });
});
