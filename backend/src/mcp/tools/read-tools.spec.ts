import { McpAuthContext } from '../auth/mcp-auth.context';
import { ToolDef } from './tool.types';
import { createContactsReadTools } from './contacts.tools';
import { createDealsReadTools } from './deals.tools';
import { createTasksReadTools } from './tasks.tools';
import { createAnalyticsReadTools } from './analytics.tools';

function buildCtx(overrides: Partial<McpAuthContext> = {}): McpAuthContext {
  return {
    workspaceId: 'ws1',
    userId: 'u1',
    role: 'admin' as any,
    scopes: ['crm.read', 'crm.write', 'crm.automations'],
    user: { hasPermission: () => true } as any,
    ...overrides,
  };
}

function findTool(tools: ToolDef[], name: string): ToolDef {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

describe('contacts read tools', () => {
  it('search_contacts caps limit at 100 and always uses ctx.workspaceId, never input', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}` }));
    const findAll = jest.fn().mockResolvedValue({ data: rows.slice(0, 100), total: 500 });
    const tools = createContactsReadTools({ contacts: { findAll } as any });
    const tool = findTool(tools, 'search_contacts');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler(
      { search: 'jane', limit: 500, workspaceId: 'evil-ws' } as any,
      ctx,
    );

    expect(findAll).toHaveBeenCalledTimes(1);
    const [calledWorkspaceId, calledQuery] = findAll.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(calledQuery.limit).toBeLessThanOrEqual(100);
    expect(calledQuery.search).toBe('jane');
    expect((calledQuery as any).workspaceId).toBeUndefined();
    expect(result).toEqual({ data: rows.slice(0, 100), total: 500 });
  });

  it('search_contacts defaults limit to 25 when not provided', async () => {
    const findAll = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const tools = createContactsReadTools({ contacts: { findAll } as any });
    const tool = findTool(tools, 'search_contacts');
    const ctx = buildCtx();

    await tool.handler({}, ctx);

    expect(findAll.mock.calls[0][1].limit).toBe(25);
    expect(findAll.mock.calls[0][1].page).toBe(1);
  });

  it('get_contact calls findOne with ctx.workspaceId and input.id', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'c1', firstName: 'Jane' });
    const tools = createContactsReadTools({ contacts: { findOne } as any });
    const tool = findTool(tools, 'get_contact');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 'c1', workspaceId: 'evil-ws' } as any, ctx);

    expect(findOne).toHaveBeenCalledWith('ws1', 'c1', []);
    expect(result).toEqual({ id: 'c1', firstName: 'Jane' });
  });

  it('get_contact_activity calls getActivities with ctx.workspaceId and input.id', async () => {
    const getActivities = jest.fn().mockResolvedValue([{ id: 'a1' }]);
    const tools = createContactsReadTools({ contacts: { getActivities } as any });
    const tool = findTool(tools, 'get_contact_activity');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 'c1' } as any, ctx);

    expect(getActivities).toHaveBeenCalledWith('ws1', 'c1');
    expect(result).toEqual([{ id: 'a1' }]);
  });

  it('all contacts tools declare scope crm.read and permission read', () => {
    const tools = createContactsReadTools({ contacts: {} as any });
    for (const t of tools) {
      expect(t.scope).toBe('crm.read');
      expect(t.permission).toBe('read');
    }
  });
});

describe('deals read tools', () => {
  it('list_deals caps limit at 100 and uses ctx.workspaceId', async () => {
    const findAll = jest.fn().mockResolvedValue({ data: [], total: 500 });
    const tools = createDealsReadTools({ deals: { findAll } as any });
    const tool = findTool(tools, 'list_deals');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ limit: 999, workspaceId: 'evil-ws' } as any, ctx);

    const [calledWorkspaceId, calledQuery] = findAll.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(calledQuery.limit).toBeLessThanOrEqual(100);
  });

  it('get_deal_pipeline calls getPipeline with ctx.workspaceId', async () => {
    const getPipeline = jest.fn().mockResolvedValue({ stages: [] });
    const tools = createDealsReadTools({ deals: { getPipeline } as any });
    const tool = findTool(tools, 'get_deal_pipeline');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({}, ctx);

    expect(getPipeline).toHaveBeenCalledWith('ws1');
    expect(result).toEqual({ stages: [] });
  });

  it('get_deal calls findOne with ctx.workspaceId and input.id', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'd1' });
    const tools = createDealsReadTools({ deals: { findOne } as any });
    const tool = findTool(tools, 'get_deal');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 'd1' } as any, ctx);

    expect(findOne).toHaveBeenCalledWith('ws1', 'd1', []);
    expect(result).toEqual({ id: 'd1' });
  });

  it('all deals tools declare scope crm.read and permission read', () => {
    const tools = createDealsReadTools({ deals: {} as any });
    for (const t of tools) {
      expect(t.scope).toBe('crm.read');
      expect(t.permission).toBe('read');
    }
  });
});

describe('tasks read tools', () => {
  it('list_tasks caps limit at 100 and uses ctx.workspaceId', async () => {
    const findAll = jest.fn().mockResolvedValue({ data: [], total: 500 });
    const tools = createTasksReadTools({ tasks: { findAll } as any });
    const tool = findTool(tools, 'list_tasks');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ limit: 1000, workspaceId: 'evil-ws' } as any, ctx);

    const [calledWorkspaceId, calledQuery] = findAll.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(calledQuery.limit).toBeLessThanOrEqual(100);
  });

  it('declares scope crm.read and permission read', () => {
    const tools = createTasksReadTools({ tasks: {} as any });
    for (const t of tools) {
      expect(t.scope).toBe('crm.read');
      expect(t.permission).toBe('read');
    }
  });
});

describe('analytics read tools', () => {
  it('get_analytics_summary calls getComprehensiveDashboard with ctx.workspaceId', async () => {
    const getComprehensiveDashboard = jest.fn().mockResolvedValue({ totals: {} });
    const tools = createAnalyticsReadTools({ analytics: { getComprehensiveDashboard } as any });
    const tool = findTool(tools, 'get_analytics_summary');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ workspaceId: 'evil-ws' } as any, ctx);

    expect(getComprehensiveDashboard).toHaveBeenCalledWith('ws1', 'last_30_days');
    expect(result).toEqual({ totals: {} });
  });

  it('declares scope crm.read and permission read', () => {
    const tools = createAnalyticsReadTools({ analytics: {} as any });
    for (const t of tools) {
      expect(t.scope).toBe('crm.read');
      expect(t.permission).toBe('read');
    }
  });
});
