import { randomUUID } from 'crypto';
import { User, UserRole } from '../../src/database/entities/user.entity';
import { McpAuthContext } from '../../src/mcp/auth/mcp-auth.context';
import { runTool } from '../../src/mcp/tools/tool.runner';
import {
  bootstrapMcpDomainTestApp,
  buildAuthContext,
  seedUser,
  seedWorkspaceFixture,
  McpDomainTestApp,
  WorkspaceFixture,
} from './domain-test-app';

/**
 * Task 14 — the destructive-safety guarantee, exercised against the REAL
 * `runTool` choke point and real Postgres (see domain-test-app.ts):
 *
 *   1. Every destructive tool refuses to run without `confirm: true`, and
 *      the target row is provably unchanged afterward.
 *   2. Scope ceiling: a token granted only `crm.read` cannot invoke a
 *      write or destructive tool, no matter its role.
 *   3. Role floor: a SUPPORT_AGENT (read/update only) cannot create or
 *      delete, no matter its granted scopes.
 *   4. Every denial above writes an `McpToolInvocation` audit row with
 *      `status: 'denied'`.
 */
describe('MCP destructive-action safety (e2e)', () => {
  let app: McpDomainTestApp;
  let ws: WorkspaceFixture;
  let supportAgent: User;
  let ctxAdmin: McpAuthContext;

  beforeAll(async () => {
    app = await bootstrapMcpDomainTestApp();
    ws = await seedWorkspaceFixture(app, 'safety');
    supportAgent = await seedUser(app.userRepo, ws.workspaceId, UserRole.SUPPORT_AGENT, 'safety-support');
    ctxAdmin = buildAuthContext(ws.admin, ['crm.read', 'crm.write', 'crm.automations']);
  });

  afterAll(async () => {
    await app.close();
  });

  function tool(name: string) {
    const def = app.tools.get(name);
    if (!def) throw new Error(`tool not registered: ${name}`);
    return def;
  }

  function call(name: string, args: any, ctx: McpAuthContext = ctxAdmin) {
    return runTool(tool(name), args, ctx, app.invocationRepo);
  }

  async function latestInvocation(toolName: string, userId: string) {
    return app.invocationRepo.findOne({
      where: { toolName, userId },
      order: { createdAt: 'DESC' },
    });
  }

  function freshContactInput(label: string) {
    return { firstName: 'No', lastName: label, email: `${label}-${randomUUID()}@mcp-e2e.test` };
  }

  describe('destructive tools require confirm:true', () => {
    it('delete_contact without confirm is denied, and the contact is unchanged', async () => {
      await expect(call('delete_contact', { id: ws.contacts[0].id })).rejects.toThrow(/confirm/i);

      const stillThere = await app.contactRepo.findOneBy({ id: ws.contacts[0].id });
      expect(stillThere).not.toBeNull();

      const invocation = await latestInvocation('delete_contact', ws.admin.id);
      expect(invocation?.status).toBe('denied');
    });

    it('delete_deal without confirm is denied, and the deal is unchanged', async () => {
      await expect(call('delete_deal', { id: ws.deal.id })).rejects.toThrow(/confirm/i);

      const stillThere = await app.dealRepo.findOneBy({ id: ws.deal.id });
      expect(stillThere).not.toBeNull();

      const invocation = await latestInvocation('delete_deal', ws.admin.id);
      expect(invocation?.status).toBe('denied');
    });
  });

  describe('scope ceiling: a crm.read-only token cannot write or destroy', () => {
    const readOnlyCtx = () => buildAuthContext(ws.admin, ['crm.read']);

    it('create_contact (write) is denied for a read-only scope', async () => {
      await expect(
        call('create_contact', freshContactInput('scope-write'), readOnlyCtx()),
      ).rejects.toThrow(/scope/i);

      const invocation = await latestInvocation('create_contact', ws.admin.id);
      expect(invocation?.status).toBe('denied');
    });

    it('delete_contact (destructive) is denied for a read-only scope, even with confirm:true', async () => {
      await expect(
        call('delete_contact', { id: ws.contacts[0].id, confirm: true }, readOnlyCtx()),
      ).rejects.toThrow(/scope/i);

      const stillThere = await app.contactRepo.findOneBy({ id: ws.contacts[0].id });
      expect(stillThere).not.toBeNull();

      const invocation = await latestInvocation('delete_contact', ws.admin.id);
      expect(invocation?.status).toBe('denied');
    });
  });

  describe('role floor: SUPPORT_AGENT (read/update only) cannot create or delete', () => {
    const supportCtx = () => buildAuthContext(supportAgent, ['crm.read', 'crm.write', 'crm.automations']);

    it('create_contact is denied for SUPPORT_AGENT despite full scope grant', async () => {
      await expect(
        call('create_contact', freshContactInput('role-create'), supportCtx()),
      ).rejects.toThrow(/permission/i);

      const invocation = await latestInvocation('create_contact', supportAgent.id);
      expect(invocation?.status).toBe('denied');
    });

    it('delete_contact is denied for SUPPORT_AGENT despite full scope grant and confirm:true', async () => {
      await expect(
        call('delete_contact', { id: ws.contacts[0].id, confirm: true }, supportCtx()),
      ).rejects.toThrow(/permission/i);

      const stillThere = await app.contactRepo.findOneBy({ id: ws.contacts[0].id });
      expect(stillThere).not.toBeNull();

      const invocation = await latestInvocation('delete_contact', supportAgent.id);
      expect(invocation?.status).toBe('denied');
    });
  });
});
