import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapTestApp } from './helpers';

describe('MCP OAuth discovery', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves authorization-server metadata at root', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/oauth-authorization-server')
      .expect(200);

    expect(res.body.issuer).toBeDefined();
    expect(res.body.authorization_endpoint).toContain('/api/v1/oauth/mcp/authorize');
    expect(res.body.token_endpoint).toContain('/api/v1/oauth/mcp/token');
    expect(res.body.registration_endpoint).toContain('/api/v1/oauth/mcp/register');
    expect(res.body.code_challenge_methods_supported).toContain('S256');
    expect(res.body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(res.body.scopes_supported).toEqual(
      expect.arrayContaining(['crm.read', 'crm.write', 'crm.automations']),
    );
  });

  it('serves protected-resource metadata at root', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/oauth-protected-resource')
      .expect(200);

    expect(res.body.resource).toBeDefined();
    expect(res.body.authorization_servers).toEqual([res.body.resource]);
  });

  it('registers a client via DCR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/register')
      .send({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })
      .expect(201);

    expect(res.body.client_id).toBeDefined();
    expect(res.body.client_id).toMatch(/^mcp_/);
    expect(res.body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
    expect(res.body.client_name).toBe('Claude');
  });

  it('rejects DCR with a non-https redirect_uri', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/register')
      .send({ client_name: 'Bad', redirect_uris: ['http://insecure.example.com/callback'] })
      .expect(400);
  });

  it('rejects DCR with an empty redirect_uris array', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/register')
      .send({ client_name: 'Empty', redirect_uris: [] })
      .expect(400);
  });
});
