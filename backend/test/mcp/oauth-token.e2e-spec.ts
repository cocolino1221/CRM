import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
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

  function postToken(body: Record<string, unknown>) {
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

    it('rejects a numeric code_verifier with 400 invalid_grant (not a 500 crash)', async () => {
      const { challenge } = makePkcePair();
      const code = issueCode(challenge);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: 123456,
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
    });

    it('rejects an object code_verifier with 400 invalid_grant (not a 500 crash)', async () => {
      const { challenge } = makePkcePair();
      const code = issueCode(challenge);

      const res = await postToken({
        grant_type: 'authorization_code',
        code,
        code_verifier: { nested: 'object' },
        client_id: client.clientId,
        redirect_uri: REDIRECT_URI,
      }).expect(400);

      expect(res.body.error).toBe('invalid_grant');
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

    it('under concurrent use of the SAME refresh_token, exactly one request succeeds and the other is rejected (no double-redemption)', async () => {
      const first = await exchangeHappyPath();

      // Force the two concurrent refresh() calls to genuinely interleave:
      // both must complete their read of the not-yet-revoked row BEFORE
      // EITHER one is allowed to proceed to writing — exactly the TOCTOU
      // window the atomic conditional UPDATE in refresh() has to close.
      //
      // A fixed setTimeout delay on findOne is NOT sufficient here (this
      // was tried first): both calls' real DB round-trips (read, then
      // write) only take a few ms locally, comparable to the few-ms
      // scheduling gap between when the two concurrent calls each start
      // their delay. That means the SECOND call's delayed read can easily
      // land AFTER the FIRST call's write has already committed — so the
      // second read observes revoked:true (freshly, correctly) even
      // against the OLD, unfixed find-then-save code, making the race
      // never actually manifest and this test pass for the wrong reason.
      //
      // Instead, use an explicit two-party barrier: findOne performs the
      // REAL read immediately (so both calls read the genuine
      // not-yet-revoked row), then blocks until BOTH concurrent calls have
      // reached this point, and only then releases both simultaneously.
      // This guarantees both requests hold a stale (pre-write) snapshot
      // before either is allowed to act on it, deterministically
      // reproducing the vulnerable window regardless of local DB latency.
      const refreshRepo = app.get<Repository<McpRefreshToken>>(getRepositoryToken(McpRefreshToken));
      const originalFindOne = refreshRepo.findOne.bind(refreshRepo);
      const PARTIES = 2;
      let arrived: Array<() => void> = [];
      const findOneSpy = jest
        .spyOn(refreshRepo, 'findOne')
        .mockImplementation(async (...args: Parameters<typeof originalFindOne>) => {
          const result = await originalFindOne(...args);
          await new Promise<void>((release) => {
            arrived.push(release);
            if (arrived.length >= PARTIES) {
              arrived.forEach((r) => r());
              arrived = [];
            }
          });
          return result;
        });

      try {
        const [resA, resB] = await Promise.all([
          postToken({ grant_type: 'refresh_token', refresh_token: first.refresh_token }),
          postToken({ grant_type: 'refresh_token', refresh_token: first.refresh_token }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses).toEqual([200, 400]);

        const failed = resA.status === 400 ? resA : resB;
        expect(failed.body.error).toBe('invalid_grant');

        // The winner's newly-minted refresh row must exist and be
        // non-revoked. (Not asserting this is the ONLY non-revoked row for
        // the grant: earlier tests in this file share the same grant and
        // legitimately leave their own non-revoked rows behind — the
        // meaningful invariant here is specifically that the LOSER never
        // got a row of its own, which is already covered by asserting its
        // response was a 400 before issueTokens() could ever run.)
        const succeeded = resA.status === 200 ? resA : resB;
        const newDecoded: any = jwtService.decode(succeeded.body.refresh_token);
        const newRow = await dataSource
          .getRepository(McpRefreshToken)
          .findOneOrFail({ where: { jti: newDecoded.jti } });
        expect(newRow.revoked).toBe(false);
      } finally {
        findOneSpy.mockRestore();
      }
    });

    it('re-derives scopes from the LIVE grant (not the stale refresh-token row) when issuing new tokens', async () => {
      const first = await exchangeHappyPath();

      const grantRepo = dataSource.getRepository(McpOauthGrant);
      const grant = await grantRepo.findOneOrFail({
        where: { workspaceId: workspace.id, userId: user.id, clientId: client.clientId },
      });
      grant.scopes = ['crm.read'];
      await grantRepo.save(grant);

      try {
        const res = await postToken({
          grant_type: 'refresh_token',
          refresh_token: first.refresh_token,
        }).expect(200);

        expect(res.body.scope).toBe('crm.read');

        const decodedAccess: any = jwtService.decode(res.body.access_token);
        expect(decodedAccess.scopes).toEqual(['crm.read']);
      } finally {
        // restore for subsequent tests in this file
        grant.scopes = SCOPES;
        await grantRepo.save(grant);
      }
    });
  });
});
