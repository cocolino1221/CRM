import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ContactsService } from '../contacts/contacts.service';
import { DealsService } from '../deals/deals.service';
import { TasksService } from '../tasks/tasks.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { McpToolInvocation } from '../database/entities/mcp-tool-invocation.entity';
import { getMcpContext } from './auth/mcp-auth.context';
import { runTool } from './tools/tool.runner';
import { ToolDef } from './tools/tool.types';
import { createContactsReadTools, createContactsWriteTools, createContactsDestructiveTools } from './tools/contacts.tools';
import { createDealsReadTools, createDealsWriteTools, createDealsDestructiveTools } from './tools/deals.tools';
import { createTasksReadTools, createTasksWriteTools } from './tools/tasks.tools';
import { createAnalyticsReadTools } from './tools/analytics.tools';
import { createWorkflowsDestructiveTools } from './tools/workflows.tools';
import { createWhatsAppDestructiveTools } from './tools/whatsapp.tools';
import { createEmailCampaignsDestructiveTools } from './tools/email-campaigns.tools';

/**
 * Bootstraps the MCP `Server` and aggregates every domain's `ToolDef[]`.
 *
 * `newSession()` builds a fresh `Server` + `StreamableHTTPServerTransport`
 * pair per HTTP request (stateless mode — `sessionIdGenerator: undefined`).
 * The aggregated tool list itself is built once in the constructor since it
 * carries no per-request state; only the SDK `Server`/transport objects are
 * per-request (they hold connection-scoped protocol state internally).
 */
@Injectable()
export class McpService {
  private readonly toolDefs: ToolDef[];

  constructor(
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
    private readonly tasks: TasksService,
    private readonly analytics: AnalyticsService,
    private readonly workflows: WorkflowsService,
    private readonly whatsapp: WhatsAppService,
    private readonly campaigns: EmailCampaignsService,
    @InjectRepository(McpToolInvocation)
    private readonly invocationRepo: Repository<McpToolInvocation>,
  ) {
    this.toolDefs = [
      ...createContactsReadTools({ contacts: this.contacts }),
      ...createContactsWriteTools({ contacts: this.contacts }),
      ...createContactsDestructiveTools({ contacts: this.contacts }),
      ...createDealsReadTools({ deals: this.deals }),
      ...createDealsWriteTools({ deals: this.deals }),
      ...createDealsDestructiveTools({ deals: this.deals }),
      ...createTasksReadTools({ tasks: this.tasks }),
      ...createTasksWriteTools({ tasks: this.tasks }),
      ...createAnalyticsReadTools({ analytics: this.analytics }),
      ...createWorkflowsDestructiveTools({ workflows: this.workflows }),
      ...createWhatsAppDestructiveTools({ whatsapp: this.whatsapp }),
      ...createEmailCampaignsDestructiveTools({ campaigns: this.campaigns }),
    ];
  }

  /** Builds a fresh Server + Transport pair for a single MCP HTTP request. */
  newSession(): { server: Server; transport: StreamableHTTPServerTransport } {
    const server = new Server(
      { name: 'slackcrm-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefs.map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const def = this.toolDefs.find((d) => d.name === req.params.name);
      if (!def) throw new Error(`Unknown tool: ${req.params.name}`);
      const result = await runTool(def, req.params.arguments ?? {}, getMcpContext(), this.invocationRepo);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });

    // enableJsonResponse: true — our tool calls are simple request/response
    // (no server-initiated notifications, no long-running SSE pushes), so
    // plain JSON responses keep the endpoint trivial for HTTP-based MCP
    // clients to consume, per the SDK's own "JSON response mode" example.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    return { server, transport };
  }
}
