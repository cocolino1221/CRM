import { McpAuthContext } from '../auth/mcp-auth.context';
import { ToolDef } from './tool.types';
import { createContactsDestructiveTools } from './contacts.tools';
import { createDealsDestructiveTools } from './deals.tools';
import { createWorkflowsDestructiveTools } from './workflows.tools';
import { createWhatsAppDestructiveTools } from './whatsapp.tools';
import { createEmailCampaignsDestructiveTools } from './email-campaigns.tools';

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

describe('destructive/automation tools — universal invariants', () => {
  it('every destructive ToolDef has destructive === true and scope crm.automations', () => {
    const allTools: ToolDef[] = [
      ...createContactsDestructiveTools({ contacts: {} as any }),
      ...createDealsDestructiveTools({ deals: {} as any }),
      ...createWorkflowsDestructiveTools({ workflows: {} as any }),
      ...createWhatsAppDestructiveTools({ whatsapp: {} as any }),
      ...createEmailCampaignsDestructiveTools({ campaigns: {} as any }),
    ];

    expect(allTools.length).toBeGreaterThan(0);
    for (const t of allTools) {
      expect(t.destructive).toBe(true);
      expect(t.scope).toBe('crm.automations');
    }
  });
});

describe('delete_contact', () => {
  it('re-fetches scoped to ctx.workspaceId, then removes', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'c1' });
    const remove = jest.fn().mockResolvedValue(undefined);
    const tools = createContactsDestructiveTools({ contacts: { findOne, remove } as any });
    const tool = findTool(tools, 'delete_contact');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ id: 'c1', confirm: true, workspaceId: 'evil-ws' } as any, ctx);

    expect(findOne).toHaveBeenCalledWith('ws1', 'c1');
    expect(remove).toHaveBeenCalledWith('ws1', 'c1');
    const findOneOrder = findOne.mock.invocationCallOrder[0];
    const removeOrder = remove.mock.invocationCallOrder[0];
    expect(findOneOrder).toBeLessThan(removeOrder);
  });

  it('does not call remove when the re-fetch throws (not found / other workspace)', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('not found'));
    const remove = jest.fn();
    const tools = createContactsDestructiveTools({ contacts: { findOne, remove } as any });
    const tool = findTool(tools, 'delete_contact');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ id: 'c1', confirm: true } as any, ctx)).rejects.toThrow('not found');
    expect(remove).not.toHaveBeenCalled();
  });

  it('declares permission delete', () => {
    const tools = createContactsDestructiveTools({ contacts: {} as any });
    const tool = findTool(tools, 'delete_contact');
    expect(tool.permission).toBe('delete');
  });
});

describe('delete_deal', () => {
  it('re-fetches scoped to ctx.workspaceId, then removes', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'd1' });
    const remove = jest.fn().mockResolvedValue({ message: 'Deal deleted successfully' });
    const tools = createDealsDestructiveTools({ deals: { findOne, remove } as any });
    const tool = findTool(tools, 'delete_deal');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ id: 'd1', confirm: true, workspaceId: 'evil-ws' } as any, ctx);

    expect(findOne).toHaveBeenCalledWith('ws1', 'd1');
    expect(remove).toHaveBeenCalledWith('ws1', 'd1');
  });

  it('does not call remove when the re-fetch throws', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('not found'));
    const remove = jest.fn();
    const tools = createDealsDestructiveTools({ deals: { findOne, remove } as any });
    const tool = findTool(tools, 'delete_deal');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ id: 'd1', confirm: true } as any, ctx)).rejects.toThrow('not found');
    expect(remove).not.toHaveBeenCalled();
  });

  it('declares permission delete', () => {
    const tools = createDealsDestructiveTools({ deals: {} as any });
    const tool = findTool(tools, 'delete_deal');
    expect(tool.permission).toBe('delete');
  });
});

describe('trigger_workflow', () => {
  it('calls findOne(workflowId, ctx.workspaceId) BEFORE execute(workflowId, triggerData)', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'w1', status: 'active' });
    const execute = jest.fn().mockResolvedValue({ id: 'exec1' });
    const tools = createWorkflowsDestructiveTools({ workflows: { findOne, execute } as any });
    const tool = findTool(tools, 'trigger_workflow');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler(
      { workflowId: 'w1', triggerData: { foo: 'bar' }, confirm: true } as any,
      ctx,
    );

    expect(findOne).toHaveBeenCalledWith('w1', 'ws1');
    expect(execute).toHaveBeenCalledWith('w1', { foo: 'bar' });
    const findOneOrder = findOne.mock.invocationCallOrder[0];
    const executeOrder = execute.mock.invocationCallOrder[0];
    expect(findOneOrder).toBeLessThan(executeOrder);
    expect(result).toEqual({ id: 'exec1' });
  });

  it('defaults triggerData to {} when not provided', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'w1' });
    const execute = jest.fn().mockResolvedValue({ id: 'exec1' });
    const tools = createWorkflowsDestructiveTools({ workflows: { findOne, execute } as any });
    const tool = findTool(tools, 'trigger_workflow');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler({ workflowId: 'w1', confirm: true } as any, ctx);

    expect(execute).toHaveBeenCalledWith('w1', {});
  });

  it('does not call execute when findOne throws (workflow not found / wrong workspace)', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('Workflow not found'));
    const execute = jest.fn();
    const tools = createWorkflowsDestructiveTools({ workflows: { findOne, execute } as any });
    const tool = findTool(tools, 'trigger_workflow');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ workflowId: 'w1', confirm: true } as any, ctx)).rejects.toThrow(
      'Workflow not found',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('declares permission update', () => {
    const tools = createWorkflowsDestructiveTools({ workflows: {} as any });
    const tool = findTool(tools, 'trigger_workflow');
    expect(tool.permission).toBe('update');
  });
});

describe('send_whatsapp_message', () => {
  it('calls sendMessageForWorkspace with ctx.workspaceId and a text message built from input', async () => {
    const sendMessageForWorkspace = jest.fn().mockResolvedValue({ result: { messages: [{ id: 'wamid.1' }] } });
    const tools = createWhatsAppDestructiveTools({ whatsapp: { sendMessageForWorkspace } as any });
    const tool = findTool(tools, 'send_whatsapp_message');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler(
      { to: '16505551111', text: 'Hello there', confirm: true, workspaceId: 'evil-ws' } as any,
      ctx,
    );

    expect(sendMessageForWorkspace).toHaveBeenCalledTimes(1);
    const [calledWorkspaceId, message] = sendMessageForWorkspace.mock.calls[0];
    expect(calledWorkspaceId).toBe('ws1');
    expect(message).toEqual({ to: '16505551111', type: 'text', content: 'Hello there' });
  });

  it('passes an optional integrationId through', async () => {
    const sendMessageForWorkspace = jest.fn().mockResolvedValue({ result: {} });
    const tools = createWhatsAppDestructiveTools({ whatsapp: { sendMessageForWorkspace } as any });
    const tool = findTool(tools, 'send_whatsapp_message');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await tool.handler(
      { to: '16505551111', text: 'Hi', integrationId: 'int1', confirm: true } as any,
      ctx,
    );

    expect(sendMessageForWorkspace).toHaveBeenCalledWith(
      'ws1',
      { to: '16505551111', type: 'text', content: 'Hi' },
      'int1',
    );
  });

  it('declares permission update', () => {
    const tools = createWhatsAppDestructiveTools({ whatsapp: {} as any });
    const tool = findTool(tools, 'send_whatsapp_message');
    expect(tool.permission).toBe('update');
  });
});

describe('send_email_campaign', () => {
  it('calls findOne(ctx.workspaceId, campaignId) BEFORE sendAsync(ctx.workspaceId, campaignId)', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 'camp1', workspaceId: 'ws1' });
    const sendAsync = jest.fn().mockResolvedValue({ message: 'Campaign started. Sending in background.', total: 10 });
    const tools = createEmailCampaignsDestructiveTools({ campaigns: { findOne, sendAsync } as any });
    const tool = findTool(tools, 'send_email_campaign');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    const result = await tool.handler({ campaignId: 'camp1', confirm: true, workspaceId: 'evil-ws' } as any, ctx);

    expect(findOne).toHaveBeenCalledWith('ws1', 'camp1');
    expect(sendAsync).toHaveBeenCalledWith('ws1', 'camp1');
    const findOneOrder = findOne.mock.invocationCallOrder[0];
    const sendAsyncOrder = sendAsync.mock.invocationCallOrder[0];
    expect(findOneOrder).toBeLessThan(sendAsyncOrder);
    expect(result).toEqual({ message: 'Campaign started. Sending in background.', total: 10 });
  });

  it('does not call sendAsync when the campaign belongs to another workspace (findOne throws)', async () => {
    const findOne = jest.fn().mockRejectedValue(new Error('Campaign not found'));
    const sendAsync = jest.fn();
    const tools = createEmailCampaignsDestructiveTools({ campaigns: { findOne, sendAsync } as any });
    const tool = findTool(tools, 'send_email_campaign');
    const ctx = buildCtx({ workspaceId: 'ws1' });

    await expect(tool.handler({ campaignId: 'camp1', confirm: true } as any, ctx)).rejects.toThrow(
      'Campaign not found',
    );
    expect(sendAsync).not.toHaveBeenCalled();
  });

  it('declares permission update', () => {
    const tools = createEmailCampaignsDestructiveTools({ campaigns: {} as any });
    const tool = findTool(tools, 'send_email_campaign');
    expect(tool.permission).toBe('update');
  });
});
