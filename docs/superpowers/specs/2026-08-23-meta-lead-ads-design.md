# Meta (Facebook/Instagram) Lead Ads Ingestion — Design Spec

**Date:** 2026-08-23
**Backend:** NestJS (`backend/`)
**Frontend:** Next.js (`frontend/app/(dashboard)/integrations/page.tsx`)

## Goal

Let leads enter the CRM directly from Meta's native in-ad "Instant Forms" (Facebook/Instagram Lead Ads) — a lead captured inside the ad without the person ever leaving Facebook/Instagram — as a second capture source alongside the landing-page path from the [webinar lead funnel design](2026-08-23-webinar-lead-funnel-design.md) (Phase 1, built separately). This is Phase 2 of that design, scoped out on purpose because it's a distinct integration surface (OAuth/webhook), not because it's lower priority.

Out of the gate: **not WhatsApp, not Messenger/IG DMs** — Lead Ads is a Meta advertising product where the answers to a lead form are fetched via Graph API after a `leadgen` webhook fires. It has nothing to do with messaging once the lead is captured.

## Current State (what already exists, reused as-is)

- **Facebook/Instagram social login already exists** for the unrelated Messenger/IG DM feature (`meta-messaging/`), stored as `Integration.type = API` with `config.provider = 'facebook'` (not a dedicated `IntegrationType`). This matters a lot for this design — see "Key Decision" below.
- **`OAuthService`** (`backend/src/integrations/auth/oauth.service.ts`) already has a full `facebook` provider config (`getOAuthConfig`, provider key `'facebook'`) with:
  - Auth/token URLs for Facebook Login for Business (`www.facebook.com/v23.0/dialog/oauth`, `graph.facebook.com/v23.0/oauth/access_token`).
  - Default scopes that **already include `leads_retrieval`** alongside `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `public_profile`, `email` — added for this feature, no separate scope negotiation needed.
  - Credential fallback: `clientId`/`clientSecret` resolve to `OAUTH_FACEBOOK_CLIENT_ID/SECRET` first, then fall back to `META_APP_ID`/`META_APP_SECRET` — **the same Meta app already configured for WhatsApp/Messenger** (per project memory: recreated after the 2026-05 WhatsApp suspension). No new Meta app is required.
  - `config_id` support for Facebook Login for Business dialogs (`OAUTH_FACEBOOK_CONFIG_ID` / `META_LOGIN_CONFIG_ID`), already wired.
- **Shared Meta webhook endpoint** (`meta-messaging.controller.ts`): `POST /integrations/meta-messaging/webhook/:provider[/:integrationId]`, `GET` verification (hub.challenge). This is the single callback URL Meta calls for a connected Page — Messenger events and Lead Ads `leadgen` events for the *same Page* arrive on the *same URL*, because Meta subscribes both fields against one Page webhook subscription. Building a second, dedicated webhook endpoint for Lead Ads would fight this, not extend it.
- **`Contact.customFields` (JSONB) + `Integration.config` (JSONB)**: the Typeform handler pattern (`typeform.handler.ts`) proves out contact-creation-from-webhook without any new entities — form list lives in `integration.config.typeformForms[]`, submission metadata lives in `contact.customFields`. Directly reusable for Lead Ads.
- **`ContactSource.FACEBOOK`** already exists in `contact.entity.ts` — no enum change needed.
- **Webinar Lead Funnel Phase 1 status: not implemented.** As of this design, `Funnel`/`FunnelEnrollment` entities, `LandingPage.funnelId`, and any flow-arming entry point on `WhatsAppService` do not exist anywhere in the codebase (verified: no matches for `FunnelEnrollment`, `funnelId`, or `armFlowForFunnelEnrollment` outside the Phase 1 design doc itself). This is the one place Phase 2 has a real, unresolved dependency on Phase 1 — see "Funnel Enrollment (blocked on Phase 1)" below.

## Key Decision: reuse the existing `facebook` API provider, not a new `IntegrationType`

The Phase 1 spec's Phase-2 sketch proposed `IntegrationType.FACEBOOK_LEAD_ADS` with its own OAuth flow. Building this out revealed that's the wrong shape for *this* codebase specifically: Messenger/IG DM support (`meta-messaging/`) already stood up a complete Facebook Login for Business flow under `IntegrationType.API` + `config.provider = 'facebook'`, already requesting `leads_retrieval`, already resolving a Page access token and storing it on the integration row (`ensurePageAccessToken`-equivalent logic in `IntegrationsService`), already receiving webhooks on a shared per-Page URL.

Standing up a second, parallel `IntegrationType.FACEBOOK_LEAD_ADS` with its own OAuth config, its own webhook route, and its own "connect Facebook" UI card would mean a workspace connects Facebook *twice* — once for messaging, once for lead ads — with two separate token lifecycles for the same Page. That's confusing for the user and doubles the OAuth surface for no benefit. Instead:

- **No new `IntegrationType`.** Lead Ads forms hang off the *same* `facebook`-provider `Integration` row used for Messenger, keyed by `config.pageId` (already resolved during the existing Facebook connect flow).
- **No new OAuth flow.** `OAuthService`'s existing `facebook` provider config is reused unmodified (it already had `leads_retrieval` added).
- **No new webhook endpoint.** `leadgen` deliveries are intercepted inside the existing `MetaMessagingController` webhook handlers before/alongside the messaging dispatch, fire-and-forget so the Graph API round-trip to fetch the lead never delays Meta's ack of the messaging webhook.
- **No new entities, no migration.** Connected forms live in `integration.config.metaLeadForms[]` (mirrors `typeformForms[]`); a form maps to a pipeline/stage and an optional WhatsApp welcome, exactly like Typeform's per-form config.

This means "connect Facebook" in the integrations UI is a single OAuth click that unlocks both Messenger and Lead Ads for that Page — the Lead Ads panel simply appears once a Page is connected.

## What's Being Added

### 1. `MetaLeadsService` (`backend/src/integrations/meta-leads/meta-leads.service.ts`)

Modeled directly on `typeform.handler.ts`'s webhook → Contact flow, adapted for Lead Ads' two-step delivery (webhook carries only an ID; the actual answers are a separate Graph API call):

- `processWebhookPayload(payload)`: entry point called from `MetaMessagingController`'s webhook handlers. Walks `entry[].changes[]`, picks out `field === 'leadgen'` entries, dispatches each to `handleLeadgenChange`. Errors are caught per-change so one bad delivery doesn't drop the rest of the batch.
- `handleLeadgenChange(value, entry)`:
  1. De-dupe: an in-memory `recentLeadIds` map (same pattern as `MetaMessagingService.recentMessageIds`) closes the race where Meta retries a webhook delivery near-simultaneously, before any `await` gives a second concurrent delivery a chance to slip past a DB-only check. A DB check (`Contact.customFields->>'metaLeadgenId'`) then also protects against the same lead ID being redelivered in a *later* process/deploy.
  2. Resolve the owning `Integration` by `page_id` matching `config.pageId` on a `facebook`-provider `API` integration; resolve/refresh a Page access token the same way `IntegrationsService` does for Messenger.
  3. `GET /{leadgen_id}` on the Graph API with the Page token to fetch `field_data` (the actual form answers) plus ad/campaign metadata.
  4. Map `field_data` (array of `{name, values}`) to contact fields — standard names (`email`, `first_name`, `last_name`, `full_name`, `phone_number`, `company_name`, `job_title`) map directly; everything else lands in `customFields`. Name fallbacks mirror Typeform's: split a full name, derive from email local-part, default to `"Lead"` if nothing else is available.
  5. Look up the form's config (`integration.config.metaLeadForms[]`, keyed by `formId`) for pipeline/stage/WhatsApp overrides, falling back to the workspace default pipeline.
  6. Create the `Contact` (`source: FACEBOOK`, `status: LEAD`), stamping `customFields.metaLeadgenId` (dedup key) and `customFields.metaLeadMetadata` (form/page/ad/campaign context, mirrors Typeform's `typeformMetadata`).
  7. Optionally send a WhatsApp welcome (template or free text, same two-mode logic as Typeform's `maybeSendWhatsAppWelcome`).
  8. Create an in-app notification (`NotificationType.LEAD`).

### 2. Webhook wiring (`meta-messaging.controller.ts`, `meta-messaging.module.ts`)

`MetaMessagingModule` imports `MetaLeadsModule`; `MetaMessagingController` injects `MetaLeadsService` and, in both `POST webhook/:provider` and `POST webhook/:provider/:integrationId`, fires `metaLeadsService.processWebhookPayload(payload)` **without awaiting** (`.catch()`-guarded, logged on failure) before/alongside the existing `metaMessagingService.handle*Webhook(...)` call. Meta's webhook ack has to be fast; the leadgen→Graph-API round trip must never block it.

### 3. `MetaLeadsController` (`backend/src/integrations/meta-leads/meta-leads.controller.ts`)

`/integrations/meta-leads/:id/...`, JWT + workspace guarded:
- `GET available-forms` — lists the connected Page's Lead Ads forms via Graph API (`{pageId}/leadgen_forms`).
- `POST subscribe` — subscribes the Page to the `leadgen` webhook field (`{pageId}/subscribed_apps?subscribed_fields=leadgen`). Separate from Page connection itself since a workspace may want to gate this on being ready for real leads.
- `GET forms` / `POST forms` / `PATCH forms/:formId` / `DELETE forms/:formId` — CRUD over `integration.config.metaLeadForms[]`, same shape as the Typeform form-management endpoints.

### 4. Frontend (`integrations/page.tsx`)

A "Lead Ads Forms" panel appears under the existing Facebook management screen once a Page is connected: "Subscribe Page" button, "Add Form" (picks from `available-forms`), connected-forms list with remove, and an App-Review notice banner (see "Out of Scope" below). No separate "Connect Facebook for Lead Ads" card — it rides the existing Facebook OAuth card (`oauthProvider: 'facebook'`), whose description already mentions "sync leads from Lead Ads automatically."

### 5. `funnelId` field — reserved, not wired up

`MetaLeadFormConfig` gains an optional `funnelId?: string`, mirroring `LandingPage.funnelId` from the Phase 1 design so a form's config schema won't need a breaking change once Phase 1 lands. **It is a documented no-op today**: `handleLeadgenChange` creates the Contact normally and, if `formConfig.funnelId` is set, logs a clear warning (`"has funnelId=... configured, but funnel enrollment is not wired up yet"`) instead of silently dropping it. See "Funnel Enrollment (blocked on Phase 1)" below for the exact follow-up.

## Funnel Enrollment (blocked on Phase 1)

The parent design's goal for this phase was "feeding the same `armFlowForFunnelEnrollment` entry point... as a second capture source." That entry point, and everything it depends on (`Funnel`, `FunnelEnrollment` entities, `LandingPage.funnelId`, the migration), **do not exist in this codebase as of this design** — Phase 1 is described but not built. Guessing at an unbuilt interface's exact name/signature and wiring a call to it would either not compile or silently no-op forever if the real implementation lands with different naming — worse than not wiring it at all.

**What to do once Phase 1 lands**, in `MetaLeadsService.handleLeadgenChange`, right after the WhatsApp-welcome call (marked with a `TODO(webinar-lead-funnel Phase 1)` comment at that exact line):

```ts
if (formConfig?.funnelId) {
  const enrollment = await funnelsService.createEnrollment(formConfig.funnelId, contact.id);
  await whatsAppService.armFlowForFunnelEnrollment(workspaceId, waId, flow.id, enrollment.id);
}
```
(Exact method/service names to be confirmed against Phase 1's actual implementation — this mirrors what `landing-pages.service.ts#submitPublic` does per the Phase 1 spec.) Replace `maybeLogPendingFunnelEnrollment` with this call; delete the warning-log method.

## Data Flow Example

1. Workspace connects Facebook once (existing OAuth flow, `leads_retrieval` scope now included) → picks a Page → `integration.config.pageId` set.
2. Admin clicks "Subscribe Page" → Page subscribed to the `leadgen` webhook field.
3. Admin clicks "Add Form" → picks a Lead Ads form from the Page → `integration.config.metaLeadForms[]` gets a new entry (optionally with `pipelineId`/`whatsApp`/`funnelId`).
4. Someone fills out the Instant Form inside the Facebook/Instagram app → Meta sends `POST /integrations/meta-messaging/webhook/facebook` with `entry[].changes[].field = 'leadgen'`, `value.leadgen_id`.
5. `MetaLeadsService.processWebhookPayload` fires in the background → `GET /{leadgen_id}` with the Page token → `field_data` mapped to a `Contact` (`source: FACEBOOK`) → optional WhatsApp welcome sent → notification created.
6. **Today:** if the form has a `funnelId` configured, a warning is logged and nothing further happens — the contact still lands in the CRM/pipeline correctly. **Once Phase 1 lands:** step 5 additionally creates a `FunnelEnrollment` and arms the funnel's first step.

## Testing

- Unit (`meta-leads.service.spec.ts`, already passing): field-mapping (standard names + custom fields), name fallbacks (full name split, email-derived, default), `handleLeadgenChange` end-to-end (fetch → create contact → notify), duplicate-processing guards (both the in-memory same-process guard and the DB-level cross-process guard), unknown-page no-op, form config CRUD (add/update/remove, including `funnelId` round-tripping).
- Added for this task: a test asserting that a form with `funnelId` set creates the contact normally and logs the pending-enrollment warning rather than throwing or silently dropping the field.
- Manual (cannot be automated — needs a live Meta App in dev mode with the workspace's own account as an admin/tester): connect Facebook, subscribe a Page, add a real Lead Ads form, submit the Instant Form as a Page admin, confirm a Contact appears with the right pipeline/stage.

## Out of Scope

- **Meta App Review.** `leads_retrieval` requires Advanced Access (App Review) before any lead from a **non-admin/tester** flows in — this is a real external approval process (days to weeks) that cannot be shortcut by code. Until approved, the feature works end-to-end for the app's own admins/testers in Meta's dev mode only. The frontend panel surfaces this explicitly ("Requires Meta's `leads_retrieval` permission (Advanced Access / App Review)...").
- **Funnel enrollment wiring** — blocked on Phase 1 landing, see above. The `funnelId` field and its no-op logging are the full extent of Phase 2's involvement until then.
- **Per-form pipeline/WhatsApp/funnel config UI** — the "Add Form" picker only sets `formId`/`name` today (matches Typeform's minimal add-form UI); deeper per-form config is settable via `PATCH forms/:formId` but has no dedicated UI yet. Same YAGNI call Typeform already made.
- **Instagram-native Lead Ads** — Lead Ads forms are a Page-level (Facebook) product even when the ad runs on Instagram; no separate Instagram OAuth/webhook path is needed here (the existing `instagram` OAuth provider is for IG DMs, unrelated).
- **Lead deduplication against existing contacts by phone/email beyond the `metaLeadgenId` dedup key** — same scope boundary Typeform draws; a person submitting the same form twice creates two contacts today, matching existing Typeform behavior.
