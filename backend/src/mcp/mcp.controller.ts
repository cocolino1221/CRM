import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpService } from './mcp.service';
import { McpGuard } from './auth/mcp.guard';
import { McpAuthContext, mcpStore } from './auth/mcp-auth.context';

/**
 * The MCP Streamable HTTP endpoint. `McpGuard` authenticates the request
 * and attaches `req.mcpContext`; this handler runs the SDK transport inside
 * `mcpStore.run(...)` so `getMcpContext()` resolves anywhere downstream in
 * this async call graph (including inside tool handlers invoked by
 * `runTool`). A fresh `Server`/transport pair is built per request — this
 * server is stateless (`sessionIdGenerator: undefined`), so there's no
 * benefit to reusing a connection across requests, and a fresh pair avoids
 * any cross-request state leaking between callers.
 */
@Controller('mcp')
@UseGuards(McpGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  async handleMcpRequest(@Req() req: Request & { mcpContext: McpAuthContext }, @Res() res: Response): Promise<void> {
    await mcpStore.run(req.mcpContext, async () => {
      const { server, transport } = this.mcpService.newSession();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    });
  }
}
