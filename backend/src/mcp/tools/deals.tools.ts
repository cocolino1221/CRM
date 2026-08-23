import { DealsService } from '../../deals/deals.service';
import { ToolDef } from './tool.types';

export interface DealsReadToolsDeps {
  deals: DealsService;
}

/**
 * Read-only MCP tools over DealsService. Every handler pulls
 * `workspaceId` from the auth context — never from tool input — and caps
 * list results at 100 rows regardless of what the caller asks for.
 */
export function createDealsReadTools(deps: DealsReadToolsDeps): ToolDef[] {
  return [
    {
      name: 'list_deals',
      description: 'Search and list deals in the current workspace, with optional filters.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search over title/description' },
          stage: { type: 'string', description: 'Filter by deal stage' },
          page: { type: 'number', description: 'Page number, 1-indexed' },
          limit: { type: 'number', description: 'Max rows to return (capped at 100)' },
        },
      },
      handler: async (input, ctx) => {
        const limit = Math.min(input?.limit ?? 25, 100);
        return deps.deals.findAll(ctx.workspaceId, {
          search: input?.search,
          stage: input?.stage,
          page: input?.page ?? 1,
          limit,
        } as any);
      },
    },
    {
      name: 'get_deal_pipeline',
      description: 'Get the deal pipeline (deals grouped by stage) for the current workspace.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async (_input, ctx) => {
        return deps.deals.getPipeline(ctx.workspaceId);
      },
    },
    {
      name: 'get_deal',
      description: 'Get a single deal by id, with optional related entities.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deal id' },
          relations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related entities to include, e.g. ["contact","owner"]',
          },
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        return deps.deals.findOne(ctx.workspaceId, input.id, input?.relations ?? []);
      },
    },
  ];
}
