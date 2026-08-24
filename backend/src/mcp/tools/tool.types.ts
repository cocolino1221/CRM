import { McpAuthContext } from '../auth/mcp-auth.context';

/**
 * Granted scopes are the ceiling on what an MCP caller may invoke — checked
 * against `McpAuthContext.scopes` (which comes from the access token claims).
 */
export type Scope = 'crm.read' | 'crm.write' | 'crm.automations';

/**
 * A single MCP tool definition. `runTool` (see `tool.runner.ts`) is the only
 * sanctioned way to invoke `handler` — it enforces `scope`, `permission`,
 * and `destructive`/`confirm`, and writes the audit row.
 */
export interface ToolDef<I = any> {
  name: string;
  description: string;
  inputSchema: object; // JSON schema for MCP
  scope: Scope; // required granted scope (ceiling)
  permission: 'read' | 'create' | 'update' | 'delete'; // hasPermission action (floor)
  destructive?: boolean; // requires confirm:true
  handler: (input: I, ctx: McpAuthContext) => Promise<any>;
}
