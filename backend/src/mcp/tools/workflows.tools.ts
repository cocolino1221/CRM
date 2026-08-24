import { WorkflowsService } from '../../workflows/workflows.service';
import { ToolDef } from './tool.types';

export interface WorkflowsDestructiveToolsDeps {
  workflows: WorkflowsService;
}

/**
 * Destructive/automation MCP tools over WorkflowsService. Requires
 * `confirm: true` (enforced by the tool runner). Always resolves the
 * workflow scoped to `ctx.workspaceId` via `findOne` FIRST — this both
 * confirms the workflow belongs to the caller's workspace and throws
 * (blocking `execute`) if it doesn't exist there.
 */
export function createWorkflowsDestructiveTools(deps: WorkflowsDestructiveToolsDeps): ToolDef[] {
  return [
    {
      name: 'trigger_workflow',
      description: 'Manually trigger a workflow in the current workspace. Requires confirm: true.',
      scope: 'crm.automations',
      permission: 'update',
      destructive: true,
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow id' },
          triggerData: { type: 'object', description: 'Data passed to the workflow execution' },
          confirm: { type: 'boolean', description: 'Must be true to execute this destructive action' },
        },
        required: ['workflowId', 'confirm'],
      },
      handler: async (input, ctx) => {
        // NOTE: WorkflowsService.findOne takes (id, workspaceId) — reversed
        // from the (workspaceId, id) order used elsewhere in this codebase.
        await deps.workflows.findOne(input.workflowId, ctx.workspaceId);
        return deps.workflows.execute(input.workflowId, input?.triggerData ?? {});
      },
    },
  ];
}
