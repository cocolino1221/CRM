import { Repository } from 'typeorm';
import { McpAuthContext } from '../auth/mcp-auth.context';
import { McpToolInvocation } from '../../database/entities/mcp-tool-invocation.entity';
import { ToolDef } from './tool.types';

const REDACTED_KEYS = ['password', 'token', 'secret', 'authorization', 'apikey', 'api_key'];

function redact(rawInput: any): Record<string, any> | null {
  if (rawInput === null || rawInput === undefined) return null;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawInput)) {
    out[key] = REDACTED_KEYS.includes(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}

async function audit(
  repo: Repository<McpToolInvocation>,
  ctx: McpAuthContext,
  toolName: string,
  args: Record<string, any> | null,
  status: 'success' | 'denied' | 'error',
  error: string | null,
): Promise<void> {
  await repo.save({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    toolName,
    args,
    status,
    error,
  } as McpToolInvocation);
}

/**
 * The single choke point for MCP tool invocation. Enforces, in order:
 *   1. granted scope (ceiling, from access token claims)
 *   2. role permission (floor, from the LIVE user entity)
 *   3. destructive confirmation
 * then calls the handler. Every path writes exactly one audit row.
 * Denials and handler errors throw — never return empty data.
 */
export async function runTool(
  def: ToolDef,
  rawInput: any,
  ctx: McpAuthContext,
  repo: Repository<McpToolInvocation>,
): Promise<any> {
  const redactedArgs = redact(rawInput);

  if (!ctx.scopes.includes(def.scope)) {
    const message = `Permission denied: this tool requires the '${def.scope}' scope, which was not granted.`;
    await audit(repo, ctx, def.name, redactedArgs, 'denied', message);
    throw new Error(message);
  }

  if (!ctx.user.hasPermission(def.permission)) {
    const message = `Permission denied: this tool requires the '${def.permission}' permission, which your role does not have.`;
    await audit(repo, ctx, def.name, redactedArgs, 'denied', message);
    throw new Error(message);
  }

  if (def.destructive && rawInput?.confirm !== true) {
    const message = 'This action requires confirm: true';
    await audit(repo, ctx, def.name, redactedArgs, 'denied', message);
    throw new Error(message);
  }

  try {
    const result = await def.handler(rawInput, ctx);
    await audit(repo, ctx, def.name, redactedArgs, 'success', null);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(repo, ctx, def.name, redactedArgs, 'error', message);
    throw err;
  }
}
