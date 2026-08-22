import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { bootstrapTestApp } from './helpers';
import { Workspace } from '../../src/database/entities/workspace.entity';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { McpOauthClient } from '../../src/database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../src/database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../../src/database/entities/mcp-refresh-token.entity';
import { McpOauthService, AuthCodePayload } from '../../src/mcp/oauth/mcp-oauth.service';

/**
 * NOTE: Workspace/User are intentionally NOT registered in this focused
 * module's TypeOrmModule (see helpers.ts) — same rationale as
 * oauth-authorize.e2e-spec.ts. Only McpOauthClient/McpOauthGrant/
 * McpRefreshToken are genuinely persisted.
 *
 * Per the brief, we obtain a real auth `code` by calling
 * McpOauthService.issueAuthCode(...) directly (rather than driving the full
 * authorize+consent HTTP flow, which is already covered by
 * oauth-authorize.e2e-spec.ts) with a known PKCE verifier/challenge pair,
 * and a grant persisted directly via McpOauthService.upsertGrant(...).
 */

describe('MCP OAuth token endpoint (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mcpOauthService: McpOauthService;
  let jwtService: JwtService;

  let workspace: Workspace;
  let user: User;
  let client: McpOauthClient;

  const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
  const SCOPES = ['crm.read', 'crm.write'];

  function makePkcePair() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function issueCode(codeChallenge: string, overrides: Partial<AuthCodePayload> = {}): string {
    return mcpOauthService.issueAuthCode({
      clientId: client.clientId,
      workspaceId: workspace.id,
      userId: user.id,
      role: user.role,
      scopes: SCOPES,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      ...overrides,
    });
  }

  function postToken(body: Record<string, string>) {
    return request(app.getHttpServer()).post('/api/v1/oauth/mcp/token').send(body);
  }

  async function exchangeHappyPath(): Promise<{ access_token: string; refresh_token: string; scope: string }> {
    const { verifier, challenge } = makePkcePair();
    const code = issueCode(challenge);
    const res = await postToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: client.clientId,
      redirect_uri: REDIRECT_URI,
    }).expect(200);
    return res.body;
  }

  beforeAll(async () => {
    app = await bootstrapTestApp();
    dataSource = app.get(DataSource);
    mcpOauthService = app.get(McpOauthService);
    jwtService = app.get(JwtService, { strict: false });

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
        features: { aiEnabled: false, slackIntegration: false, emailIntegration: false },
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

    const clientRepo = dataSource.getRepository(McpOauthClient);
    client = await clientRepo.save(
      clientRepo.create({
        clientId: 'mcp_test_client',
        redirectUris: [REDIRECT_URI],
        clientName: 'Claude Desktop',
      }),
    );

    await mcpOauthService.upsertGrant({
      workspaceId: workspace.id,
      userId: user.id,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes: SCOPES,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authorization_code grant', () => {
    it('exchanges a valid code + matching verifier for access + refresh tokens and persists a refresh row', async () => {
      const { verifier, challenge } = makePkcePair();
      const code = issueCode(challenge);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(200);

      expect(res.body).toMatchObject({
        token_type: 'Bearer',
        expires_in: 900,
        scope: 'crm.read crm.write',
      });
      expect(typeof res.body.access_token).toBe('string');
      expect(typeof res.body.refresh_token).toBe('string');

      const decodedRefresh: any = jwtService.decode(res.body.refresh_token);
      expect(decodedRefresh.typ).toBe('mcp-refresh');

      const row = await dataSource
        .getRepository(McpRefreshToken)
        .findOne({ where: { jti: decodedRefresh.jti } });
      expect(row).toBeDefined();
      expect(row!.revoked).toBe(false);
      expect(row!.workspaceId).toBe(workspace.id);
      expect(row!.userId).toBe(user.id);
      expect(row!.scopes).toEqual(SCOPES);

      const decodedAccess: any = jwtService.decode(res.body.access_token);
      expect(decodedAccess.typ).toBe('mcp-access');
      expect(decodedAccess.role).toBe(UserRole.ADMIN);
      expect(decodedAccess.workspaceId).toBe(workspace.id);
    });

    it('rejects a wrong code_verifier with 400 invalid_grant', async () => {
      const { challenge } = makePkcePair();
      const code = issueCode(challenge);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: 'this-does-not-match-the-original-verifier-at-all',
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects a reused code on the second exchange with 400 invalid_grant', async () => {
      const { verifier, challenge } = makePkcePair();
      const code = issueCode(challenge);

      await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(200);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects an expired code with 400 invalid_grant', async () => {
      const { verifier, challenge } = makePkcePair();
      const expiredCode = jwtService.sign(
        {
          clientId: client.clientId,
          workspaceId: workspace.id,
          userId: user.id,
          role: user.role,
          scopes: SCOPES,
          codeChallenge: challenge,
          redirectUri: REDIRECT_URI,
          typ: 'mcp-auth-code',
        },
        { expiresIn: '1ms' },
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const res = await postToken({
        grant_type: 'authorization_code',
        code: expiredCode,
        code_verifier: verifier,
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects a redirect_uri that does not match the one embedded in the code with 400 invalid_grant', async () => {
      const { verifier, challenge } = makePkcePair();
      const code = issueCode(challenge);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: client.clientId,
        redirect_uri: 'https://not-the-registered-callback.example.com/cb',
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects a code whose grant has been revoked with 400 invalid_grant', async () => {
      const { verifier, challenge } = makePkcePair();
      const code = issueCode(challenge);

      const grantRepo = dataSource.getRepository(McpOauthGrant);
      const grant = await grantRepo.findOneOrFail({
        where: { workspaceId: workspace.id, userId: user.id, clientId: client.clientId },
      });
      grant.revoked = true;
      await grantRepo.save(grant);

      try {
        const res = await postToken({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: client.clientId,
          redirect_uri: REDIRECT_URI,
        }).expect(400);

        expect(res.body.error).toBe('invalid_grant');
      } finally {
        // un-revoke so subsequent tests in this file still see an active grant
        grant.revoked = false;
        await grantRepo.save(grant);
      }
    });

    it('rejects an unsupported grant_type with 400 unsupported_grant_type', async () => {
      const res = await postToken({ grant_type: 'password' }).expect(400);
      expect(res.body.error).toBe('unsupported_grant_type');
    });

    it('rejects a missing grant_type with 400 invalid_request', async () => {
      const res = await postToken({}).expect(400);
      expect(res.body.error).toBe('invalid_request');
    });
  });

  describe('refresh_token grant', () => {
    it('rotates: issues new access + refresh tokens, revokes the old refresh row, and updates grant.lastUsedAt', async () => {
      const first = await exchangeHappyPath();
      const oldDecoded: any = jwtService.decode(first.refresh_token);

      const grantRepoBefore = await dataSource
        .getRepository(McpOauthGrant)
        .findOneOrFail({ where: { workspaceId: workspace.id, userId: user.id, clientId: client.clientId } });
      expect(grantRepoBefore.lastUsedAt).toBeNull();

      const res = await postToken({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
      }).expect(200);

      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'crm.read crm.write' });
      expect(res.body.refresh_token).not.toBe(first.refresh_token);
      // NOTE: access tokens carry no jti/nonce (see McpTokenService), so two
      // issuances with an identical payload within the same wall-clock
      // second are a legitimately identical HMAC — not asserting
      // inequality here. Rotation is proven via the refresh_token change
      // plus the old/new McpRefreshToken row states below.
      expect(typeof res.body.access_token).toBe('string');

      const refreshRepo = dataSource.getRepository(McpRefreshToken);

      const oldRow = await refreshRepo.findOneOrFail({ where: { jti: oldDecoded.jti } });
      expect(oldRow.revoked).toBe(true);

      const newDecoded: any = jwtService.decode(res.body.refresh_token);
      const newRow = await refreshRepo.findOneOrFail({ where: { jti: newDecoded.jti } });
      expect(newRow.revoked).toBe(false);
      expect(newRow.grantId).toBe(oldRow.grantId);

      const grantAfter = await dataSource
        .getRepository(McpOauthGrant)
        .findOneOrFail({ where: { workspaceId: workspace.id, userId: user.id, clientId: client.clientId } });
      expect(grantAfter.lastUsedAt).not.toBeNull();
    });

    it('rejects reusing an already-rotated refresh token with 400 invalid_grant', async () => {
      const first = await exchangeHappyPath();

      await postToken({ grant_type: 'refresh_token', refresh_token: first.refresh_token }).expect(200);

      const res = await postToken({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects an unknown/garbage refresh_token with 400 invalid_grant', async () => {
      const res = await postToken({
        grant_type: 'refresh_token',
        refresh_token: 'not-a-real-jwt',
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects a missing refresh_token with 400 invalid_request', async () => {
      const res = await postToken({ grant_type: 'refresh_token' }).expect(400);
      expect(res.body.error).toBe('invalid_request');
    });
  });
});
