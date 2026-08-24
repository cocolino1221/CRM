import { McpAuthContext } from '../auth/mcp-auth.context';
import { ToolDef } from './tool.types';
import { createContactsWriteTools } from './contacts.tools';
import { createDealsWriteTools } from './deals.tools';
import { createTasksWriteTools } from './tasks.tools';

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

describe('contacts write tools', () => {
  it('create_contact calls contacts.create with ctx.workspaceId, ignoring a spoofed input.workspaceId', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'c1' });
    const tools = createContactsWriteTools({ contacts: { create } as any });
    const tool = findTool(tools, 'create_contact');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler(
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        workspaceId: 'evil-ws',
      } as any,
      ctx,
    );

    expect(create).toHaveBeenCalledTimes(1);
    const [calledWorkspaceId, dto] = create.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(dto).toEqual({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });
    expect((dto as any).workspaceId).toBeUndefined();
    expect(result).toEqual({ id: 'c1' });
  });

  it('create_contact declares scope crm.write and permission create', () => {
    const tools = createContactsWriteTools({ contacts: {} as any });
    const tool = findTool(tools, 'create_contact');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('create');
  });

  it('update_contact calls contacts.update with ctx.workspaceId and input.id', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'c1', firstName: 'Jane' });
    const tools = createContactsWriteTools({ contacts: { update } as any });
    const tool = findTool(tools, 'update_contact');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 'c1', firstName: 'Janet', workspaceId: 'evil-ws' } as any, ctx);

    expect(update).toHaveBeenCalledWith('ws1', 'c1', { firstName: 'Janet' });
    expect(result).toEqual({ id: 'c1', firstName: 'Jane' });
  });

  it('update_contact declares scope crm.write and permission update', () => {
    const tools = createContactsWriteTools({ contacts: {} as any });
    const tool = findTool(tools, 'update_contact');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('update');
  });
});

describe('deals write tools', () => {
  it('create_deal calls deals.create with ctx.workspaceId, ignoring spoofed input.workspaceId', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'd1' });
    const tools = createDealsWriteTools({ deals: { create } as any });
    const tool = findTool(tools, 'create_deal');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ title: 'Big Deal', value: 5000, workspaceId: 'evil-ws' } as any, ctx);

    const [calledWorkspaceId, dto] = create.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(dto).toEqual({ title: 'Big Deal', value: 5000 });
    expect((dto as any).workspaceId).toBeUndefined();
  });

  it('create_deal declares scope crm.write and permission create', () => {
    const tools = createDealsWriteTools({ deals: {} as any });
    const tool = findTool(tools, 'create_deal');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('create');
  });

  it('update_deal_stage maps a valid stage and calls updateStage(ctx.workspaceId, id, stage)', async () => {
    const updateStage = jest.fn().mockResolvedValue({ id: 'd1', stage: 'qualified' });
    const tools = createDealsWriteTools({ deals: { updateStage } as any });
    const tool = findTool(tools, 'update_deal_stage');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 'd1', stage: 'qualified' } as any, ctx);

    expect(updateStage).toHaveBeenCalledWith('ws1', 'd1', 'qualified');
    expect(result).toEqual({ id: 'd1', stage: 'qualified' });
  });

  it('update_deal_stage throws on an invalid stage and never calls the service', async () => {
    const updateStage = jest.fn();
    const tools = createDealsWriteTools({ deals: { updateStage } as any });
    const tool = findTool(tools, 'update_deal_stage');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ id: 'd1', stage: 'not-a-real-stage' } as any, ctx)).rejects.toThrow();
    expect(updateStage).not.toHaveBeenCalled();
  });

  it('update_deal_stage declares scope crm.write and permission update', () => {
    const tools = createDealsWriteTools({ deals: {} as any });
    const tool = findTool(tools, 'update_deal_stage');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('update');
  });
});

describe('tasks write tools', () => {
  it('create_task calls tasks.create with ctx.workspaceId AND ctx.userId as creatorId', async () => {
    const create = jest.fn().mockResolvedValue({ id: 't1' });
    const tools = createTasksWriteTools({ tasks: { create } as any });
    const tool = findTool(tools, 'create_task');
    const ctx = buildCtx({ workspaceId: 'ws1', userId: 'u1' });

    await tool.handler({ title: 'Follow up', creatorId: 'evil-user' } as any, ctx);

    expect(create).toHaveBeenCalledTimes(1);
    const [calledWorkspaceId, calledCreatorId, dto] = create.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(calledCreatorId).toBe('u1');
    expect(dto).toEqual({ title: 'Follow up' });
  });

  it('create_task declares scope crm.write and permission create', () => {
    const tools = createTasksWriteTools({ tasks: {} as any });
    const tool = findTool(tools, 'create_task');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('create');
  });

  it('update_task maps a valid status and calls update(ctx.workspaceId, id, dto)', async () => {
    const update = jest.fn().mockResolvedValue({ id: 't1', status: 'completed' });
    const tools = createTasksWriteTools({ tasks: { update } as any });
    const tool = findTool(tools, 'update_task');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 't1', status: 'completed', title: 'New title' } as any, ctx);

    expect(update).toHaveBeenCalledWith('ws1', 't1', { status: 'completed', title: 'New title' });
    expect(result).toEqual({ id: 't1', status: 'completed' });
  });

  it('update_task throws on an invalid status before calling update', async () => {
    const update = jest.fn();
    const tools = createTasksWriteTools({ tasks: { update } as any });
    const tool = findTool(tools, 'update_task');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ id: 't1', status: 'bogus-status' } as any, ctx)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('update_task declares scope crm.write and permission update', () => {
    const tools = createTasksWriteTools({ tasks: {} as any });
    const tool = findTool(tools, 'update_task');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('update');
  });

  it('complete_task calls tasks.complete(ctx.workspaceId, id, notes)', async () => {
    const complete = jest.fn().mockResolvedValue({ id: 't1', status: 'completed' });
    const tools = createTasksWriteTools({ tasks: { complete } as any });
    const tool = findTool(tools, 'complete_task');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ id: 't1', notes: 'done deal' } as any, ctx);

    expect(complete).toHaveBeenCalledWith('ws1', 't1', 'done deal');
    expect(result).toEqual({ id: 't1', status: 'completed' });
  });

  it('complete_task declares scope crm.write and permission update', () => {
    const tools = createTasksWriteTools({ tasks: {} as any });
    const tool = findTool(tools, 'complete_task');
    expect(tool.scope).toBe('crm.write');
    expect(tool.permission).toBe('update');
  });
});
