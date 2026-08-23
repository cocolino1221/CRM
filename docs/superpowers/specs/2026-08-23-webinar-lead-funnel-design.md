# Webinar Lead Funnel — Design Spec

**Date:** 2026-08-23
**Backend:** NestJS (`backend/`)
**Frontend:** Next.js (`frontend/app/(dashboard)/`)

## Goal

Capture leads from a Meta ad campaign for an upcoming webinar, get them into the CRM, and automatically run them through a short, reusable, date-anchored funnel: instant WhatsApp/email confirmation → reminder(s) timed off the webinar date → a branch on whether they attended (manual mark for now) → a closing step. Phase 1 uses the existing landing-page feature as the lead-capture surface; Phase 2 (separate, deferred) adds native Meta Lead Ads ("Instant Forms") as a second capture source feeding the same funnel.

## Current State (what already exists, reused as-is)

- **Landing pages**: entity/service/controller (`backend/src/landing-pages/`), public `/p/:slug` page, `submitPublic` (`landing-pages.service.ts:183`) creates a `Contact` (`source: LANDING_PAGE`) with UTM tracking captured frontend-side. Already has a bolted-on WhatsApp welcome hook, `maybeSendWhatsAppWelcome` (`landing-pages.service.ts:235`).
- **WhatsApp `conversationFlows` engine** (`whatsapp.service.ts`): flows with `trigger` (`first_message | keyword | after_auto_send`), ordered `steps[]` (message/template/interactive, buttons, `delayMs`), and a **durable, Bull-backed `timeoutBranch`** mechanism — `armFollowupTimeout` (4146), `armAfterAutoSendFlow` (4214), reply-content branching via `checkFlowTrigger` (4243), executed by `WhatsAppFollowupProcessor` off the `CHECK_FOLLOWUP_REPLY` queue job. This survives Fly restarts (Bull/Redis-backed, not `setTimeout`). This is the engine to extend, not replace.
- **`EmailService`** (`backend/src/email/email.service.ts`), already used by `email-campaigns.service.ts` for single-blast sends — reusable for individual funnel email steps.
- **WhatsApp "groups"**: confirmed dead code — the Cloud API has no group creation/messaging capability at all. Not part of this design; all WhatsApp touchpoints are 1:1 templated sends via the existing flow engine.
- **Meta Lead Ads ingestion**: does not exist anywhere in the codebase (no `IntegrationType`, handler, or webhook). Phase 2, see below.

## What's Being Added — Phase 1

### 1. Extend the `conversationFlows` step schema
- New step `type: 'email'` with `{ subject, body }`, dispatched via `EmailService` instead of a WhatsApp send.
- New flow `trigger: 'landing_page_submit'`, alongside the existing three.
- New per-step delay mode `anchorOffset?: { relation: 'before' | 'after', minutes: number }`, computed against the owning `Funnel.anchorDate` instead of the existing relative `delayMs`/`timeoutBranch`. A step uses exactly one delay mode — validate that `anchorOffset` and `timeoutBranch`/`delayMs` aren't both set.
- `armFollowupTimeout` / `WhatsAppFollowupProcessor` gain a second fire-time computation branch (`anchorDate ± anchorOffset` vs. today's relative delay) but reuse the same Bull job + no-op-if-state-moved-on logic already in place. The processor dispatches to `EmailService.send(...)` when `step.type === 'email'`.

### 2. New lightweight `Funnel` + `FunnelEnrollment` entities
Purpose: a reusable template independent of any single WhatsApp flow, a place to hold the run's `anchorDate`, a link target for the landing page, and per-contact progress for reporting.
- `Funnel`: `id, workspaceId, name, status (draft/active/archived), integrationId, flowId` (flows live in `integration.config.conversationFlows`, so a funnel just points at one by id), `anchorDate` (nullable, editable per run — e.g. reset it each time you reuse the template for the next webinar).
- `FunnelEnrollment`: `id, funnelId, contactId, waId, status (active/completed/exited), currentStepId, attendedManual (boolean, nullable), enrolledAt`.
- One new migration.

### 3. Landing page → funnel link + auto-enroll
- Add nullable `funnelId` to `LandingPage` (new migration), set from the dashboard editor.
- In `submitPublic`, after the existing `Contact` creation, if `page.funnelId` is set: create a `FunnelEnrollment`, then call a new `whatsappService.armFlowForFunnelEnrollment(workspaceId, waId, flowId, enrollmentId)` — a new entry point parallel to `armAfterAutoSendFlow`, but arming a flow directly by `flowId` instead of matching an `autoSendRuleId`, since there's no inbound WhatsApp message here to match against.

### 4. Manual "mark attended" → branch signal
- Step schema gains `condition?: { basedOn: 'attended', trueNextStepId, falseNextStepId }` — the single branch point this funnel needs.
- New endpoint `PATCH /funnels/enrollments/:id/attended` (mirrors the existing `setPreluat` pattern in `contacts.service.ts`) sets `attendedManual` and, if the enrollment is currently parked at a step with this `condition`, routes to the matching `nextStepId` by reusing the same dispatch path `checkFlowTrigger` uses for a matched reply — just triggered manually instead of by an inbound message.
- Contacts who are never marked attended fall through via a plain `timeoutBranch`-style grace-period timeout to the no-show step (no new mechanism needed).

### 5. Dashboard UI
- Funnel editor reuses the existing WhatsApp flow-step editor (`whatsapp/page.tsx` ~6500-6600) as its base, extended with: the new email step type, anchor-offset delay inputs (before/after + unit), and the attended-condition branch picker. A thin `Funnel` wrapper screen sets `anchorDate` and links a landing page.
- Enrollments view: table of contacts in a funnel run, current step, attended toggle, timestamps.

## Data Flow Example

1. Meta ad → click → `/p/webinar-slug` → form submit → `submitPublic` creates `Contact` + `FunnelEnrollment` → `armFlowForFunnelEnrollment` sends step 1 (WhatsApp confirmation template) instantly.
2. Step 2 has `anchorOffset: { before, 1440 }` (24h before the webinar) → Bull job scheduled for `anchorDate - 24h` → fires → sends the WhatsApp reminder; a parallel email step is scheduled the same way.
3. Step 3 (post-anchorDate) has `condition: attended` → waits; an admin marks a contact attended in the enrollments view → routes to "thanks + offer"; contacts never marked route, after a grace-period timeout, to "sorry we missed you / replay."

## Testing

- Unit: anchor-offset fire-time computation (before/after, various units).
- Unit: `armFlowForFunnelEnrollment` arms correctly without a prior inbound message.
- Unit: manual attended-mark routes to the correct branch step; no-ops if the enrollment is already completed/exited.
- Integration: full landing-page-submit → enrollment → step-1 send.
- Manual: verify an anchor-scheduled step survives a Fly redeploy (same check as the existing follow-up sequence feature).

## Out of Scope (Phase 1 / YAGNI)

- Email open/click tracking — no SendGrid webhook ingestion exists in this repo; branching relies on manual "mark attended" plus existing WhatsApp reply/button matching only.
- True WhatsApp "groups" — not possible via the Cloud API; not attempted.
- Multi-branch (>2-way) conditions or a general workflow DSL — only the single attended/no-show branch point.
- Per-contact timezone-aware anchor scheduling — `anchorDate` is workspace-local.
- Native Meta Lead Ads ingestion — **Phase 2**, below.

## Phase 2 — Meta (Facebook/Instagram) Lead Ads ingestion (separate, deferred)

Goal: let leads also enter via Meta's native in-ad "Instant Forms," feeding the same `armFlowForFunnelEnrollment` entry point built in Phase 1, as a second capture source alongside the landing page.

Scope:
- New `IntegrationType.FACEBOOK_LEAD_ADS` in `integration.entity.ts`, registered in `integration.registry.ts`.
- OAuth flow via `OAuthService`, Facebook Login for Business, `leads_retrieval` + `pages_manage_ads` scopes.
- New handler `backend/src/integrations/handlers/facebook-lead-ads.handler.ts`, modeled on `typeform.handler.ts`: subscribes to the Graph API `leadgen` webhook field on the connected Page, receives `{leadgen_id, form_id, page_id}`, fetches full field data via `GET /{leadgen_id}`, maps to a `Contact` (`source: META_LEAD_ADS`), and enrolls into the funnel mapped to that `form_id` (new `integration.config.metaLeadForms[]`, mirroring the existing `typeformForms[]` pattern).
- Frontend: form-to-funnel mapping UI in the integrations page, modeled on the existing Typeform form mapping UI.
- **External dependency, flag clearly**: this requires Meta's `leads_retrieval` App Review approval before it works for anyone beyond the app's own admins/testers — real-world review turnaround (days to weeks), not something code can shortcut.

This phase should be researched and planned independently since it's a new OAuth/webhook integration surface.
