import { AsyncLocalStorage } from 'node:async_hooks';
import { User, UserRole } from '../../database/entities/user.entity';

/**
 * Per-request auth context for MCP tool calls.
 *
 * `role` is always the LIVE role loaded from the User entity at request
 * time — never the role embedded in the access token claims — so that a
 * role change (e.g. demotion) takes effect immediately instead of waiting
 * for the (short-lived, 15m) access token to expire. `scopes` still comes
 * from the token claims and acts as the ceiling on what the caller may do.
 */
export type McpAuthContext = {
  workspaceId: string;
  userId: string;
  role: UserRole;
  user: User;
  scopes: string[];
};

export const mcpStore = new AsyncLocalStorage<McpAuthContext>();

export function getMcpContext(): McpAuthContext {
  const ctx = mcpStore.getStore();
  if (!ctx) throw new Error('MCP context not available');
  return ctx;
}
