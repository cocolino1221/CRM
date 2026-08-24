import { DealStage } from '../../src/database/entities/deal.entity';
import { TaskStatus } from '../../src/database/entities/task.entity';
import { McpAuthContext } from '../../src/mcp/auth/mcp-auth.context';
import { runTool } from '../../src/mcp/tools/tool.runner';
import {
  bootstrapMcpDomainTestApp,
  buildAuthContext,
  seedWorkspaceFixture,
  McpDomainTestApp,
  WorkspaceFixture,
} from './domain-test-app';

/**
 * Task 14 — the release-blocker guarantee: one workspace's MCP access can
 * never read, mutate, or delete another workspace's data. Runs the REAL
 * ContactsService/DealsService/TasksService/AnalyticsService against a real
 * Postgres (see domain-test-app.ts) and invokes tools through the real
 * `runTool` choke point — nothing here is mocked.
 *
 * Two workspaces (A, B) are seeded with their own contacts/deal/task. Every
 * assertion is made from workspace A's (ctxA) point of view: list/read
 * tools must return ONLY A's rows, and any call that targets a B-owned id
 * must fail with B's row provably unchanged afterward.
 */
describe('MCP tenant isolation (e2e)', () => {
  let app: McpDomainTestApp;
  let wsA: WorkspaceFixture;
  let wsB: WorkspaceFixture;
  let ctxA: McpAuthContext;

  beforeAll(async () => {
    app = await bootstrapMcpDomainTestApp();
    wsA = await seedWorkspaceFixture(app, 'wsA');
    wsB = await seedWorkspaceFixture(app, 'wsB');
    ctxA = buildAuthContext(wsA.admin, ['crm.read', 'crm.write', 'crm.automations']);
  });

  afterAll(async () => {
    await app.close();
  });

  function tool(name: string) {
    const def = app.tools.get(name);
    if (!def) throw new Error(`tool not registered: ${name}`);
    return def;
  }

  function call(name: string, args: any, ctx: McpAuthContext = ctxA) {
    return runTool(tool(name), args, ctx, app.invocationRepo);
  }

  describe('list/read tools never include another workspace\'s rows', () => {
    it('search_contacts returns only ws-A contacts', async () => {
      const result = await call('search_contacts', {});
      const ids = result.contacts.map((c: any) => c.id);
      expect(ids.slice().sort()).toEqual(wsA.contacts.map((c) => c.id).sort());
      for (const bId of wsB.contacts.map((c) => c.id)) {
        expect(ids).not.toContain(bId);
      }
    });

    it('list_deals returns only ws-A deals', async () => {
      const result = await call('list_deals', {});
      const ids = result.data.map((d: any) => d.id);
      expect(ids).toContain(wsA.deal.id);
      expect(ids).not.toContain(wsB.deal.id);
    });

    it('list_tasks returns only ws-A tasks', async () => {
      const result = await call('list_tasks', {});
      const ids = result.data.map((t: any) => t.id);
      expect(ids).toContain(wsA.task.id);
      expect(ids).not.toContain(wsB.task.id);
    });

    it('get_deal_pipeline returns only ws-A deals across every stage', async () => {
      const result = await call('get_deal_pipeline', {});
      const ids = result.pipeline.flatMap((stageGroup: any) => stageGroup.deals.map((d: any) => d.id));
      expect(ids).toContain(wsA.deal.id);
      expect(ids).not.toContain(wsB.deal.id);
    });

    it('get_analytics_summary counts only ws-A rows, not ws-A + ws-B', async () => {
      const result = await call('get_analytics_summary', {});
      expect(result.overview.contacts.total).toBe(wsA.contacts.length);
      expect(result.overview.deals.total).toBe(1);
      expect(result.overview.tasks.total).toBe(1);
    });
  });

  describe('single-record read tools fail on another workspace\'s id', () => {
    it('get_contact with a B-owned id fails under ctxA (not found)', async () => {
      await expect(call('get_contact', { id: wsB.contacts[0].id })).rejects.toThrow();
    });

    it('get_deal with a B-owned id fails under ctxA (not found)', async () => {
      await expect(call('get_deal', { id: wsB.deal.id })).rejects.toThrow();
    });
  });

  describe('safe-write tools cannot mutate another workspace\'s row', () => {
    it('update_contact on a B-owned id fails, and B\'s contact is unchanged', async () => {
      const before = await app.contactRepo.findOneBy({ id: wsB.contacts[0].id });
      await expect(
        call('update_contact', { id: wsB.contacts[0].id, firstName: 'HACKED' }),
      ).rejects.toThrow();

      const after = await app.contactRepo.findOneBy({ id: wsB.contacts[0].id });
      expect(after).not.toBeNull();
      expect(after!.firstName).toBe(before!.firstName);
      expect(after!.firstName).not.toBe('HACKED');
    });

    it('update_deal_stage on a B-owned id fails, and B\'s deal is unchanged', async () => {
      const before = await app.dealRepo.findOneBy({ id: wsB.deal.id });
      expect(before!.stage).not.toBe(DealStage.CLOSED_WON);

      await expect(
        call('update_deal_stage', { id: wsB.deal.id, stage: DealStage.CLOSED_WON }),
      ).rejects.toThrow();

      const after = await app.dealRepo.findOneBy({ id: wsB.deal.id });
      expect(after).not.toBeNull();
      expect(after!.stage).toBe(before!.stage);
      expect(after!.stage).not.toBe(DealStage.CLOSED_WON);
    });

    it('update_task on a B-owned id fails, and B\'s task is unchanged', async () => {
      const before = await app.taskRepo.findOneBy({ id: wsB.task.id });
      expect(before!.status).not.toBe(TaskStatus.COMPLETED);

      await expect(
        call('update_task', { id: wsB.task.id, status: TaskStatus.COMPLETED }),
      ).rejects.toThrow();

      const after = await app.taskRepo.findOneBy({ id: wsB.task.id });
      expect(after).not.toBeNull();
      expect(after!.status).toBe(before!.status);
      expect(after!.status).not.toBe(TaskStatus.COMPLETED);
    });
  });

  describe('destructive tools cannot delete another workspace\'s row', () => {
    it('delete_contact on a B-owned id (with confirm:true) fails; B\'s contact still exists', async () => {
      await expect(
        call('delete_contact', { id: wsB.contacts[1].id, confirm: true }),
      ).rejects.toThrow();

      const stillThere = await app.contactRepo.findOneBy({ id: wsB.contacts[1].id });
      expect(stillThere).not.toBeNull();
    });

    it('delete_deal on a B-owned id (with confirm:true) fails; B\'s deal still exists', async () => {
      await expect(
        call('delete_deal', { id: wsB.deal.id, confirm: true }),
      ).rejects.toThrow();

      const stillThere = await app.dealRepo.findOneBy({ id: wsB.deal.id });
      expect(stillThere).not.toBeNull();
    });
  });
});
