# SlackCRM MCP Server — Design

**Date:** 2026-08-22
**Status:** Design (approved in chat, pending spec review)
**Author:** Constantin Pristavita (with Claude)

## Goal

Expose SlackCRM to AI clients (Claude.ai / Claude Desktop / ChatGPT / any
MCP-capable client) via a **remote MCP server**, as a **multi-tenant product
feature**: every workspace/customer can connect their own AI assistant and
work with *their own* CRM data — reading, writing, deleting, and triggering
automations — with strict workspace isolation.

## Decisions (locked)

| Question | Decision |
|---|---|
| Primary user | CRM's customers — multi-tenant product feature |
| Capabilities | Full read/write incl. destructive + automations |
| Auth | OAuth 2.1 (authorization code + PKCE + Dynamic Client Registration) |
| Hosting | New `mcp` module inside existing NestJS backend, deployed on Fly.io |
| Rollout | Build the full tool set in one pass |
| MCP implementation | Raw `@modelcontextprotocol/sdk` wired into a Nest controller (no third-party Nest wrapper) |

## Grounding facts (verified in codebase)

- Backend is **its own JWT auth server**: `AuthService` signs access + refresh
  tokens with `auth.jwtSecret` (`backend/src/auth/auth.service.ts:391`).
  Stack Auth is frontend-only; the backend does **not** depend on it to issue
  tokens. → We can build MCP OAuth on top of existing JWT infrastructure.
- Existing OAuth-authorization-code helpers already present:
  `generateOAuthAuthCode` / `oauth-auth-code` token type / signed state tokens
  (`auth.service.ts:405-467`). Reuse the pattern.
- Global API prefix is `api/v1` (`main.ts` `setGlobalPrefix('api/v1')`).
- Port 4000, deployed as `slackcrm-backend` on Fly.io.
- All CRM entities are workspace-scoped via `WorkspaceEntity` (`workspaceId`).
- 6 RBAC roles: ADMIN, MANAGER, CLOSER, SETTER, SALES_REP, SUPPORT_AGENT.

## Architecture

New module `backend/src/mcp/`, deployed as part of `slackcrm-backend`.

```
backend/src/mcp/
  mcp.module.ts
  mcp.controller.ts          # Streamable HTTP transport endpoint(s)
  mcp.service.ts             # server bootstrap + tool registry + dispatch
  mcp-auth.guard.ts          # validates MCP access token -> {workspaceId,userId,role,scopes}
  tools/
    contacts.tools.ts
    deals.tools.ts
    companies.tools.ts
    tasks.tools.ts
    activities.tools.ts
    analytics.tools.ts
    workflows.tools.ts
    whatsapp.tools.ts
    email-campaigns.tools.ts
  oauth/
    mcp-oauth.controller.ts  # AS endpoints: register, authorize, token
    mcp-oauth.service.ts     # DCR, auth-code issue/exchange, token issue/refresh
    well-known.controller.ts # /.well-known/oauth-authorization-server (+ protected-resource)
  entities/
    mcp-oauth-client.entity.ts   # dynamically-registered clients
    mcp-oauth-grant.entity.ts    # consent grants (per workspace+user+client), revocable
    mcp-tool-invocation.entity.ts# audit log of every tool call
  dto/ ...
```

Tools call the **existing services** (ContactsService, DealsService,
WorkflowsService, WhatsAppService, etc.) — never raw repositories — so all
existing business rules, validation, and events still fire. The MCP layer is a
thin protocol + auth + audit shell over services you already have.

### Transport

- Streamable HTTP (current MCP standard). Endpoint under the app, e.g.
  `POST /api/v1/mcp` (single endpoint, session via `Mcp-Session-Id` header).
- **Discovery endpoints must be at root**, not under `api/v1`:
  `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource`. Handle by registering these routes
  with the global prefix excluded (Nest `setGlobalPrefix(..., { exclude: [...] })`),
  and advertise the actual authorize/token/register URLs (which *may* sit under
  `api/v1`) inside the discovery documents.

## Auth model (OAuth 2.1)

The backend becomes an **OAuth 2.1 Authorization Server** for MCP clients.

Flow:
1. AI client fetches `/.well-known/oauth-protected-resource` from the MCP URL,
   learns the authorization server location.
2. Client does **Dynamic Client Registration** (`POST /oauth/register`, RFC 7591)
   -> row in `mcp_oauth_client`.
3. Client sends user to `GET /oauth/authorize` with PKCE challenge. This route:
   - requires an authenticated CRM session (reuse existing login; if the user
     isn't logged in, redirect to the frontend login then back);
   - renders a **consent screen**: "Allow <ClientName> to access
     <Workspace Name> CRM data with these permissions?" listing scopes;
   - on approval, creates/updates an `mcp_oauth_grant` and issues a short-lived
     **authorization code** (reuse `oauth-auth-code` signed-token pattern),
     bound to workspaceId + userId + PKCE challenge.
4. Client exchanges code at `POST /oauth/token` (with PKCE verifier) for an
   **access token + refresh token**. Access token is a JWT carrying
   `{ workspaceId, userId, role, scopes[] }`, short TTL; refresh token rotates.
5. Every `/mcp` request presents `Authorization: Bearer <access token>`;
   `McpAuthGuard` validates it and populates the per-request auth context.

Revocation: a workspace admin sees active grants in
**Settings → Integrations → MCP** ("Claude has access — Revoke") which deletes
the grant and invalidates its tokens (reuse existing token-blacklist service).

### Scopes → RBAC

Scopes are coarse (`crm.read`, `crm.write`, `crm.automations`) and are the
*ceiling*; the user's existing **role** is the *floor*. Effective permission for
a tool = intersection(scope granted, role allows). A SETTER who grants
`crm.write` still cannot do things their role forbids. No new permission system —
reuse `user.hasPermission(...)`.

## Tool catalog

| Tier | Tools (initial) | Gate |
|---|---|---|
| Read | `search_contacts`, `get_contact`, `list_deals`, `get_deal_pipeline`, `list_companies`, `list_tasks`, `get_contact_activity`, `get_analytics_summary` | authenticated + `crm.read` |
| Safe write | `create_contact`, `update_contact`, `create_task`, `update_task`, `update_deal_stage`, `create_deal`, `log_activity`, `add_note` | `crm.write` + role write perm |
| Destructive / automation | `delete_contact`, `delete_deal`, `trigger_workflow`, `send_whatsapp_message`, `send_email_campaign` | `crm.automations` + role perm + **`confirm: true` arg required** |

Non-negotiable safety rules (given an LLM is the caller):
- Every destructive/automation tool **requires an explicit `confirm: true`**
  argument. Missing/false → hard error, no side effect. This is not a phase; it
  ships with the tool.
- Read tools **paginate and cap** result sizes (e.g. max 100 rows/call) to avoid
  dumping an entire workspace into a context window.
- Bulk sends (`send_email_campaign`) require the campaign to already exist /
  be explicitly identified — the tool triggers a defined campaign, it does not
  compose-and-blast to an arbitrary audience.

## Data flow (one tool call)

```
AI client → POST /api/v1/mcp (Bearer token)
  → McpAuthGuard: verify token → {workspaceId,userId,role,scopes}
  → mcp.service dispatch → tools/*.ts
      → scope + role check (deny early on failure)
      → destructive? require confirm:true
      → call existing Service (workspace-scoped)
      → write McpToolInvocation audit row
  → MCP result back to client
```

## New persistence

- `mcp_oauth_client` — dynamically registered clients (client_id, redirect_uris,
  name, created_at).
- `mcp_oauth_grant` — one per (workspace, user, client): granted scopes,
  created/last-used, revoked flag. Powers the Settings "who has access" list.
- `mcp_tool_invocation` — audit log: workspaceId, userId, tool, args (redacted
  for secrets), result status, error, timestamp. **Written for every tool call**,
  not just destructive ones, so tenant behavior is fully traceable.

Refresh tokens: either a `mcp_refresh_token` table or reuse the existing refresh
mechanism; decide during planning.

## Error handling

- Auth failures → MCP protocol error + `WWW-Authenticate` on the HTTP layer so
  clients re-run the OAuth flow.
- Scope/role denial → tool returns a clear "not permitted" error naming the
  missing permission (never silently returns empty data — that would look like
  "no records" to the AI).
- Destructive tool without `confirm` → explicit error instructing the caller to
  re-invoke with confirmation.
- Service-layer validation errors → surfaced verbatim (they already exist).

## Testing (QA-first priorities)

1. **Tenant isolation (highest):** e2e — workspace A's token against any tool
   must never return, mutate, or delete workspace B's data. Parameterized across
   every tool. This is the test that protects the whole product.
2. **Destructive guard:** every destructive/automation tool called without
   `confirm: true` must hard-fail with zero side effects (assert DB unchanged).
3. **Scope × role matrix:** each role × scope combination hits the expected
   allow/deny for a representative tool per tier.
4. **OAuth flow:** DCR → authorize+PKCE → code exchange → token → refresh →
   revoke, including PKCE-verifier-mismatch and expired-code rejection.
5. **Audit completeness:** every tool call produces exactly one
   `mcp_tool_invocation` row.

## Out of scope (this pass)

- API-key auth fallback (OAuth only for now).
- Per-tool granular scopes beyond the 3 coarse scopes.
- MCP "resources"/"prompts" primitives — tools only for v1.
- A separate standalone MCP deployment (staying in-backend).

## Open items to resolve in planning

- Exact `@modelcontextprotocol/sdk` version + Streamable HTTP session wiring
  inside a Nest controller (Express adapter).
- Whether to reuse the existing refresh-token table or add a dedicated one.
- Consent-screen UI: server-rendered minimal page vs. a frontend route.
- Rate limiting for `/mcp` (reuse existing ThrottlerModule).
