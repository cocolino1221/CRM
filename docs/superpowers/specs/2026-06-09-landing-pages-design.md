# Landing Pages — Design Spec

**Date:** 2026-06-09
**Status:** Approved (pending implementation plan)

## Goal

Add a Landing Pages feature to EasyTeam CRM: public, hosted marketing pages
(hero + benefits + a lead-capture block) that feed leads into the CRM. The
capture block reuses the existing forms system (native form) or embeds a
Typeform. This is the marketing "frame" around a form — not a free-form
drag-and-drop builder.

## Decisions (locked)

- **Layout:** fixed editable sections (hero, benefits, capture block). No
  drag-and-drop block builder.
- **Capture source:** switch between **native form** (reference an existing
  `Form`) or **Typeform** (inline iframe embed).
- **Data model:** new `LandingPage` entity in its own module; reuses the forms
  submit/validation/contact-creation logic for the native path. (Chosen over
  extending `Form`, to keep concepts separate and extensible toward funnels.)
- **Public URL:** slug on the existing domain — `/p/{slug}`. No custom domains
  in this scope.
- **Post-submit (native only):** create lead with `source = LANDING_PAGE`,
  show success message / redirect, optionally auto-send a WhatsApp welcome.
- **Post-submit (typeform):** handled entirely by the existing Typeform webhook
  integration (answers → `contact.customFields`). The landing page only renders
  the embed.

## Capture-path asymmetry (important)

| Concern | Native form | Typeform embed |
|---|---|---|
| Where submit happens | our `/submit` endpoint | inside Typeform iframe |
| Lead creation | our service (`source = LANDING_PAGE`) | existing Typeform webhook |
| Success / redirect | controlled by landing page | Typeform's own thank-you |
| Auto WhatsApp | yes (if phone + active integration) | no (rides Typeform webhook flow) |

The landing page is the marketing frame for both; full post-submit control
exists only for the native path.

## Architecture

### Backend — new module `backend/src/landing-pages/`

Follows the existing `forms` module pattern (entity, service, controller, DTOs,
module).

**Entity `landing_pages`** (extends `WorkspaceEntity`):

| Field | Type | Purpose |
|---|---|---|
| `name` | varchar(255) | internal name |
| `slug` | varchar(100) unique, indexed | public URL `/p/{slug}` |
| `status` | enum `draft` / `active` / `archived` | publishing state |
| `content` | jsonb | hero (logo, title, subtitle, image/video, accentColor), `benefits: string[]`, theme |
| `captureType` | enum `native` / `typeform` | capture source |
| `formId` | uuid nullable | FK to `Form` (when native) |
| `typeformConfig` | jsonb nullable | `{ formId, embedType: 'inline' }` (when typeform) |
| `postSubmit` | jsonb | `{ successMessage?, redirectUrl?, whatsapp?: { enabled, message } }` — native only |
| `viewCount` | int default 0 | analytics |
| `submissionCount` | int default 0 | analytics |
| `lastSubmittedAt` | timestamptz nullable | analytics |
| `createdById` | uuid | owner (FK `User`) |

`conversionRate` getter = `submissionCount / viewCount * 100`.

**Indexes:** unique on `slug`; composite `(workspaceId, status)`.

**Migration:** new TypeORM migration creating the table + indexes. Also adds a
new `LANDING_PAGE = 'landing_page'` value to the `ContactSource` enum (it does
not exist yet) — the enum column migration must include it.

**Endpoints:**

- Protected (JWT):
  - `POST /landing-pages`
  - `GET /landing-pages`
  - `GET /landing-pages/:id`
  - `PATCH /landing-pages/:id`
  - `DELETE /landing-pages/:id`
- Public (`@Public`):
  - `GET /landing-pages/public/:slug` — return active page, bump `viewCount`
  - `POST /landing-pages/public/:slug/submit` — native capture only

**Submit flow (native):** validate against the referenced `Form` fields
(reuse forms validation), create `FormSubmission`, create/link a `Contact` with
`source = LANDING_PAGE`, bump counters, then attempt WhatsApp welcome (guarded),
return success/redirect info. Reuse forms' contact-creation logic rather than
duplicating it (extract a shared helper if needed).

**WhatsApp welcome (native):** after lead creation, if the submission has a
phone value AND the workspace has a non-disabled WhatsApp integration AND
`postSubmit.whatsapp.enabled`, send the configured message via the existing
WhatsApp service. Wrapped in try/catch — a WhatsApp failure never fails the
submit; it is logged.

### Frontend

**Dashboard** (`app/(dashboard)/landing-pages/`):
- list page (`page.tsx`) — cards with status, views, submissions, conversion
- editor (`[id]/edit/page.tsx`) — live preview side-by-side, following the
  forms builder pattern. Sections: Hero, Benefits, Capture block (native/
  typeform switch), Post-submit (native only), Settings (slug, status).
- new (`new/page.tsx`)
- Image upload reuses `upload.service`.

**Public render** (`app/p/[slug]/page.tsx`):
- server-fetches `GET /landing-pages/public/:slug` (bumps view)
- renders hero + benefits + capture block
- native → inline form posting to `/landing-pages/public/:slug/submit`
- typeform → inline `<iframe>` embed

## Edge cases (QA)

- Duplicate slug → 400 (mirror forms behavior); slug auto-generated from name.
- `draft` / `archived` page → 404 on public route.
- Native submission without a phone → WhatsApp step skipped silently.
- Typeform capture without a form ID → editor blocks saving as `active`.
- Referenced `formId` deleted → public render shows "form unavailable" instead
  of crashing.
- Submission without email → lead created only when an email field exists
  (same rule as forms).
- WhatsApp send failure → caught, logged, submit still succeeds.

## Testing

- Native submit end-to-end: lead created with `source = LANDING_PAGE` +
  WhatsApp welcome attempted.
- Public render of a `draft` page returns 404.
- Typeform embed renders the iframe for the configured form ID.
- Duplicate slug rejected with 400.

## Out of scope

- Drag-and-drop block builder.
- Custom domains / DNS.
- Multi-step funnels (the entity is designed to extend toward this later).
- Workflow/automation triggers on submit (not requested).
- Insights/analytics dashboards beyond view/submission counters.
