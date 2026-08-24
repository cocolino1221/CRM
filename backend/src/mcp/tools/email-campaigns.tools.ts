import { EmailCampaignsService } from '../../email-campaigns/email-campaigns.service';
import { ToolDef } from './tool.types';

export interface EmailCampaignsDestructiveToolsDeps {
  campaigns: EmailCampaignsService;
}

/**
 * Destructive/automation MCP tools over EmailCampaignsService. Requires
 * `confirm: true` (enforced by the tool runner). Always resolves the
 * campaign scoped to `ctx.workspaceId` via `findOne` FIRST, so a campaign
 * id belonging to another workspace can never be triggered.
 */
export function createEmailCampaignsDestructiveTools(
  deps: EmailCampaignsDestructiveToolsDeps,
): ToolDef[] {
  return [
    {
      name: 'send_email_campaign',
      description: 'Send an email campaign in the current workspace. Requires confirm: true.',
      scope: 'crm.automations',
      permission: 'update',
      destructive: true,
      inputSchema: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'Email campaign id' },
          confirm: { type: 'boolean', description: 'Must be true to execute this destructive action' },
        },
        required: ['campaignId', 'confirm'],
      },
      handler: async (input, ctx) => {
        await deps.campaigns.findOne(ctx.workspaceId, input.campaignId);
        return deps.campaigns.sendAsync(ctx.workspaceId, input.campaignId);
      },
    },
  ];
}
