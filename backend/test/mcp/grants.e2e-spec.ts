import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { bootstrapTestApp } from './helpers';
import { User, UserRole, UserStatus } from '../../src/database/entities/user.entity';
import { McpOauthGrant } from '../../src/database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../../src/database/entities/mcp-refresh-token.entity';

/**
 * NOTE: Workspace/User are intentionally NOT registered in this focused
 * module's TypeOrmModule (see helpers.ts) — see oauth-authorize.e2e-spec.ts
 * for the rationale. We build plain, unpersisted User objects standing in
 * for what JwtStrategy#validate would normally load, and hand them to the
 * guard-override via `currentUserRef`. Only McpOauthGrant/McpRefreshToken
 * are genuinely persisted here.
 */
describe('MCP grant management (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const currentUserRef: { user?: User } = {};

  const WORKSPACE_A = 'ws-A';
  const WORKSPACE_B = 'ws-B';

  let userA: User;
  let userB: User;
  let grantA: McpOauthGrant;
  let grantB: McpOauthGrant;

  async function seedGrant(workspaceId: string, userId: string): Promise<McpOauthGrant> {
    const grantRepo = dataSource.getRepository(McpOauthGrant);
    return grantRepo.save(
      grantRepo.create({
        workspaceId,
        userId,
        clientId: `mcp_test_client_${workspaceId}`,
        clientName: 'Claude Desktop',
        scopes: ['crm.read', 'crm.write'],
        revoked: false,
        lastUsedAt: null,
      }),
    );
  }

  async function seedRefreshToken(grant: McpOauthGrant): Promise<McpRefreshToken> {
    const tokenRepo = dataSource.getRepository(McpRefreshToken);
    return tokenRepo.save(
      tokenRepo.create({
        jti: randomUUID(),
        grantId: grant.id,
        workspaceId: grant.workspaceId,
        userId: grant.userId,
        scopes: grant.scopes,
        revoked: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );
  }

  beforeAll(async () => {
    app = await bootstrapTestApp({ currentUserRef });
    dataSource = app.get(DataSource);

    userA = Object.assign(new User(), {
      id: randomUUID(),
      workspaceId: WORKSPACE_A,
      email: 'owner-a@acme.test',
      firstName: 'Ada',
      lastName: 'A',
      password: 'unused-hash',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    userB = Object.assign(new User(), {
      id: randomUUID(),
      workspaceId: WORKSPACE_B,
      email: 'owner-b@acme.test',
      firstName: 'Bea',
      lastName: 'B',
      password: 'unused-hash',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    grantA = await seedGrant(WORKSPACE_A, userA.id);
    grantB = await seedGrant(WORKSPACE_B, userB.id);

    await seedRefreshToken(grantA);
    await seedRefreshToken(grantA);
    await seedRefreshToken(grantB);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/mcp/grants', () => {
    it("returns only the caller's workspace grants", async () => {
      currentUserRef.user = userA;

      const res = await request(app.getHttpServer()).get('/api/v1/mcp/grants').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((g: any) => g.id);
      expect(ids).toContain(grantA.id);
      expect(ids).not.toContain(grantB.id);

      const returnedGrantA = res.body.find((g: any) => g.id === grantA.id);
      expect(returnedGrantA).toMatchObject({
        id: grantA.id,
        clientName: 'Claude Desktop',
        scopes: ['crm.read', 'crm.write'],
      });
      expect(returnedGrantA.createdAt).toBeDefined();
      expect('lastUsedAt' in returnedGrantA).toBe(true);
    });

    it('returns empty for a workspace with no grants', async () => {
      currentUserRef.user = Object.assign(new User(), {
        ...userB,
        workspaceId: 'ws-empty',
      });

      const res = await request(app.getHttpServer()).get('/api/v1/mcp/grants').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('DELETE /api/v1/mcp/grants/:id', () => {
    it('404s when deleting a grant belonging to another workspace, and leaves it untouched', async () => {
      currentUserRef.user = userA;

      await request(app.getHttpServer()).delete(`/api/v1/mcp/grants/${grantB.id}`).expect(404);

      const grantRepo = dataSource.getRepository(McpOauthGrant);
      const stillThere = await grantRepo.findOne({ where: { id: grantB.id } });
      expect(stillThere).toBeDefined();
      expect(stillThere!.revoked).toBe(false);
    });

    it("revokes the caller's grant and all of its refresh tokens", async () => {
      currentUserRef.user = userA;

      await request(app.getHttpServer()).delete(`/api/v1/mcp/grants/${grantA.id}`).expect(200);

      const grantRepo = dataSource.getRepository(McpOauthGrant);
      const revokedGrant = await grantRepo.findOne({ where: { id: grantA.id } });
      expect(revokedGrant!.revoked).toBe(true);

      const tokenRepo = dataSource.getRepository(McpRefreshToken);
      const tokens = await tokenRepo.find({ where: { grantId: grantA.id } });
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.revoked === true)).toBe(true);

      // grantB's refresh token must be unaffected by revoking grantA.
      const grantBTokens = await tokenRepo.find({ where: { grantId: grantB.id } });
      expect(grantBTokens.every((t) => t.revoked === false)).toBe(true);
    });

    it('the now-revoked grant no longer appears in the list endpoint', async () => {
      currentUserRef.user = userA;

      const res = await request(app.getHttpServer()).get('/api/v1/mcp/grants').expect(200);

      const ids = res.body.map((g: any) => g.id);
      expect(ids).not.toContain(grantA.id);
    });
  });
});
