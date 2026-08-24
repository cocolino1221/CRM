import { TasksService } from '../../tasks/tasks.service';
import { TaskStatus } from '../../database/entities/task.entity';
import { ToolDef } from './tool.types';

export interface TasksReadToolsDeps {
  tasks: TasksService;
}

export interface TasksWriteToolsDeps {
  tasks: TasksService;
}

const TASK_DTO_FIELDS = [
  'title',
  'description',
  'type',
  'status',
  'priority',
  'dueDate',
  'estimatedDuration',
  'assigneeId',
  'contactId',
  'dealId',
  'tags',
  'isRecurring',
  'customFields',
] as const;

/**
 * Build a task DTO by whitelisting known fields from raw tool input.
 * Never spreads the raw input directly — a spoofed `workspaceId` or
 * `creatorId` (or any other unexpected key) in the input is silently
 * dropped; `creatorId` always comes from `ctx.userId`.
 */
function buildTaskDto(input: any): Record<string, any> {
  const dto: Record<string, any> = {};
  for (const field of TASK_DTO_FIELDS) {
    if (input?.[field] !== undefined) dto[field] = input[field];
  }
  return dto;
}

const TASK_STATUS_VALUES = Object.values(TaskStatus);

function assertValidTaskStatus(status: unknown): asserts status is TaskStatus {
  if (!TASK_STATUS_VALUES.includes(status as TaskStatus)) {
    throw new Error(
      `Invalid task status "${status}". Must be one of: ${TASK_STATUS_VALUES.join(', ')}`,
    );
  }
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

const TASK_DTO_SCHEMA_PROPS = {
  title: { type: 'string', description: 'Task title' },
  description: { type: 'string', description: 'Task description' },
  type: { type: 'string', description: 'Task type' },
  status: { type: 'string', enum: TASK_STATUS_VALUES, description: 'Task status' },
  priority: { type: 'string', description: 'Task priority' },
  dueDate: { type: 'string', description: 'Task due date (ISO 8601)' },
  estimatedDuration: { type: 'number', description: 'Estimated duration in minutes' },
  assigneeId: { type: 'string', description: 'Assignee user id' },
  contactId: { type: 'string', description: 'Related contact id' },
  dealId: { type: 'string', description: 'Related deal id' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
  isRecurring: { type: 'boolean', description: 'Whether the task recurs' },
  customFields: { type: 'object', description: 'Custom field key/value map' },
} as const;

/**
 * Safe-write MCP tools over TasksService (create/update/complete). Every
 * handler pulls `workspaceId` from the auth context — never from tool
 * input. `create_task` also pulls the task creator from `ctx.userId`,
 * never from tool input.
 */
export function createTasksWriteTools(deps: TasksWriteToolsDeps): ToolDef[] {
  return [
    {
      name: 'create_task',
      description: 'Create a new task in the current workspace.',
      scope: 'crm.write',
      permission: 'create',
      inputSchema: {
        type: 'object',
        properties: TASK_DTO_SCHEMA_PROPS,
        required: ['title'],
      },
      handler: async (input, ctx) => {
        const dto = buildTaskDto(input);
        return deps.tasks.create(ctx.workspaceId, ctx.userId, dto as any);
      },
    },
    {
      name: 'update_task',
      description: 'Update an existing task in the current workspace.',
      scope: 'crm.write',
      permission: 'update',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
          ...TASK_DTO_SCHEMA_PROPS,
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        if (input?.status !== undefined) assertValidTaskStatus(input.status);
        const dto = buildTaskDto(input);
        return deps.tasks.update(ctx.workspaceId, input.id, dto as any);
      },
    },
    {
      name: 'complete_task',
      description: 'Mark a task as completed, with optional notes.',
      scope: 'crm.write',
      permission: 'update',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id' },
          notes: { type: 'string', description: 'Optional completion notes' },
        },
        required: ['id'],
      },
      handler: async (input, ctx) => {
        return deps.tasks.complete(ctx.workspaceId, input.id, input?.notes);
      },
    },
  ];
}
