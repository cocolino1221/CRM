import { ContactsService } from '../../contacts/contacts.service';
import { ToolDef } from './tool.types';

export interface ContactsReadToolsDeps {
  contacts: ContactsService;
}

export interface ContactsWriteToolsDeps {
  contacts: ContactsService;
}

export interface ContactsDestructiveToolsDeps {
  contacts: ContactsService;
}

const CONTACT_DTO_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'jobTitle',
  'status',
  'source',
  'leadScore',
  'notes',
  'customFields',
  'tags',
  'emailOptIn',
  'ownerId',
  'companyId',
  'pipelineId',
  'pipelineStageId',
  'setterId',
  'callerId',
  'closerId',
] as const;

/**
 * Build a contact DTO by whitelisting known fields from raw tool input.
 * Never spreads the raw input directly — a spoofed `workspaceId` (or any
 * other unexpected key) in the input is silently dropped.
 */
function buildContactDto(input: any): Record<string, any> {
  const dto: Record<string, any> = {};
  for (const field of CONTACT_DTO_FIELDS) {
    if (input?.[field] !== undefined) dto[field] = input[field];
  }
  return dto;
}

/**
 * Read-only MCP tools over ContactsService. Every handler pulls
 * `workspaceId` from the auth context — never from tool input — and caps
 * list results at 100 rows regardless of what the caller asks for.
 */
export function createContactsReadTools(deps: ContactsReadToolsDeps): ToolDef[] {
  return [
    {
      name: 'search_contacts',
      description: 'Search and list contacts in the current workspace, with optional filters.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search over name/email/phone' },
          status: { type: 'string', description: 'Filter by contact status' },
          page: { type: 'number', description: 'Page number, 1-indexed' },
          limit: { type: 'number', description: 'Max rows to return (capped at 100)' },
        },
      },
      handler: async (input, ctx) => {
        const limit = Math.min(input?.limit ?? 25, 100);
        return deps.contacts.findAll(ctx.workspaceId, {
          search: input?.search,
          status: input?.status,
          page: input?.page ?? 1,
          limit,
        } as any);
      },
    },
    {
      name: 'get_contact',
      description: 'Get a single contact by id, with optional related entities.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Contact id' },
          relations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Related entities to include, e.g. ["company","owner"]',
          },
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        return deps.contacts.findOne(ctx.workspaceId, input.id, input?.relations ?? []);
      },
    },
    {
      name: 'get_contact_activity',
      description: 'Get the activity timeline for a single contact.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Contact id' },
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        return deps.contacts.getActivities(ctx.workspaceId, input.id);
      },
    },
  ];
}

const CONTACT_DTO_SCHEMA_PROPS = {
  firstName: { type: 'string', description: 'First name' },
  lastName: { type: 'string', description: 'Last name' },
  email: { type: 'string', description: 'Email address' },
  phone: { type: 'string', description: 'Phone number' },
  jobTitle: { type: 'string', description: 'Job title' },
  status: { type: 'string', description: 'Contact status' },
  source: { type: 'string', description: 'Contact source' },
  leadScore: { type: 'number', description: 'Lead score (0-100)' },
  notes: { type: 'string', description: 'Free-text notes' },
  customFields: { type: 'object', description: 'Custom field key/value map' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
  emailOptIn: { type: 'boolean', description: 'Whether the contact opted in to email' },
  ownerId: { type: 'string', description: 'Owning user id' },
  companyId: { type: 'string', description: 'Company id' },
  pipelineId: { type: 'string', description: 'Pipeline id' },
  pipelineStageId: { type: 'string', description: 'Pipeline stage id' },
  setterId: { type: 'string', description: 'Setter user id' },
  callerId: { type: 'string', description: 'Caller user id' },
  closerId: { type: 'string', description: 'Closer user id' },
} as const;

/**
 * Safe-write MCP tools over ContactsService (create/update). Every handler
 * pulls `workspaceId` from the auth context — never from tool input.
 */
export function createContactsWriteTools(deps: ContactsWriteToolsDeps): ToolDef[] {
  return [
    {
      name: 'create_contact',
      description: 'Create a new contact in the current workspace.',
      scope: 'crm.write',
      permission: 'create',
      inputSchema: {
        type: 'object',
        properties: CONTACT_DTO_SCHEMA_PROPS,
        required: ['firstName', 'lastName', 'email'],
      },
      handler: async (input, ctx) => {
        const dto = buildContactDto(input);
        return deps.contacts.create(ctx.workspaceId, dto as any);
      },
    },
    {
      name: 'update_contact',
      description: 'Update an existing contact in the current workspace.',
      scope: 'crm.write',
      permission: 'update',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Contact id' },
          ...CONTACT_DTO_SCHEMA_PROPS,
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        const dto = buildContactDto(input);
        return deps.contacts.update(ctx.workspaceId, input.id, dto as any);
      },
    },
  ];
}

/**
 * Destructive MCP tools over ContactsService. All require `confirm: true`
 * (enforced by the tool runner) and re-fetch the target scoped to
 * `ctx.workspaceId` before acting, as defense in depth.
 */
export function createContactsDestructiveTools(deps: ContactsDestructiveToolsDeps): ToolDef[] {
  return [
    {
      name: 'delete_contact',
      description: 'Permanently delete a contact from the current workspace. Requires confirm: true.',
      scope: 'crm.automations',
      permission: 'delete',
      destructive: true,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Contact id' },
          confirm: { type: 'boolean', description: 'Must be true to execute this destructive action' },
        },
        required: ['id', 'confirm'],
      },
      handler: async (input, ctx) => {
        await deps.contacts.findOne(ctx.workspaceId, input.id);
        return deps.contacts.remove(ctx.workspaceId, input.id);
      },
    },
  ];
}
