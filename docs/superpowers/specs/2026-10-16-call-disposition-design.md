# Call Disposition — Design

**Date:** 2026-10-16
**Status:** Design, revised after builder check (pending approval)
**Author:** Constantin Pristavita (with Claude)

## Intent

A caller finishes a call and moves to the next contact. Nothing captures what
happened. The outcome lives in the caller's head until it reaches a
spreadsheet, or it never arrives — which is exactly how the `fisa apeluri`
sheet came to hold a thousand call notes the CRM had never seen.

This builds the moment of capture: a dialog that opens the instant a call
ends, takes ten seconds to fill, and turns one answer into the right
follow-up action.

**A warning this document earned the hard way.** The first draft assumed the
reporting layer was written and merely starved of input. A builder check
proved otherwise: `callsMade` can never be anything but zero, the follow-up
fields are write-only, and the `activities` module is a stub. Capture alone
would have produced a dashboard that looks populated and lies. The repairs
below are therefore not optional extras — they are what makes capture mean
anything.

## Goals

1. Capture the outcome of every call in under ten seconds, with the keyboard.
2. Turn the outcome into the next action automatically — never a note the
   caller must act on later.
3. Make the numbers real: `callsMade` must actually count calls, and
   follow-ups must appear somewhere a human looks.
4. Work for phone calls, on both live clients.

## Non-goals

- Call recording or transcription.
- Dialling from the CRM for ordinary phone calls.
- The public booking page — separate work, with its own design.
- The `mobile/` client. Dead since April 2026 (0 commits in 3 months).
- Changing `ActivityOutcome`'s existing values.

## Anti-goals

- **A dialog the caller dismisses.** Slow or blocking means reflexive
  closing, and the data becomes worse than none because the reports lie.
- **Double entry.** One answer, one submit, all consequences.
- **Lost work on a flaky connection.** A caller on a phone in a car must not
  lose the disposition because the request failed.
- **Write-only data.** Nothing this feature records may land in a column no
  surface reads. That failure already exists here and must not be extended.

## Grounding facts (verified, after the builder check corrected the first draft)

**What exists and works:**

- `ActivityOutcome` has `successful`, `failed`, `no_answer`, `voicemail`,
  `busy`, `scheduled`, `cancelled`, `rescheduled`, `pending`.
- Activity has `outcome`, `followUpRequired`, `followUpDate`,
  `followUpNotes`, `duration`, `occurredAt`, and an `isOverdue()` helper.
- `push-notification.service.ts` → `sendPushToUser()`, APNs + Firebase,
  quiet hours.
- `task.entity.ts` has `title`, `description`, `type`, `status`, `priority`,
  `dueDate`, `assigneeId`, `contactId`.
- `analytics.service.ts` has `getDailyKPIs()`, `generateEODReport()`,
  `getTeamPerformance()`, `getLeaderboard()`.
- `whatsapp.service.ts` → `logCallActivity()` (~line 1424) persists a finished
  WhatsApp call and sets `outcome` from `CALL_STATUS_OUTCOMES`.

**What is broken or missing — each one changes the work:**

1. **`activities.service.ts` is an 11-line stub.** It returns
   `{ message: 'Get all activities', data: [] }`. No repository, no
   `TypeOrmModule.forFeature`, no guards, no workspace scoping, no DTOs —
   unlike every other module. It must be *built*, not extended.
2. **Nothing in the backend creates `ActivityType.CALL`.** Zero occurrences
   outside the entity. `getDailyKPIs()` computes
   `callsMade = activities.filter(a => a.type === 'call')`, so **`callsMade`
   is permanently 0**.
3. **WhatsApp calls are stored as `ActivityType.WHATSAPP_MESSAGE`** with
   `metadata.messageType = 'call'` — deliberately, so the chat UI renders
   them inline.
4. **Nothing reads `followUpRequired` / `followUpDate` / `followUpNotes`.**
   The only match outside the entity is the migration that created the
   columns. They are write-only today.
5. **`POST /integrations/whatsapp/calls/:callId/log` returns
   `{ success: true }`** — no activity id, so a client cannot address the row
   it must update.
6. **`CallManager.finalizeCall()` resets state ~2500 ms after `'ended'`**
   (`frontend/lib/call-manager.ts` ~383-409). Context must be latched before.
7. **Two live clients**, which duplicate rather than share the call UI:
   `frontend/` (45 commits/3mo) and `mobile-rn/` (16 commits/3mo, with its
   own `call-store.ts`, `CallModal.tsx`, `MiniCallBar.tsx`).
8. **`getDailyKPIs()` is workspace-scoped with no per-user breakdown**, and
   has no `conversations` or `bookings` metric.
9. **`GET /analytics/eod-report` is `@Roles('admin','manager')`.**
10. **`getDailyKPIs` buckets by `createdAt`, not `occurredAt`** — a manually
    logged call from yesterday lands in today's numbers.
11. **The WhatsApp send path has no 24-hour session-window gating.**

## The design

### Part 0 — Make `activities` a real module

Prerequisite for everything else. Repository wiring, `JwtAuthGuard` +
`WorkspaceGuard` + `RolesGuard`, `workspaceId` scoping on every query, DTOs
with validation, following the shape of `tasks.controller.ts`.

Roles permitted to post a disposition: `admin`, `manager`, `sales_rep`,
`closer`, `setter`, `caller`. A user may disposition an activity they own or
one for a contact they are assigned; managers and admins, any.

### Part 1 — Trigger

Two entry points, because callers use phones:

1. **Automatic.** The call manager reaches `'ended'` → dialog opens with
   contact and duration prefilled. The handler must capture context
   **synchronously on the transition**, before the 2500 ms reset.
2. **Manual.** A "Log call" button on the lead detail surface, for ordinary
   phone calls — which is how most calling here actually happens.

Both clients get both entry points. On web the surface is
`frontend/app/(dashboard)/leads/`; on React Native it is `LeadDetailScreen`
and `WhatsAppInboxScreen`.

### Part 2 — The dialog

One question, one click or keystroke:

| Outcome | Key | `ActivityOutcome` | Then |
|---|---|---|---|
| A răspuns — interesat | `1` | `successful` | Amount + optional booking link |
| A răspuns — nu acum | `2` | `successful` | Follow-up date, default +3 days |
| A răspuns — refuz | `3` | `failed` | Reason, no follow-up |
| N-a răspuns | `4` | `no_answer` | Callback: 1h / today at X / tomorrow |
| Mesagerie vocală | `5` | `voicemail` | Same callback choices |
| Ocupat | `6` | `busy` | Callback +1h, default |
| Programat | `7` | `scheduled` | Booking link, or pick a slot |

Then a free-text note and submit. Nothing else. Seven outcomes, not more —
longer lists get the first option clicked.

Reusing the existing enum means no migration and the analytics that already
group by `outcome` work on day one.

### Part 3 — What a disposition writes

```
POST /api/v1/activities/:id/disposition    (existing activity — the normal case)
POST /api/v1/activities/disposition        (manual log — creates the activity first)
```

```ts
{
  outcome: ActivityOutcome;
  notes?: string;
  followUp?: { at: string; title?: string };   // one concept, see below
  deal?: { value: number; currency: string };
  bookingSent?: boolean;
}
```

One transaction:

1. Set `outcome` and `followUpNotes` on the activity.
2. `followUp` → set `followUpRequired` / `followUpDate` **and create a
   `Task`** (`type = CALL`, assignee = caller, `contactId`, `dueDate`).
3. `deal` → create a `Deal` for the contact, owner = caller, amount only.
   Stage from the workspace default; the caller is on the phone, not filling
   a CRM form.
4. Update `contact.lastContactedAt` — the EOD report derives
   `followUpsNeeded` from it.

The transaction matters: a disposition that creates a task but fails to set
the outcome leaves a caller with a reminder for a call the reports think
never happened.

### Part 4 — Repair the reporting layer

Without these, capture feeds nothing:

- **`callsMade` must count WhatsApp calls.** Change the filter to include
  `type === 'whatsapp_message' && metadata.messageType === 'call'` alongside
  `type === 'call'`. Otherwise the headline KPI stays zero forever.
- **Bucket by `occurredAt`, not `createdAt`**, so a manually logged call
  lands on the day it happened.
- **A follow-ups queue** — the surface that makes `followUpDate` readable.
  Creating a Task covers the reminder; the queue covers the overview.
- **Per-user KPIs.** `getDailyKPIs()` gains an optional `userId`. This is new
  analytics work, not surfacing.
- **Open the EOD report to callers**, scoped to their own numbers.

### Part 5 — Reminders fire

Nothing today notices a due Task. A cron poll over `tasks.dueDate` →
`sendPushToUser(assigneeId)`. Chosen over BullMQ delayed jobs: no new Redis
coupling, and cancel-on-complete is a status check rather than job
bookkeeping.

### Part 6 — Never lose a disposition

Draft saved on every field change, keyed by activity id, behind one interface
with two implementations: `localStorage` on web, `AsyncStorage` on React
Native. Submit failure keeps the draft and retries in the background. `Esc`
closes but keeps it. An "unlogged call" marker shows on the contact until it
lands.

This is the difference between a feature callers trust and one they work
around.

## Constraints

- Multi-tenant by `workspaceId`; every query filters on it.
- Do not change `ActivityOutcome` values — analytics groups by them.
- `customFields` replaces wholesale; read-merge-write.
- Romanian UI copy, English code and commits.
- Fully keyboard-operable on web.

## Decisions I made

- **Disposition mutates the existing WhatsApp call activity**, never creating
  a second row — otherwise every in-app call is counted twice and may render
  twice in the thread.
- **The caller's answer overrides the webhook's outcome.** The human spoke to
  the client; the Meta status only says whether the call connected.
- **Follow-up and reminder are one concept.** Since `followUpDate` is
  unread, every follow-up also creates a Task. Two fields collapse to one.
- **`.../calls/:callId/log` must return the activity id.**
- **Deal captures amount only.**
- **Follow-up defaults +3 days; callback +1 hour.**
- **The dialog never blocks the next call.**
## Booking routing (answered, and it is not a detail)

When a setter books, they **choose the closer, and the choice depends on who
is free**. That rules out a single per-user booking link.

`MeetingType` is per-user (`userId` + `slug`), and `GET public/:slug/slots`
returns slots for one meeting type. Serving "who is free" therefore needs a
**merged availability query across several closers' meeting types**, with
the result grouped so the caller sees either a named closer's slots or the
earliest slot from anyone.

For outcome 7 (`Programat`) the dialog shows that merged list and the caller
picks a closer and a slot, or lets the system assign the earliest. Outcome 1
(`interesat`) sends the contact a link that performs the same selection on
the public page.

**Consequence for sequencing:** the merged-availability endpoint is new
backend work that the dialog depends on for its most valuable outcome. It
belongs with the booking page, not with the dialog — so the dialog ships
first with outcomes 1 and 7 recording correctly and `bookingSent` false, and
gains the picker when booking lands. Attempting both at once couples two
deliverables that are each useful alone.

## Open

- WhatsApp's missing 24-hour window gating affects whether a booking link can
  be sent as free text. Pre-existing; surfaces here, fixed with the booking
  page.

## Open for the builder

- The exact `CallPhase` value and subscription shape for the `'ended'`
  transition, in both `frontend/lib/call-manager.ts` and
  `mobile-rn/src/stores/call-store.ts`.
- Whether `Deal` requires a pipeline stage on create.
- Where the "Log call" button best sits on each client.
