import { DealsService } from '../../deals/deals.service';
import { DealStage } from '../../database/entities/deal.entity';
import { ToolDef } from './tool.types';

export interface DealsReadToolsDeps {
  deals: DealsService;
}

export interface DealsWriteToolsDeps {
  deals: DealsService;
}

export interface DealsDestructiveToolsDeps {
  deals: DealsService;
}

const DEAL_DTO_FIELDS = [
  'title',
  'value',
  'currency',
  'stage',
  'priority',
  'probability',
  'source',
  'expectedCloseDate',
  'description',
  'ownerId',
  'contactId',
  'companyId',
  'decisionMakers',
  'budgetConfirmed',
  'tags',
  'customFields',
  'paymentMethod',
  'firm',
] as const;

/**
 * Build a deal DTO by whitelisting known fields from raw tool input.
 * Never spreads the raw input directly — a spoofed `workspaceId` (or any
 * other unexpected key) in the input is silently dropped.
 */
function buildDealDto(input: any): Record<string, any> {
  const dto: Record<string, any> = {};
  for (const field of DEAL_DTO_FIELDS) {
    if (input?.[field] !== undefined) dto[field] = input[field];
  }
  return dto;
}

const DEAL_STAGE_VALUES = Object.values(DealStage);

function assertValidDealStage(stage: unknown): asserts stage is DealStage {
  if (!DEAL_STAGE_VALUES.includes(stage as DealStage)) {
    throw new Error(
      `Invalid deal stage "${stage}". Must be one of: ${DEAL_STAGE_VALUES.join(', ')}`,
    );
  }
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

const DEAL_DTO_SCHEMA_PROPS = {
  title: { type: 'string', description: 'Deal title' },
  value: { type: 'number', description: 'Deal value' },
  currency: { type: 'string', description: 'Currency code, e.g. USD' },
  stage: { type: 'string', enum: DEAL_STAGE_VALUES, description: 'Deal stage' },
  priority: { type: 'string', description: 'Deal priority' },
  probability: { type: 'number', description: 'Win probability (0-100)' },
  source: { type: 'string', description: 'Deal source' },
  expectedCloseDate: { type: 'string', description: 'Expected close date (ISO 8601)' },
  description: { type: 'string', description: 'Deal description' },
  ownerId: { type: 'string', description: 'Owning user id' },
  contactId: { type: 'string', description: 'Contact id' },
  companyId: { type: 'string', description: 'Company id' },
  decisionMakers: { type: 'number', description: 'Number of decision makers' },
  budgetConfirmed: { type: 'boolean', description: 'Whether budget is confirmed' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
  customFields: { type: 'object', description: 'Custom field key/value map' },
  paymentMethod: { type: 'string', description: 'Payment method when deal is closed won' },
  firm: { type: 'string', description: 'Firm selected for rate or bill payment methods' },
} as const;

/**
 * Safe-write MCP tools over DealsService (create/update stage). Every
 * handler pulls `workspaceId` from the auth context — never from tool input.
 */
export function createDealsWriteTools(deps: DealsWriteToolsDeps): ToolDef[] {
  return [
    {
      name: 'create_deal',
      description: 'Create a new deal in the current workspace.',
      scope: 'crm.write',
      permission: 'create',
      inputSchema: {
        type: 'object',
        properties: DEAL_DTO_SCHEMA_PROPS,
        required: ['title', 'value'],
      },
      handler: async (input, ctx) => {
        const dto = buildDealDto(input);
        return deps.deals.create(ctx.workspaceId, dto as any);
      },
    },
    {
      name: 'update_deal_stage',
      description: 'Move a deal to a different pipeline stage.',
      scope: 'crm.write',
      permission: 'update',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deal id' },
          stage: { type: 'string', enum: DEAL_STAGE_VALUES, description: 'Target deal stage' },
        },
        required: ['id', 'stage'],
      },
      handler: async (input, ctx) => {
        assertValidDealStage(input?.stage);
        return deps.deals.updateStage(ctx.workspaceId, input.id, input.stage);
      },
    },
  ];
}

/**
 * Destructive MCP tools over DealsService. All require `confirm: true`
 * (enforced by the tool runner) and re-fetch the target scoped to
 * `ctx.workspaceId` before acting, as defense in depth.
 */
export function createDealsDestructiveTools(deps: DealsDestructiveToolsDeps): ToolDef[] {
  return [
    {
      name: 'delete_deal',
      description: 'Permanently delete a deal from the current workspace. Requires confirm: true.',
      scope: 'crm.automations',
      permission: 'delete',
      destructive: true,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deal id' },
          confirm: { type: 'boolean', description: 'Must be true to execute this destructive action' },
        },
        required: ['id', 'confirm'],
      },
      handler: async (input, ctx) => {
        await deps.deals.findOne(ctx.workspaceId, input.id);
        return deps.deals.remove(ctx.workspaceId, input.id);
      },
    },
  ];
}
