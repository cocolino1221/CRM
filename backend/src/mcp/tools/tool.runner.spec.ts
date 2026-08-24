import { Repository } from 'typeorm';
import { runTool } from './tool.runner';
import { ToolDef } from './tool.types';
import { McpAuthContext } from '../auth/mcp-auth.context';
import { McpToolInvocation } from '../../database/entities/mcp-tool-invocation.entity';

function buildCtx(overrides: Partial<McpAuthContext & { hasPermission: (action: string) => boolean }> = {}): McpAuthContext {
  const hasPermission = overrides.hasPermission ?? (() => true);
  const { hasPermission: _hp, ...rest } = overrides as any;
  return {
    workspaceId: 'ws1',
    userId: 'u1',
    role: 'admin' as any,
    scopes: ['crm.read', 'crm.write', 'crm.automations'],
    user: { hasPermission } as any,
    ...rest,
  };
}

function buildDef(overrides: Partial<ToolDef> = {}): ToolDef {
  return {
    name: 'test.tool',
    description: 'A test tool',
    inputSchema: {},
    scope: 'crm.read',
    permission: 'read',
    handler: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('runTool', () => {
  let repo: { save: jest.Mock };

  beforeEach(() => {
    repo = { save: jest.fn().mockImplementation((row) => Promise.resolve(row)) };
  });

  it('denies when scope not granted', async () => {
    const def = buildDef();
    const ctx = buildCtx({ scopes: [] });

    await expect(runTool(def, {}, ctx, repo as unknown as Repository<McpToolInvocation>)).rejects.toThrow(
      /crm\.read/,
    );

    expect(def.handler).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws1',
        userId: 'u1',
        toolName: 'test.tool',
        status: 'denied',
      }),
    );
  });

  it('denies when role lacks permission', async () => {
    const def = buildDef({ permission: 'create' });
    const ctx = buildCtx({ hasPermission: () => false });

    await expect(runTool(def, {}, ctx, repo as unknown as Repository<McpToolInvocation>)).rejects.toThrow(
      /create/,
    );

    expect(def.handler).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
  });

  it('rejects destructive without confirm:true', async () => {
    const def = buildDef({ destructive: true });
    const ctx = buildCtx();

    await expect(runTool(def, {}, ctx, repo as unknown as Repository<McpToolInvocation>)).rejects.toThrow(
      'This action requires confirm: true',
    );

    expect(def.handler).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }));
  });

  it('runs handler when destructive WITH confirm:true and valid scope/role', async () => {
    const def = buildDef({ destructive: true });
    const ctx = buildCtx();

    const result = await runTool(def, { confirm: true }, ctx, repo as unknown as Repository<McpToolInvocation>);

    expect(result).toEqual({ ok: true });
    expect(def.handler).toHaveBeenCalledTimes(1);
    expect(def.handler).toHaveBeenCalledWith({ confirm: true }, ctx);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('runs and writes one success audit row', async () => {
    const def = buildDef();
    const ctx = buildCtx();

    const result = await runTool(def, { foo: 'bar' }, ctx, repo as unknown as Repository<McpToolInvocation>);

    expect(result).toEqual({ ok: true });
    expect(def.handler).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws1',
        userId: 'u1',
        toolName: 'test.tool',
        status: 'success',
        args: { foo: 'bar' },
        error: null,
      }),
    );
  });

  it('writes one error audit row and rethrows when handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    const def = buildDef({ handler });
    const ctx = buildCtx();

    await expect(runTool(def, {}, ctx, repo as unknown as Repository<McpToolInvocation>)).rejects.toThrow('boom');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', error: 'boom' }),
    );
  });

  it('redacts sensitive keys in stored args but leaves other keys intact', async () => {
    const def = buildDef();
    const ctx = buildCtx();
    const rawInput = {
      name: 'Jane',
      password: 'hunter2',
      Token: 'abc123',
      secret: 's3cr3t',
      Authorization: 'Bearer xyz',
      apiKey: 'key123',
      api_key: 'key456',
    };

    await runTool(def, rawInput, ctx, repo as unknown as Repository<McpToolInvocation>);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        args: {
          name: 'Jane',
          password: '[REDACTED]',
          Token: '[REDACTED]',
          secret: '[REDACTED]',
          Authorization: '[REDACTED]',
          apiKey: '[REDACTED]',
          api_key: '[REDACTED]',
        },
      }),
    );
  });

  it('stores null args when rawInput is null/undefined', async () => {
    const def = buildDef();
    const ctx = buildCtx();

    await runTool(def, undefined, ctx, repo as unknown as Repository<McpToolInvocation>);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ args: null }));
  });
});
