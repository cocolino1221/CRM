import { ContactsService } from '../../contacts/contacts.service';
import { ToolDef } from './tool.types';

export interface ContactsReadToolsDeps {
  contacts: ContactsService;
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
