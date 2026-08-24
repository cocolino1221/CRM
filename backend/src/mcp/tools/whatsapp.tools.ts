import { WhatsAppService, WhatsAppMessage } from '../../integrations/whatsapp/whatsapp.service';
import { ToolDef } from './tool.types';

export interface WhatsAppDestructiveToolsDeps {
  whatsapp: WhatsAppService;
}

/**
 * Destructive/automation MCP tools over WhatsAppService. Requires
 * `confirm: true` (enforced by the tool runner).
 */
export function createWhatsAppDestructiveTools(deps: WhatsAppDestructiveToolsDeps): ToolDef[] {
  return [
    {
      name: 'send_whatsapp_message',
      description: 'Send a WhatsApp text message from the current workspace. Requires confirm: true.',
      scope: 'crm.automations',
      permission: 'update',
      destructive: true,
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient phone number (E.164 or WhatsApp wa_id)' },
          text: { type: 'string', description: 'Message body text' },
          integrationId: {
            type: 'string',
            description: 'Optional WhatsApp integration id to send from (defaults to the workspace default)',
          },
          confirm: { type: 'boolean', description: 'Must be true to execute this destructive action' },
        },
        required: ['to', 'text', 'confirm'],
      },
      handler: async (input, ctx) => {
        const message: WhatsAppMessage = {
          to: input.to,
          type: 'text',
          content: input.text,
        };
        return deps.whatsapp.sendMessageForWorkspace(ctx.workspaceId, message, input?.integrationId);
      },
    },
  ];
}
