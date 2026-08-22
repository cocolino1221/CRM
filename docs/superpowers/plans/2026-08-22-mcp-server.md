# SlackCRM MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose SlackCRM to AI clients via a multi-tenant remote MCP server (OAuth 2.1, full read/write tool catalog) as a new module inside the existing NestJS backend.

**Architecture:** A new `backend/src/mcp/` module. The backend acts as an OAuth 2.1 Authorization Server (auth code + PKCE + Dynamic Client Registration) built on its existing JWT infrastructure. An MCP server (raw `@modelcontextprotocol/sdk`, Streamable HTTP transport) is wired into a Nest controller; each tool call is authenticated to a `{workspaceId, userId, role, scopes}` context, enforced against scopes (ceiling) and RBAC role (floor), then delegates to existing services. Every call is audit-logged; destructive/automation tools require `confirm: true`.

**Tech Stack:** NestJS, TypeORM (PostgreSQL/Neon), `@modelcontextprotocol/sdk`, `@nestjs/jwt`, existing services (ContactsService, DealsService, TasksService, WorkflowsService, WhatsAppService, AnalyticsService, EmailCampaignsService).

**Spec:** `docs/superpowers/specs/2026-08-22-mcp-server-design.md`

## Global Constraints

- Global API prefix is `api/v1` (`main.ts` → `setGlobalPrefix('api/v1')`). MCP + OAuth routes live under it EXCEPT `/.well-known/*` which MUST be root-level (add to `setGlobalPrefix`'s `exclude`).
- Backend is its own JWT auth server; sign/verify with config key `auth.jwtSecret`. Never introduce a second signing secret without adding it to `env.validation.ts`.
- All CRM data is workspace-scoped. EVERY tool call MUST pass the token's `workspaceId` to the underlying service. Never accept a workspaceId from tool arguments.
- RBAC via `user.hasPermission(action: string)` — substring match. Actions used: `'read'`, `'create'`, `'update'`, `'delete'`. There are 8 roles; `'delete'` passes only for SUPER_ADMIN/ADMIN/MANAGER.
- Scopes (ceiling): `crm.read`, `crm.write`, `crm.automations`. Effective = granted scope AND role permission.
- Destructive/automation tools require an explicit `confirm: true` argument; missing/false = hard error, zero side effects.
- Read tools cap results at 100 rows/call.
- Every tool call writes exactly one `mcp_tool_invocation` audit row.
- Deployed as part of `slackcrm-backend` on Fly.io (`cd backend && ~/.fly/bin/flyctl deploy -a slackcrm-backend`). Port 4000.
- Tests run from `backend/`: `npm run test` (unit), `npm run test:e2e` (e2e). Type check: `npm run typecheck`.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass, commit.

---

## File Structure

```
backend/src/mcp/
  mcp.module.ts                       # wires everything; imports source modules for their services
  mcp.controller.ts                   # POST /mcp Streamable HTTP transport
  mcp.service.ts                      # MCP server bootstrap + tool registration
  auth/
    mcp-auth.context.ts               # McpAuthContext type + AsyncLocalStorage store
    mcp-token.service.ts              # issue/verify MCP access+refresh tokens (JWT)
    mcp.guard.ts                      # validates Bearer token on /mcp, sets context
  oauth/
    well-known.controller.ts          # root-level discovery docs
    mcp-oauth.controller.ts           # /oauth/mcp/register|authorize|token
    mcp-oauth.service.ts              # DCR, PKCE, auth-code, token exchange/refresh
    consent.view.ts                   # minimal consent HTML
  tools/
    tool.types.ts                     # ToolDef interface, ToolContext, registerTool helper
    contacts.tools.ts
    deals.tools.ts
    tasks.tools.ts
    analytics.tools.ts
    workflows.tools.ts
    whatsapp.tools.ts
    email-campaigns.tools.ts
  entities/
    mcp-oauth-client.entity.ts
    mcp-oauth-grant.entity.ts
    mcp-refresh-token.entity.ts
    mcp-tool-invocation.entity.ts
  mcp.settings.controller.ts          # JWT-guarded: list/revoke grants for a workspace
backend/src/database/migrations/<ts>-CreateMcpTables.ts
backend/test/mcp/*.e2e-spec.ts
```

Register the four entities in TypeORM (they are auto-globbed by `data-source.ts` if under `entities/**`; confirm the glob covers `src/mcp/entities` — if not, this plan's migration task adds them explicitly). `McpModule` is added to `app.module.ts` imports.

---

### Task 1: Module scaffold + SDK install + well-known prefix exclusion

**Files:**
- Create: `backend/src/mcp/mcp.module.ts`
- Modify: `backend/src/app.module.ts` (add `McpModule` to imports)
- Modify: `backend/src/main.ts` (exclude `/.well-known/*` from global prefix)
- Modify: `backend/package.json` (dependency)

**Interfaces:**
- Produces: `McpModule` (empty-but-valid Nest module), root-level route capability for well-known endpoints.

- [ ] **Step 1: Install the MCP SDK**

Run from `backend/`:
```bash
npm install @modelcontextprotocol/sdk
```

- [ ] **Step 2: Create an empty module**

`backend/src/mcp/mcp.module.ts`:
```ts
import { Module } from '@nestjs/common';

@Module({})
export class McpModule {}
```

- [ ] **Step 3: Register it in app.module.ts**

Add `import { McpModule } from './mcp/mcp.module';` and add `McpModule` to the `imports` array.

- [ ] **Step 4: Exclude well-known from the global prefix**

In `backend/src/main.ts`, change `app.setGlobalPrefix('api/v1');` to:
```ts
app.setGlobalPrefix('api/v1', {
  exclude: [
    '.well-known/oauth-authorization-server',
    '.well-known/oauth-protected-resource',
  ],
});
```

- [ ] **Step 5: Verify build**

Run: `npm run typecheck`
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/mcp.module.ts backend/src/app.module.ts backend/src/main.ts backend/package.json backend/package-lock.json
git commit -m "feat(mcp): scaffold module + install SDK + exclude well-known from prefix"
```

---

### Task 2: OAuth + audit entities + migration

**Files:**
- Create: `backend/src/mcp/entities/mcp-oauth-client.entity.ts`
- Create: `backend/src/mcp/entities/mcp-oauth-grant.entity.ts`
- Create: `backend/src/mcp/entities/mcp-refresh-token.entity.ts`
- Create: `backend/src/mcp/entities/mcp-tool-invocation.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-CreateMcpTables.ts` (generated)

**Interfaces:**
- Produces: entities `McpOauthClient`, `McpOauthGrant`, `McpRefreshToken`, `McpToolInvocation` with the fields below.

- [ ] **Step 1: Create `McpOauthClient`**

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_oauth_clients')
export class McpOauthClient {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ unique: true }) clientId: string;
  @Column({ type: 'jsonb' }) redirectUris: string[];
  @Column() clientName: string;
  @Column({ type: 'text', nullable: true }) clientUri: string | null;
  @CreateDateColumn() createdAt: Date;
}
```

- [ ] **Step 2: Create `McpOauthGrant`** (one per workspace+user+client; powers revoke UI)

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('mcp_oauth_grants')
@Index(['workspaceId', 'userId', 'clientId'], { unique: true })
export class McpOauthGrant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() workspaceId: string;
  @Column() userId: string;
  @Column() clientId: string;
  @Column() clientName: string;
  @Column({ type: 'jsonb' }) scopes: string[];
  @Column({ default: false }) revoked: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

- [ ] **Step 3: Create `McpRefreshToken`** (rotating; jti-based revocation)

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_refresh_tokens')
export class McpRefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ unique: true }) jti: string;
  @Column() grantId: string;
  @Column() workspaceId: string;
  @Column() userId: string;
  @Column({ type: 'jsonb' }) scopes: string[];
  @Column({ default: false }) revoked: boolean;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @CreateDateColumn() createdAt: Date;
}
```

- [ ] **Step 4: Create `McpToolInvocation`** (audit)

```ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_tool_invocations')
export class McpToolInvocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() workspaceId: string;
  @Column() userId: string;
  @Index() @Column() toolName: string;
  @Column({ type: 'jsonb', nullable: true }) args: Record<string, any> | null;
  @Column() status: 'success' | 'denied' | 'error';
  @Column({ type: 'text', nullable: true }) error: string | null;
  @CreateDateColumn() createdAt: Date;
}
```

- [ ] **Step 5: Generate the migration**

Run from `backend/`:
```bash
npm run migration:generate -- src/database/migrations/CreateMcpTables
```
Review the generated file; confirm it creates all four tables and indexes.

- [ ] **Step 6: Run + verify migration**

Run: `npm run migration:run`
Expected: all four tables created, no errors. (If `data-source.ts` entity glob doesn't include `src/mcp/entities`, add these entities to the entities list before generating — check `backend/src/database/data-source.ts`.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/mcp/entities backend/src/database/migrations
git commit -m "feat(mcp): add oauth client/grant/refresh-token + tool-invocation entities and migration"
```

---

### Task 3: MCP token service (issue/verify access + refresh)

**Files:**
- Create: `backend/src/mcp/auth/mcp-token.service.ts`
- Modify: `backend/src/mcp/mcp.module.ts`
- Test: `backend/src/mcp/auth/mcp-token.service.spec.ts`

**Interfaces:**
- Consumes: `JwtService` (from `@nestjs/jwt`), config `auth.jwtSecret`.
- Produces:
  - `McpTokenService.issueAccessToken(ctx: { workspaceId; userId; role: UserRole; scopes: string[] }): string` — short-lived (15m) JWT, `typ: 'mcp-access'`.
  - `McpTokenService.verifyAccessToken(token: string): McpAccessClaims` — throws on invalid; returns `{ workspaceId, userId, role, scopes }`.
  - `McpTokenService.issueRefreshToken(...)` / `rotateRefreshToken(...)` returning `{ token, jti, expiresAt }`.
  - Type `McpAccessClaims = { workspaceId: string; userId: string; role: UserRole; scopes: string[]; typ: 'mcp-access' }`.

- [ ] **Step 1: Write failing test**

`mcp-token.service.spec.ts`:
```ts
import { JwtService } from '@nestjs/jwt';
import { McpTokenService } from './mcp-token.service';
import { UserRole } from '../../database/entities/user.entity';

describe('McpTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret-at-least-32-chars-long!!' });
  const svc = new McpTokenService(jwt);

  it('round-trips access token claims', () => {
    const token = svc.issueAccessToken({
      workspaceId: 'ws1', userId: 'u1', role: UserRole.CLOSER, scopes: ['crm.read'],
    });
    const claims = svc.verifyAccessToken(token);
    expect(claims).toMatchObject({ workspaceId: 'ws1', userId: 'u1', role: UserRole.CLOSER, scopes: ['crm.read'], typ: 'mcp-access' });
  });

  it('rejects a token with wrong typ', () => {
    const bad = jwt.sign({ typ: 'other', workspaceId: 'ws1' });
    expect(() => svc.verifyAccessToken(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm run test -- mcp-token.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`mcp-token.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { UserRole } from '../../database/entities/user.entity';

export type McpAccessClaims = {
  workspaceId: string; userId: string; role: UserRole; scopes: string[]; typ: 'mcp-access';
};

@Injectable()
export class McpTokenService {
  constructor(private readonly jwt: JwtService) {}

  issueAccessToken(ctx: { workspaceId: string; userId: string; role: UserRole; scopes: string[] }): string {
    return this.jwt.sign({ ...ctx, typ: 'mcp-access' }, { expiresIn: '15m' });
  }

  verifyAccessToken(token: string): McpAccessClaims {
    let payload: any;
    try { payload = this.jwt.verify(token); } catch { throw new UnauthorizedException('invalid_token'); }
    if (payload?.typ !== 'mcp-access') throw new UnauthorizedException('invalid_token');
    return payload as McpAccessClaims;
  }

  issueRefreshToken(ctx: { grantId: string; workspaceId: string; userId: string; scopes: string[] }) {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const token = this.jwt.sign({ ...ctx, jti, typ: 'mcp-refresh' }, { expiresIn: '30d' });
    return { token, jti, expiresAt };
  }
}
```
(The DB persistence of refresh jti happens in the OAuth service — this service only mints/verifies JWTs.)

- [ ] **Step 4: Provide it in the module**

In `mcp.module.ts`, import `JwtModule.registerAsync` (mirror `auth.module.ts`: secret `auth.jwtSecret`) and add `McpTokenService` to providers/exports.

- [ ] **Step 5: Run test, verify pass**

Run: `npm run test -- mcp-token.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/auth/mcp-token.service.ts backend/src/mcp/auth/mcp-token.service.spec.ts backend/src/mcp/mcp.module.ts
git commit -m "feat(mcp): access/refresh token service on existing JWT secret"
```

---

### Task 4: OAuth Authorization Server — discovery + Dynamic Client Registration

**Files:**
- Create: `backend/src/mcp/oauth/well-known.controller.ts`
- Create: `backend/src/mcp/oauth/mcp-oauth.controller.ts`
- Create: `backend/src/mcp/oauth/mcp-oauth.service.ts`
- Modify: `backend/src/mcp/mcp.module.ts`
- Test: `backend/test/mcp/oauth-discovery.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `GET /.well-known/oauth-authorization-server` → `{ issuer, authorization_endpoint, token_endpoint, registration_endpoint, code_challenge_methods_supported: ['S256'], grant_types_supported: ['authorization_code','refresh_token'], scopes_supported }`.
  - `GET /.well-known/oauth-protected-resource` → `{ resource, authorization_servers: [issuer] }`.
  - `POST /api/v1/oauth/mcp/register` (DCR) → `{ client_id, redirect_uris, client_name }` (persists `McpOauthClient`).
  - `McpOauthService.registerClient(dto): Promise<McpOauthClient>`.

Base URL comes from config `APP_URL` (add to env validation if absent; default `https://slackcrm-backend.fly.dev`).

- [ ] **Step 1: Write failing e2e test**

`backend/test/mcp/oauth-discovery.e2e-spec.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { bootstrapTestApp } from './helpers'; // create if missing: builds AppModule test instance with prefix+exclude

describe('MCP OAuth discovery', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await bootstrapTestApp(); });
  afterAll(async () => { await app.close(); });

  it('serves authorization-server metadata at root', async () => {
    const res = await request(app.getHttpServer()).get('/.well-known/oauth-authorization-server').expect(200);
    expect(res.body.registration_endpoint).toContain('/api/v1/oauth/mcp/register');
    expect(res.body.code_challenge_methods_supported).toContain('S256');
  });

  it('registers a client via DCR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/oauth/mcp/register')
      .send({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })
      .expect(201);
    expect(res.body.client_id).toBeDefined();
  });
});
```
(If `bootstrapTestApp` / `helpers.ts` doesn't exist, add it in this step: it must replicate `main.ts`'s `setGlobalPrefix('api/v1', { exclude: [...] })` so root-level routes resolve.)

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:e2e -- oauth-discovery`
Expected: FAIL (routes 404).

- [ ] **Step 3: Implement the service**

`mcp-oauth.service.ts` `registerClient`: generate `clientId = 'mcp_' + randomUUID()`, validate `redirect_uris` non-empty array of https URLs, persist `McpOauthClient`, return it.

- [ ] **Step 4: Implement controllers**

`well-known.controller.ts` (no global-prefix because excluded): two GET handlers returning the metadata objects, endpoints built from `APP_URL`.
`mcp-oauth.controller.ts` (`@Controller('oauth/mcp')`): `@Post('register')` → maps DCR body to `registerClient`, returns `{ client_id, redirect_uris, client_name }`.

- [ ] **Step 5: Wire providers in module; register entities**

Add `TypeOrmModule.forFeature([McpOauthClient, McpOauthGrant, McpRefreshToken, McpToolInvocation])`, controllers, and `McpOauthService` to `mcp.module.ts`.

- [ ] **Step 6: Run, verify pass**

Run: `npm run test:e2e -- oauth-discovery`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/mcp/oauth backend/src/mcp/mcp.module.ts backend/test/mcp
git commit -m "feat(mcp): oauth discovery metadata + dynamic client registration"
```

---

### Task 5: OAuth authorize endpoint + consent + PKCE challenge

**Files:**
- Create: `backend/src/mcp/oauth/consent.view.ts`
- Modify: `backend/src/mcp/oauth/mcp-oauth.controller.ts` (add authorize GET + consent POST)
- Modify: `backend/src/mcp/oauth/mcp-oauth.service.ts` (auth-code issue)
- Test: `backend/test/mcp/oauth-authorize.e2e-spec.ts`

**Interfaces:**
- Consumes: existing CRM auth — the authorize route requires a logged-in CRM user. Reuse the same access-token extraction the app already supports (`accessToken` cookie or `Authorization` bearer, per `jwt.strategy.ts`). Guard with the existing `JwtAuthGuard`.
- Produces:
  - `GET /api/v1/oauth/mcp/authorize?client_id&redirect_uri&response_type=code&code_challenge&code_challenge_method=S256&state&scope` → renders consent HTML (lists requested scopes + workspace name), or 401→redirect to frontend login with return URL.
  - `POST /api/v1/oauth/mcp/authorize/consent` (JWT-guarded) → on approve: create/update `McpOauthGrant`, issue signed auth code (`McpOauthService.issueAuthCode`), redirect to `redirect_uri?code=...&state=...`.
  - `McpOauthService.issueAuthCode(payload: { clientId; workspaceId; userId; role; scopes; codeChallenge; redirectUri }): string` — a 60s JWT, `typ: 'mcp-auth-code'` (reuses the signed-token pattern from `auth.service.ts:405`).

- [ ] **Step 1: Write failing e2e test**

Test: authorize without auth → 401/redirect; with a valid CRM JWT for a known user → 200 HTML containing the workspace name and requested scopes; consent POST with approve → 302 to redirect_uri with a `code` query param. Use a seeded test user/workspace (reuse existing e2e seeding helpers if present).

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:e2e -- oauth-authorize`
Expected: FAIL.

- [ ] **Step 3: Implement auth-code issue**

`issueAuthCode` signs the payload with `auth.jwtSecret`, `expiresIn: '60s'`, `typ: 'mcp-auth-code'`. Store nothing extra — PKCE challenge travels inside the signed code.

- [ ] **Step 4: Implement authorize GET + consent POST**

Validate `client_id` exists and `redirect_uri` is one of the client's registered URIs (reject otherwise — do NOT redirect to an unregistered URI). Require `code_challenge_method=S256`. Render `consent.view.ts` HTML (workspace name from `req.user.workspace`, scopes parsed from `scope` param). Consent POST re-validates the same params, upserts `McpOauthGrant`, issues the code, 302-redirects.

- [ ] **Step 5: Run, verify pass**

Run: `npm run test:e2e -- oauth-authorize`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/oauth backend/test/mcp/oauth-authorize.e2e-spec.ts
git commit -m "feat(mcp): authorize endpoint with consent screen and PKCE auth code"
```

---

### Task 6: OAuth token endpoint (code exchange + PKCE verify + refresh)

**Files:**
- Modify: `backend/src/mcp/oauth/mcp-oauth.controller.ts` (add token POST)
- Modify: `backend/src/mcp/oauth/mcp-oauth.service.ts` (exchange + refresh)
- Test: `backend/test/mcp/oauth-token.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/oauth/mcp/token` handling `grant_type=authorization_code` (params: `code`, `code_verifier`, `client_id`, `redirect_uri`) and `grant_type=refresh_token` (param: `refresh_token`).
  - Returns `{ access_token, token_type: 'Bearer', expires_in: 900, refresh_token, scope }`.
  - `McpOauthService.exchangeCode(...)`, `McpOauthService.refresh(...)`.
- Consumes: `McpTokenService` (Task 3), `McpOauthGrant`/`McpRefreshToken` entities.

- [ ] **Step 1: Write failing e2e test**

Full happy path: register → authorize+consent (get code) → token exchange with correct PKCE verifier → receive access+refresh. Plus two negative cases: wrong `code_verifier` → 400 `invalid_grant`; reused/expired code → 400.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:e2e -- oauth-token`
Expected: FAIL.

- [ ] **Step 3: Implement `exchangeCode`**

Verify the auth-code JWT (typ `mcp-auth-code`, not expired). Recompute PKCE: `base64url(sha256(code_verifier)) === codeChallenge`, else throw `invalid_grant`. Confirm `redirect_uri` and `client_id` match the code. Load the `McpOauthGrant`; if revoked → reject. Issue access token (`McpTokenService.issueAccessToken`) + refresh token, persist `McpRefreshToken` (jti). Return the token response.

- [ ] **Step 4: Implement `refresh`**

Verify refresh JWT (typ `mcp-refresh`), look up `McpRefreshToken` by jti; if missing/revoked/expired → `invalid_grant`. Rotate: mark old jti revoked, load grant (reject if revoked), mint new access + new refresh, persist new jti. Update `grant.lastUsedAt`.

- [ ] **Step 5: Run, verify pass**

Run: `npm run test:e2e -- oauth-token`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/oauth backend/test/mcp/oauth-token.e2e-spec.ts
git commit -m "feat(mcp): token endpoint with PKCE verification and refresh rotation"
```

---

### Task 7: MCP auth context + guard

**Files:**
- Create: `backend/src/mcp/auth/mcp-auth.context.ts`
- Create: `backend/src/mcp/auth/mcp.guard.ts`
- Test: `backend/src/mcp/auth/mcp.guard.spec.ts`

**Interfaces:**
- Produces:
  - Type `McpAuthContext = { workspaceId: string; userId: string; role: UserRole; user: User; scopes: string[] }`.
  - `mcpStore: AsyncLocalStorage<McpAuthContext>` and helper `getMcpContext(): McpAuthContext` (throws if unset).
  - `McpGuard implements CanActivate` — extracts Bearer token, `McpTokenService.verifyAccessToken`, loads the `User` (reject if inactive/locked — mirror `jwt.strategy.ts`), checks the user's grant isn't revoked, sets `mcpStore` for the request.

- [ ] **Step 1: Write failing test**

Unit test the guard with a mocked `McpTokenService`/user repo: valid token → context populated; missing header → `UnauthorizedException`; token for a user whose grant is revoked → `UnauthorizedException`.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- mcp.guard`
Expected: FAIL.

- [ ] **Step 3: Implement context + guard**

`mcp-auth.context.ts` exports the `AsyncLocalStorage` and `getMcpContext`. `mcp.guard.ts` extracts `Authorization: Bearer`, verifies, loads user (`status: ACTIVE`, not locked), verifies a non-revoked `McpOauthGrant` exists for `{workspaceId,userId}`; on success it stores context and returns true. On any failure sets `WWW-Authenticate: Bearer` header and throws `UnauthorizedException`.

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- mcp.guard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/auth/mcp-auth.context.ts backend/src/mcp/auth/mcp.guard.ts backend/src/mcp/auth/mcp.guard.spec.ts
git commit -m "feat(mcp): request auth context + bearer guard for /mcp"
```

---

### Task 8: Tool framework — registry, enforcement, audit

**Files:**
- Create: `backend/src/mcp/tools/tool.types.ts`
- Create: `backend/src/mcp/tools/tool.runner.ts`
- Test: `backend/src/mcp/tools/tool.runner.spec.ts`

**Interfaces:**
- Produces:
  - ```ts
    type Scope = 'crm.read' | 'crm.write' | 'crm.automations';
    interface ToolDef<I = any> {
      name: string;
      description: string;
      inputSchema: object;                 // JSON schema for MCP
      scope: Scope;                        // required granted scope (ceiling)
      permission: 'read' | 'create' | 'update' | 'delete'; // hasPermission action (floor)
      destructive?: boolean;               // requires confirm:true
      handler: (input: I, ctx: McpAuthContext) => Promise<any>;
    }
    ```
  - `runTool(def: ToolDef, rawInput: any, ctx: McpAuthContext, repo: Repository<McpToolInvocation>): Promise<any>` — the single choke point that enforces scope, permission, `confirm`, executes, and writes exactly one audit row.

- [ ] **Step 1: Write failing test**

```ts
// tool.runner.spec.ts — key cases
it('denies when scope not granted', async () => { /* ctx.scopes=[] → throws, audit status 'denied' */ });
it('denies when role lacks permission', async () => { /* role SUPPORT_AGENT + permission 'create' → denied */ });
it('rejects destructive without confirm:true', async () => { /* throws, no handler call, audit 'denied' */ });
it('runs and writes one success audit row', async () => { /* handler called once, audit 'success' */ });
```
Use a fake `Repository` (jest mock) capturing `.save` calls; assert exactly one per run.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- tool.runner`
Expected: FAIL.

- [ ] **Step 3: Implement `runTool`**

Order: (1) if `!ctx.scopes.includes(def.scope)` → denied. (2) if `!ctx.user.hasPermission(def.permission)` → denied. (3) if `def.destructive && rawInput?.confirm !== true` → denied with message "This action requires confirm: true". (4) call `def.handler(rawInput, ctx)`; on throw → audit `error`, rethrow. On success → audit `success`. Every path writes one `McpToolInvocation` (redact any key named `password`/`token`/`secret` in stored `args`). Denials throw an `Error` whose message names the missing scope/permission (never return empty data).

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- tool.runner`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/tools/tool.types.ts backend/src/mcp/tools/tool.runner.ts backend/src/mcp/tools/tool.runner.spec.ts
git commit -m "feat(mcp): tool framework with scope/role/confirm enforcement and audit"
```

---

### Task 9: Read tools

**Files:**
- Create: `backend/src/mcp/tools/contacts.tools.ts`
- Create: `backend/src/mcp/tools/deals.tools.ts`
- Create: `backend/src/mcp/tools/tasks.tools.ts`
- Create: `backend/src/mcp/tools/analytics.tools.ts`
- Test: `backend/src/mcp/tools/read-tools.spec.ts`

**Interfaces:**
- Consumes: `ContactsService.findAll(workspaceId, query)`, `ContactsService.findOne(workspaceId, id, relations)`, `ContactsService.getActivities(workspaceId, contactId)`, `DealsService.findAll(workspaceId, query)`, `DealsService.getPipeline(workspaceId)`, `TasksService.findAll(workspaceId, query)`, `AnalyticsService.getComprehensiveDashboard(workspaceId, range)`.
- Produces: `ToolDef[]` — `search_contacts`, `get_contact`, `list_deals`, `get_deal_pipeline`, `list_tasks`, `get_contact_activity`, `get_analytics_summary`. All `scope: 'crm.read'`, `permission: 'read'`.

- [ ] **Step 1: Write failing test**

For `search_contacts`: mock `ContactsService.findAll` to return 500 rows; assert the tool caps output at 100 and always calls `findAll` with `ctx.workspaceId` (never a workspaceId from input). For `get_contact`: asserts it passes `ctx.workspaceId` and the input `id`.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- read-tools`
Expected: FAIL.

- [ ] **Step 3: Implement the read tools**

Each handler pulls services from a passed-in registry object, calls the service with `ctx.workspaceId`, applies a `limit = Math.min(input.limit ?? 25, 100)`. `inputSchema` documents filters (search string, stage, pagination) but NEVER a workspaceId. Example `search_contacts.handler`:
```ts
handler: async (input, ctx) => {
  const res = await deps.contacts.findAll(ctx.workspaceId, {
    search: input.search, page: input.page ?? 1,
    limit: Math.min(input.limit ?? 25, 100),
  } as any);
  return res;
},
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- read-tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/tools/contacts.tools.ts backend/src/mcp/tools/deals.tools.ts backend/src/mcp/tools/tasks.tools.ts backend/src/mcp/tools/analytics.tools.ts backend/src/mcp/tools/read-tools.spec.ts
git commit -m "feat(mcp): read tools (contacts/deals/tasks/analytics) with result caps"
```

---

### Task 10: Safe-write tools

**Files:**
- Modify: `backend/src/mcp/tools/contacts.tools.ts`, `deals.tools.ts`, `tasks.tools.ts`
- Test: `backend/src/mcp/tools/write-tools.spec.ts`

**Interfaces:**
- Consumes: `ContactsService.create(workspaceId, dto)`, `ContactsService.update(workspaceId, id, dto)`, `DealsService.create(workspaceId, dto)`, `DealsService.updateStage(workspaceId, id, stage)`, `TasksService.create(workspaceId, creatorId, dto)`, `TasksService.update(workspaceId, id, dto)`, `TasksService.complete(workspaceId, id, notes?)`.
- Produces: `ToolDef[]` — `create_contact`, `update_contact` (`permission:'update'`), `create_deal`, `update_deal_stage` (`permission:'update'`), `create_task`, `update_task`, `complete_task`. All `scope:'crm.write'`. `create_*` → `permission:'create'`.

- [ ] **Step 1: Write failing test**

`create_task` passes `ctx.workspaceId` and `ctx.userId` as `creatorId` to `TasksService.create`. `update_deal_stage` maps `input.stage` (validate against `DealStage` enum; unknown → throws before calling the service).

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- write-tools`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the tool defs. Validate enum inputs (`DealStage`, `TaskStatus`) inside handlers, throwing a descriptive error on invalid values. `create_task` handler: `deps.tasks.create(ctx.workspaceId, ctx.userId, dto)`.

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- write-tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/tools backend/src/mcp/tools/write-tools.spec.ts
git commit -m "feat(mcp): safe-write tools (create/update contacts, deals, tasks)"
```

---

### Task 11: Destructive + automation tools (confirm-gated)

**Files:**
- Modify: `backend/src/mcp/tools/contacts.tools.ts`, `deals.tools.ts`
- Create: `backend/src/mcp/tools/workflows.tools.ts`
- Create: `backend/src/mcp/tools/whatsapp.tools.ts`
- Create: `backend/src/mcp/tools/email-campaigns.tools.ts`
- Test: `backend/src/mcp/tools/destructive-tools.spec.ts`

**Interfaces:**
- Consumes: `ContactsService.remove(workspaceId, id)`, `DealsService.remove(workspaceId, id)`, `WorkflowsService.findOne(id, workspaceId)` + `WorkflowsService.execute(workflowId, triggerData)`, `WhatsAppService.sendMessageForWorkspace(...)` (verify its exact signature at `whatsapp.service.ts:440` when implementing), `EmailCampaignsService.findOne(workspaceId, id)` + `EmailCampaignsService.sendAsync(workspaceId, id)`.
- Produces: `ToolDef[]` all with `destructive: true`, `scope:'crm.automations'` — `delete_contact` (`permission:'delete'`), `delete_deal` (`permission:'delete'`), `trigger_workflow` (`permission:'update'`), `send_whatsapp_message` (`permission:'update'`), `send_email_campaign` (`permission:'update'`).

- [ ] **Step 1: Write failing test**

For each destructive tool: without `confirm:true` the handler is never called (covered by runner, but assert per-tool wiring: `destructive === true`). `trigger_workflow` first calls `WorkflowsService.findOne(id, ctx.workspaceId)` — if it throws/not found, the tool errors without executing. `send_email_campaign` calls `findOne(ctx.workspaceId, id)` before `sendAsync`, so a campaign from another workspace can't be triggered.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- destructive-tools`
Expected: FAIL.

- [ ] **Step 3: Implement**

Each handler re-fetches the target scoped to `ctx.workspaceId` before acting (defense in depth even though the service is scoped). `trigger_workflow`: `await deps.workflows.findOne(input.workflowId, ctx.workspaceId); return deps.workflows.execute(input.workflowId, input.triggerData ?? {});`. `send_whatsapp_message`: confirm the exact param object `sendMessageForWorkspace` expects and pass `ctx.workspaceId` + `to` + `text`. `send_email_campaign`: `await deps.campaigns.findOne(ctx.workspaceId, input.campaignId); return deps.campaigns.sendAsync(ctx.workspaceId, input.campaignId);`.

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- destructive-tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/tools backend/src/mcp/tools/destructive-tools.spec.ts
git commit -m "feat(mcp): destructive/automation tools (delete, trigger workflow, whatsapp, campaigns) with confirm gate"
```

---

### Task 12: MCP server bootstrap + Streamable HTTP controller

**Files:**
- Create: `backend/src/mcp/mcp.service.ts`
- Create: `backend/src/mcp/mcp.controller.ts`
- Modify: `backend/src/mcp/mcp.module.ts`
- Test: `backend/test/mcp/mcp-endpoint.e2e-spec.ts`

**Interfaces:**
- Consumes: all `ToolDef[]` (Tasks 9-11), `runTool` (Task 8), `McpGuard` (Task 7), `getMcpContext`.
- Produces: `POST /api/v1/mcp` — MCP Streamable HTTP endpoint. `McpService` builds the SDK `Server`, registers every tool (name/description/inputSchema), and routes `CallToolRequest` through `runTool` with the current `getMcpContext()`.

- [ ] **Step 1: Write failing e2e test**

Obtain an MCP access token (reuse OAuth happy path or mint one via `McpTokenService` in the test). `POST /api/v1/mcp` with a `tools/list` JSON-RPC request → 200 and the tool names appear. A `tools/call` for `search_contacts` (mock/seed one contact) → returns the contact. Without a Bearer token → 401 with `WWW-Authenticate`.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:e2e -- mcp-endpoint`
Expected: FAIL.

- [ ] **Step 3: Implement `McpService`**

Build a `@modelcontextprotocol/sdk` `Server`, set `tools/list` from the aggregated `ToolDef[]`, and a `CallToolRequestSchema` handler that finds the def by name and calls `runTool(def, args, getMcpContext(), invocationRepo)`. Aggregate the per-domain tool arrays in the constructor, injecting the domain services (imported via `mcp.module.ts` importing `ContactsModule`, `DealsModule`, `TasksModule`, `AnalyticsModule`, `WorkflowsModule`, `WhatsAppModule`, `EmailCampaignsModule` and each exporting its service).

- [ ] **Step 4: Implement the controller**

`@Controller('mcp')` `@UseGuards(McpGuard)` with a `@Post()` that connects the request/response to the SDK's `StreamableHTTPServerTransport` (per SDK docs) and wraps the handling in `mcpStore.run(context, ...)` so `getMcpContext()` works inside tools. Confirm the exact transport wiring against the installed SDK version's README before finalizing.

- [ ] **Step 5: Run, verify pass**

Run: `npm run test:e2e -- mcp-endpoint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mcp/mcp.service.ts backend/src/mcp/mcp.controller.ts backend/src/mcp/mcp.module.ts backend/test/mcp/mcp-endpoint.e2e-spec.ts
git commit -m "feat(mcp): streamable-http endpoint wiring tools through the runner"
```

---

### Task 13: Grant management (list/revoke) for Settings

**Files:**
- Create: `backend/src/mcp/mcp.settings.controller.ts`
- Modify: `backend/src/mcp/mcp.module.ts`
- Test: `backend/test/mcp/grants.e2e-spec.ts`

**Interfaces:**
- Consumes: existing `JwtAuthGuard`, `McpOauthGrant`, `McpRefreshToken`, `TokenBlacklistService`.
- Produces (all JWT-guarded, workspace-scoped from `req.user`):
  - `GET /api/v1/mcp/grants` → list active grants for the user's workspace (`{ id, clientName, scopes, createdAt, lastUsedAt }`).
  - `DELETE /api/v1/mcp/grants/:id` → set `grant.revoked = true`, revoke associated `McpRefreshToken` rows; access tokens expire within 15m.

- [ ] **Step 1: Write failing e2e test**

Seed a grant for workspace A. `GET /mcp/grants` as an A user returns it; as a B user returns empty. `DELETE` it → grant revoked, its refresh tokens revoked, and a subsequent `/mcp` call with that grant's token fails at the guard.

- [ ] **Step 2: Run, verify fail**

Run: `npm run test:e2e -- grants`
Expected: FAIL.

- [ ] **Step 3: Implement the controller**

List filters `workspaceId = req.user.workspaceId, revoked: false`. Delete verifies the grant belongs to the caller's workspace (404 otherwise), sets revoked, updates its refresh tokens to `revoked: true`.

- [ ] **Step 4: Run, verify pass**

Run: `npm run test:e2e -- grants`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mcp/mcp.settings.controller.ts backend/src/mcp/mcp.module.ts backend/test/mcp/grants.e2e-spec.ts
git commit -m "feat(mcp): list/revoke grants endpoints for settings UI"
```

---

### Task 14: Tenant-isolation + safety e2e suite

**Files:**
- Create: `backend/test/mcp/tenant-isolation.e2e-spec.ts`
- Create: `backend/test/mcp/safety.e2e-spec.ts`

**Interfaces:**
- Consumes: everything above. This is the highest-priority guarantee in the spec.

- [ ] **Step 1: Write the isolation suite**

Seed workspace A (with contacts/deals/tasks) and workspace B (with different data), each with its own MCP token. For EVERY read tool: calling with A's token returns only A's data, never B's. For `get_contact`/`get_deal`/`delete_*`/`update_*`/`trigger_workflow`/`send_email_campaign`: pass an ID that belongs to B while authenticated as A → must fail (not found / denied), and B's record is unchanged afterward. Parameterize over the tool list so new tools are covered automatically.

- [ ] **Step 2: Write the safety suite**

For every `destructive` tool: call with valid scope+role+workspace but WITHOUT `confirm` → error, and assert the DB row is unchanged (re-query). Scope×role matrix: a `crm.read`-only token calling any write tool → denied; a SUPPORT_AGENT (`read`/`update` only) calling `create_contact` → denied; calling `delete_contact` → denied. Assert each denial writes an audit row with `status: 'denied'`.

- [ ] **Step 3: Run both, verify pass**

Run: `npm run test:e2e -- tenant-isolation` then `npm run test:e2e -- safety`
Expected: PASS. Fix any leak immediately — a failure here is a release blocker.

- [ ] **Step 4: Commit**

```bash
git add backend/test/mcp/tenant-isolation.e2e-spec.ts backend/test/mcp/safety.e2e-spec.ts
git commit -m "test(mcp): tenant-isolation and destructive-guard e2e suites"
```

---

### Task 15: Env, docs, deploy

**Files:**
- Modify: `backend/src/config/env.validation.ts` (add `APP_URL` if missing)
- Modify: `CLAUDE.md` (document the MCP endpoints)
- Modify: `backend/.env.example` (add `APP_URL`)

**Interfaces:** none new — operational wiring.

- [ ] **Step 1: Add `APP_URL` to env validation**

Add `APP_URL: Joi.string().uri().default('https://slackcrm-backend.fly.dev')` (match the file's existing Joi style).

- [ ] **Step 2: Document the surface in CLAUDE.md**

Under integrations, add: MCP endpoint `POST /api/v1/mcp`; discovery `/.well-known/oauth-authorization-server`; connect flow; the three scopes; that destructive tools need `confirm:true`.

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run typecheck && npm run test && npm run test:e2e`
Expected: all PASS.

- [ ] **Step 4: Set the Fly secret (if APP_URL not already set)**

```bash
cd backend && ~/.fly/bin/flyctl secrets set APP_URL="https://slackcrm-backend.fly.dev" -a slackcrm-backend
```

- [ ] **Step 5: Deploy**

```bash
cd backend && ~/.fly/bin/flyctl deploy -a slackcrm-backend
```
Verify: `curl https://slackcrm-backend.fly.dev/.well-known/oauth-authorization-server` returns the metadata.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/env.validation.ts backend/.env.example CLAUDE.md
git commit -m "chore(mcp): env config, docs, deploy wiring"
```

---

## Self-Review Notes

- **Spec coverage:** OAuth 2.1/DCR/PKCE (T4-6), consent+revoke (T5,T13), tool tiers read/write/destructive (T9-11), confirm gate + audit (T8,T11,T14), scopes-ceiling/role-floor (T8), workspace isolation (T14), in-backend module + well-known root routes (T1), Streamable HTTP (T12), deploy (T15). All spec sections map to a task.
- **Known verification points flagged inline** (not placeholders — real "confirm against installed version" checks): exact `@modelcontextprotocol/sdk` transport API (T12), `WhatsAppService.sendMessageForWorkspace` signature (T11), `data-source.ts` entity glob coverage (T2). These are integration seams with your existing code/third-party lib that the implementer must read at the point of use.
- **Type consistency:** `McpAuthContext`, `ToolDef`, `runTool`, `getMcpContext`, `issueAccessToken/verifyAccessToken` names are used consistently across T3, T7, T8, T9-12.
