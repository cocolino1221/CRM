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
| `viewCount` | int default 0 | total views (raw) |
| `uniqueViewCount` | int default 0 | deduped views (see Better view tracking) |
| `submissionCount` | int default 0 | analytics |
| `lastSubmittedAt` | timestamptz nullable | analytics |
| `publishedAt` | timestamptz nullable | set when status first → `active` |
| `seo` | jsonb nullable | `{ title?, description?, ogImage? }` |
| `experimentId` | varchar nullable | A/B hook (no split logic yet) |
| `variantGroup` | varchar nullable | A/B hook (e.g. 'A' / 'B') |
| `createdById` | uuid | owner (FK `User`) |

`content` also carries an optional `themePreset` key (see Theme presets).

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
  - `GET /landing-pages/public/:slug` — return active page, bump views
  - `POST /landing-pages/public/:slug/submit` — native capture only
- Protected extra:
  - `POST /landing-pages/:id/duplicate` — deep-copy a page (new id + new slug
    `{slug}-copy-{nanoid}`, status reset to `draft`, counters zeroed,
    `publishedAt` null). See Additions §7.

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

## Additions before implementation

### High priority

**1. UTM tracking.** The public page reads `utm_source`, `utm_medium`,
`utm_campaign`, `utm_term`, `utm_content` (plus `referrer`) from the query
string. On native submit they are passed in the request body and persisted in
the existing `FormSubmission.trackingData` jsonb (no schema change needed) and
mirrored onto the created contact's metadata. For Typeform embed, UTMs are
forwarded as hidden-field query params on the iframe `src` so they flow through
the existing Typeform webhook.

**2. SEO metadata.** `seo` jsonb (`title`, `description`, `ogImage`). The public
`app/p/[slug]/page.tsx` exports `generateMetadata` using these (falling back to
hero title / first benefit / hero image). Editor exposes the three fields under
a "SEO" sub-section.

**3. publishedAt.** Set to `now()` the first time `status` transitions to
`active`; preserved on later edits; not cleared when archived (records first
publish). Shown in the dashboard list.

### Medium priority

**4. Better view tracking.** Keep raw `viewCount` (every GET) and add
`uniqueViewCount`. Uniqueness is deduped per visitor per UTC day using a hash of
`IP + User-Agent + slug + date`, tracked via a short-lived signed cookie set on
first view (cookie absent → count unique + set cookie). Bot user-agents are
skipped for unique counts. Conversion rate uses `uniqueViewCount` when > 0.

**5. Theme presets.** A small fixed catalog of named theme objects (e.g.
"Clean Light", "Bold Dark", "Brand Accent") defined in code. `content.themePreset`
stores the chosen preset key; selecting one fills the hero theme fields, which
remain individually editable afterward (preset = starting point, not a lock).

### Low priority

**6. A/B testing hooks.** `experimentId` + `variantGroup` columns are stored and
surfaced in the public page response and submission tracking data, so an
external experiment tool can read/attribute them. No traffic-splitting or
variant-serving logic is built now — these are plumbing hooks only.

**7. Duplication endpoint.** `POST /landing-pages/:id/duplicate` deep-copies
`content`, `captureType`, `formId`/`typeformConfig`, `postSubmit`, `seo`, theme;
generates a new unique slug; resets `status` to `draft`, zeroes all counters,
nulls `publishedAt`. Dashboard list gets a "Duplicate" action.

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
- Missing/garbage UTM params → stored as-is if present, omitted if absent;
  never blocks submit.
- Page refresh → bumps raw `viewCount` but not `uniqueViewCount` (cookie set).
- Duplicate of a page whose `formId` was deleted → copy still created; render
  shows "form unavailable" like the original.

## Testing

- Native submit end-to-end: lead created with `source = LANDING_PAGE` +
  WhatsApp welcome attempted.
- Public render of a `draft` page returns 404.
- Typeform embed renders the iframe for the configured form ID, with UTM params
  forwarded on the iframe `src`.
- Duplicate slug rejected with 400.
- UTM params from query string land in `FormSubmission.trackingData` on native
  submit.
- Two GETs from the same visitor in a day → `viewCount` +2, `uniqueViewCount` +1.
- First `active` transition stamps `publishedAt`; re-activating later keeps it.
- `generateMetadata` emits the configured SEO title/description/ogImage.
- Duplicate endpoint produces a `draft` copy with a new slug and zeroed counters.

## Out of scope

- Drag-and-drop block builder.
- Custom domains / DNS.
- Multi-step funnels (the entity is designed to extend toward this later).
- Workflow/automation triggers on submit (not requested).
- Insights/analytics dashboards beyond view/submission counters.
- A/B traffic splitting / variant serving (only storage hooks now — §6).
- Custom theme-preset authoring (presets are a fixed code catalog — §5).
