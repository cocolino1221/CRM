import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { McpController } from '../../src/mcp/mcp.controller';
import { McpService } from '../../src/mcp/mcp.service';
import { McpGuard } from '../../src/mcp/auth/mcp.guard';
import { McpTokenService } from '../../src/mcp/auth/mcp-token.service';
import { McpToolInvocation } from '../../src/database/entities/mcp-tool-invocation.entity';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { ContactsService } from '../../src/contacts/contacts.service';
import { DealsService } from '../../src/deals/deals.service';
import { TasksService } from '../../src/tasks/tasks.service';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { WorkflowsService } from '../../src/workflows/workflows.service';
import { WhatsAppService } from '../../src/integrations/whatsapp/whatsapp.service';
import { EmailCampaignsService } from '../../src/email-campaigns/email-campaigns.service';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Focused e2e coverage for the real POST /api/v1/mcp Streamable HTTP
 * endpoint (Task 12). Deliberately does NOT boot the full McpModule (which
 * now imports ContactsModule/DealsModule/.../WhatsAppModule — a whole
 * domain-entity + Redis + Bull graph): instead it wires McpController +
 * McpService directly with every domain service mocked, exactly the way
 * the task-12 brief prescribes. Only the Accept header/JSON-RPC envelope
 * and the auth guard's 401 path are genuinely exercised against the real
 * SDK Server + StreamableHTTPServerTransport.
 */
describe('MCP Streamable HTTP endpoint (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const workspaceId = randomUUID();
  const userId = randomUUID();

  const seededUser = Object.assign(new User(), {
    id: userId,
    workspaceId,
    email: 'mcp-e2e@acme.test',
    firstName: 'MCP',
    lastName: 'Tester',
    password: 'unused-hash',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  });

  const findAllContacts = jest.fn().mockResolvedValue({
    data: [{ id: 'c1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }],
    total: 1,
  });

  const userRepoFindOne = jest.fn().mockResolvedValue(seededUser);
  const invocationRepoSave = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'mcp-e2e-test-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [McpController],
      providers: [
        McpService,
        McpGuard,
        McpTokenService,
        { provide: ContactsService, useValue: { findAll: findAllContacts } },
        { provide: DealsService, useValue: {} },
        { provide: TasksService, useValue: {} },
        { provide: AnalyticsService, useValue: {} },
        { provide: WorkflowsService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: EmailCampaignsService, useValue: {} },
        {
          provide: getRepositoryToken(McpToolInvocation),
          useValue: { save: invocationRepoSave },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userRepoFindOne },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [
        '.well-known/oauth-authorization-server',
        '.well-known/oauth-protected-resource',
      ],
    });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    const tokenService = app.get(McpTokenService);
    accessToken = tokenService.issueAccessToken({
      workspaceId,
      userId,
      role: UserRole.ADMIN,
      scopes: ['crm.read', 'crm.write', 'crm.automations'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function mcpPost(body: any) {
    return request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send(body);
  }

  it('POST /api/v1/mcp tools/list returns 200 and lists the aggregated tools', async () => {
    const res = await mcpPost({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: any) => t.name);
    expect(names).toContain('search_contacts');
    expect(names).toContain('get_contact');
    expect(names).toContain('create_contact');
    expect(names).toContain('delete_contact');
    expect(names).toContain('trigger_workflow');
    expect(names).toContain('send_whatsapp_message');
    expect(names).toContain('send_email_campaign');
  });

  it('POST /api/v1/mcp tools/call search_contacts routes through runTool to the mocked ContactsService', async () => {
    const res = await mcpPost({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_contacts', arguments: { search: 'ada' } },
    }).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.result.content[0].type).toBe('text');
    const payload = JSON.parse(res.body.result.content[0].text);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].id).toBe('c1');

    // Confirms getMcpContext() actually resolved inside the tool handler
    // (via the controller's mcpStore.run wrapper) — the handler passes
    // ctx.workspaceId as the first arg to ContactsService#findAll.
    expect(findAllContacts).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ search: 'ada' }),
    );

    // The runner writes exactly one audit row for this call, tagged success.
    expect(invocationRepoSave).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'search_contacts', status: 'success' }),
    );
  });

  it('POST /api/v1/mcp without a Bearer token is rejected with 401 and WWW-Authenticate', async () => {
    const res = await mcpPost({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeDefined();
  });
});
