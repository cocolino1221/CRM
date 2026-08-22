import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { bootstrapTestApp } from './helpers';
import { Workspace } from '../../src/database/entities/workspace.entity';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { McpOauthClient } from '../../src/database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../src/database/entities/mcp-oauth-grant.entity';
import { McpOauthController } from '../../src/mcp/oauth/mcp-oauth.controller';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

/**
 * NOTE: Workspace/User are intentionally NOT registered in this focused
 * module's TypeOrmModule (see helpers.ts) — pulling in User's relation
 * graph (Contact/Deal/Task/Company/...) would balloon this test far beyond
 * the OAuth authorize/consent logic under test. Instead we build plain,
 * unpersisted Workspace/User objects that stand in for what
 * JwtStrategy#validate would normally load (a User with its `workspace`
 * relation populated), and hand them to the guard-override via
 * `currentUserRef`. Nothing under test queries these tables, so no real
 * row is required for correctness — only McpOauthClient/McpOauthGrant are
 * genuinely persisted.
 */

describe('MCP OAuth authorize + consent (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const currentUserRef: { user?: User } = {};

  let workspace: Workspace;
  let user: User;
  let client: McpOauthClient;

  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
  const UNREGISTERED_REDIRECT_URI = 'https://evil.example.com/callback';

  const baseAuthorizeParams = () => ({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    code_challenge: 'test-code-challenge',
    code_challenge_method: 'S256',
    state: 'test-state-value',
    scope: 'crm.read crm.write',
  });

  async function findGrant(): Promise<McpOauthGrant | null> {
    return dataSource.getRepository(McpOauthGrant).findOne({
      where: { workspaceId: workspace.id, userId: user.id, clientId: client.clientId },
    });
  }

  /**
   * Drives a real GET /authorize call and extracts the CSRF nonce the
   * server hands back two ways: the httpOnly cookie, and the hidden form
   * field mirrored into the consent HTML. Tests that need a legitimate
   * consent POST use both; CSRF-forgery tests deliberately omit or corrupt
   * one side of this pair.
   */
  async function fetchConsentContext(overrides: Record<string, string> = {}) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/oauth/mcp/authorize')
      .query({ ...baseAuthorizeParams(), ...overrides })
      .expect(200);

    const setCookieHeader = (res.headers['set-cookie'] ?? []) as unknown as string[];
    const nonceCookie = setCookieHeader.find((c) => c.startsWith('mcp_consent_nonce='));
    expect(nonceCookie).toBeDefined();
    const cookieValue = nonceCookie!.match(/^mcp_consent_nonce=([^;]+)/)![1];

    const csrfMatch = res.text.match(/name="csrf" value="([^"]*)"/);
    expect(csrfMatch).not.toBeNull();

    return {
      cookieHeader: `mcp_consent_nonce=${cookieValue}`,
      formCsrf: csrfMatch![1],
    };
  }

  beforeAll(async () => {
    app = await bootstrapTestApp({ currentUserRef });
    dataSource = app.get(DataSource);

    workspace = Object.assign(new Workspace(), {
      id: randomUUID(),
      name: 'Acme Corp',
      domain: `acme-${Date.now()}.test.example.com`,
      plan: 'trial',
      isActive: true,
      settings: {
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        currency: 'USD',
        features: {
          aiEnabled: false,
          slackIntegration: false,
          emailIntegration: false,
        },
      },
    });

    user = Object.assign(new User(), {
      id: randomUUID(),
      workspaceId: workspace.id,
      email: 'owner@acme.test',
      firstName: 'Ada',
      lastName: 'Owner',
      password: 'unused-hash',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    // JwtStrategy normally loads this relation; the overridden guard mimics
    // that by attaching it directly on the seeded entity.
    user.workspace = workspace;
    currentUserRef.user = user;

    const clientRepo = dataSource.getRepository(McpOauthClient);
    client = await clientRepo.save(
      clientRepo.create({
        clientId: 'mcp_test_client',
        redirectUris: [REDIRECT_URI],
        clientName: 'Claude Desktop',
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders the consent screen with workspace name, client name, and requested scopes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/oauth/mcp/authorize')
      .query(baseAuthorizeParams())
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Acme Corp');
    expect(res.text).toContain('Claude Desktop');
    expect(res.text).toContain('crm.read');
    expect(res.text).toContain('crm.write');
  });

  it('rejects an unregistered redirect_uri without redirecting', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/oauth/mcp/authorize')
      .query({ ...baseAuthorizeParams(), redirect_uri: UNREGISTERED_REDIRECT_URI })
      .expect(400);

    expect(res.headers['location']).toBeUndefined();
  });

  it('rejects a non-S256 code_challenge_method with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/oauth/mcp/authorize')
      .query({ ...baseAuthorizeParams(), code_challenge_method: 'plain' })
      .expect(400);
  });

  it('rejects an unknown client_id with 400', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/oauth/mcp/authorize')
      .query({ ...baseAuthorizeParams(), client_id: 'mcp_does_not_exist' })
      .expect(400);
  });

  it('rejects consent for an unregistered redirect_uri with 400 and does not redirect', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/authorize/consent')
      .type('form')
      .send({ ...baseAuthorizeParams(), redirect_uri: UNREGISTERED_REDIRECT_URI, decision: 'approve' })
      .expect(400);

    expect(res.headers['location']).toBeUndefined();
  });

  describe('CSRF protection on the consent POST', () => {
    it('rejects a consent POST with no CSRF cookie (forged cross-site submission) with 403 and creates no grant', async () => {
      const { formCsrf } = await fetchConsentContext();

      const res = await request(app.getHttpServer())
        .post('/api/v1/oauth/mcp/authorize/consent')
        .type('form')
        // Deliberately no Cookie header — SameSite=strict means a real
        // cross-site forged POST could never attach it either.
        .send({ ...baseAuthorizeParams(), decision: 'approve', csrf: formCsrf })
        .expect(403);

      expect(res.headers['location']).toBeUndefined();
      expect(await findGrant()).toBeNull();
    });

    it('rejects a consent POST whose form csrf does not match the cookie with 403 and creates no grant', async () => {
      const { cookieHeader } = await fetchConsentContext();

      const res = await request(app.getHttpServer())
        .post('/api/v1/oauth/mcp/authorize/consent')
        .type('form')
        .set('Cookie', cookieHeader)
        .send({ ...baseAuthorizeParams(), decision: 'approve', csrf: 'forged-nonce-value' })
        .expect(403);

      expect(res.headers['location']).toBeUndefined();
      expect(await findGrant()).toBeNull();
    });
  });

  describe('consent decision handling (fail closed)', () => {
    it('treats a missing decision as denial: no grant, no code, redirects with error=access_denied', async () => {
      const { cookieHeader, formCsrf } = await fetchConsentContext();

      const res = await request(app.getHttpServer())
        .post('/api/v1/oauth/mcp/authorize/consent')
        .type('form')
        .set('Cookie', cookieHeader)
        // decision intentionally omitted
        .send({ ...baseAuthorizeParams(), csrf: formCsrf })
        .expect(302);

      const redirectUrl = new URL(res.headers['location']);
      expect(redirectUrl.searchParams.get('error')).toBe('access_denied');
      expect(redirectUrl.searchParams.get('code')).toBeNull();
      expect(await findGrant()).toBeNull();
    });

    it('treats an unrecognized decision value as denial: no grant, no code', async () => {
      const { cookieHeader, formCsrf } = await fetchConsentContext();

      const res = await request(app.getHttpServer())
        .post('/api/v1/oauth/mcp/authorize/consent')
        .type('form')
        .set('Cookie', cookieHeader)
        .send({ ...baseAuthorizeParams(), decision: 'garbage', csrf: formCsrf })
        .expect(302);

      const redirectUrl = new URL(res.headers['location']);
      expect(redirectUrl.searchParams.get('error')).toBe('access_denied');
      expect(redirectUrl.searchParams.get('code')).toBeNull();
      expect(await findGrant()).toBeNull();
    });
  });

  it('approving consent (with a matching CSRF nonce) issues an auth code, redirects, and persists a grant', async () => {
    const { cookieHeader, formCsrf } = await fetchConsentContext();

    const res = await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/authorize/consent')
      .type('form')
      .set('Cookie', cookieHeader)
      .send({ ...baseAuthorizeParams(), decision: 'approve', csrf: formCsrf })
      .expect(302);

    const location = res.headers['location'];
    expect(location).toBeDefined();

    const redirectUrl = new URL(location);
    expect(`${redirectUrl.origin}${redirectUrl.pathname}`).toBe(REDIRECT_URI);
    expect(redirectUrl.searchParams.get('code')).toBeTruthy();
    expect(redirectUrl.searchParams.get('state')).toBe('test-state-value');

    const grant = await findGrant();
    expect(grant).toBeDefined();
    expect(grant!.scopes).toEqual(['crm.read', 'crm.write']);
    expect(grant!.clientName).toBe('Claude Desktop');
    expect(grant!.revoked).toBe(false);
  });
});

describe('MCP OAuth authorize + consent route guards', () => {
  // The e2e suite above stubs JwtAuthGuard entirely (via overrideGuard) so
  // it can drive deterministic, seeded requests — which means it can't
  // observe a real 401 for an unauthenticated request. Standing up a
  // second full Nest app + DB connection against the same hardcoded test
  // database just to prove the guard is wired would be redundant and
  // fragile (parallel connections to slackcrm_mcp_e2e mid dropSchema).
  // Instead, assert directly on the metadata Nest's @UseGuards() decorator
  // attaches to the handler — this is what JwtAuthGuard enforcement
  // actually depends on, and it fails loudly (empty/missing array) if the
  // decorator is ever removed from either handler.
  it('declares JwtAuthGuard on both authorize and consent handlers', () => {
    const authorizeGuards =
      Reflect.getMetadata(GUARDS_METADATA, McpOauthController.prototype.authorize) ?? [];
    const consentGuards =
      Reflect.getMetadata(GUARDS_METADATA, McpOauthController.prototype.consent) ?? [];

    expect(authorizeGuards).toContain(JwtAuthGuard);
    expect(consentGuards).toContain(JwtAuthGuard);
  });
});
