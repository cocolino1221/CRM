import { TasksService } from '../../tasks/tasks.service';
import { ToolDef } from './tool.types';

export interface TasksReadToolsDeps {
  tasks: TasksService;
}

/**
 * Read-only MCP tools over TasksService. Every handler pulls
 * `workspaceId` from the auth context — never from tool input — and caps
 * list results at 100 rows regardless of what the caller asks for.
 */
export function createTasksReadTools(deps: TasksReadToolsDeps): ToolDef[] {
  return [
    {
      name: 'list_tasks',
      description: 'Search and list tasks in the current workspace, with optional filters.',
      scope: 'crm.read',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search over title/description' },
          status: { type: 'string', description: 'Filter by task status' },
          page: { type: 'number', description: 'Page number, 1-indexed' },
          limit: { type: 'number', description: 'Max rows to return (capped at 100)' },
        },
      },
      handler: async (input, ctx) => {
        const limit = Math.min(input?.limit ?? 25, 100);
        return deps.tasks.findAll(ctx.workspaceId, {
          search: input?.search,
          status: input?.status,
          page: input?.page ?? 1,
          limit,
        } as any);
      },
    },
  ];
}
