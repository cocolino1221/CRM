# Call Disposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A caller records the outcome of every call in under ten seconds, and that one answer creates the follow-up, the reminder, or the deal — on both live clients, feeding reports that actually count.

**Architecture:** One transactional endpoint turns a disposition into an `Activity` outcome plus, as chosen, a `Task` and a `Deal`. The `activities` module is built properly first, because today it is an 11-line stub. The reporting layer is repaired alongside, because `callsMade` is structurally stuck at zero and the follow-up columns are write-only — capture into a broken reporting layer produces a dashboard that looks populated and lies.

**Tech Stack:** NestJS 11, TypeORM + Postgres, Jest, `@nestjs/schedule`, Next.js 14 App Router (`frontend/`), Expo React Native + zustand (`mobile-rn/`).

**Spec:** `docs/superpowers/specs/2026-10-16-call-disposition-design.md`

## Global Constraints

- Multi-tenant by `workspaceId`. Every query filters on it.
- Do not change `ActivityOutcome`'s values — analytics groups by them.
- `customFields` on any entity replaces wholesale; read-merge-write.
- Romanian UI copy; English code, comments and commits.
- Controllers follow `tasks.controller.ts`: `@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)`, `@CurrentWorkspace('id')`, `@CurrentUser('id')`, `@Roles(...)`, DTOs validated with `ValidationPipe`.
- Disposition roles: `admin`, `manager`, `sales_rep`, `closer`, `setter`, `caller`.
- Both live clients ship: `frontend/` and `mobile-rn/`. Ignore `mobile/` — dead since April 2026.
- The dialog must be fully keyboard-operable on web.

## Review Focus

Five failure modes the spec implies but which no task's happy path exercises. Each has a test pinned to the task that owns the code.

1. **Double submit creates duplicate Task and Deal.** A caller on bad signal submits, the request times out, the retry succeeds — and the contact now has two reminders and two deals. This codebase has already shipped this exact bug twice (Typeform contacts, WhatsApp activities). → Task 2.
2. **The reminder cron re-notifies the same task on every run.** A task due at 10:00 is still due at 10:05; without a marker the caller is pushed every cycle until they complete it. → Task 6.
3. **Disposition addressed to another workspace's activity.** The id is a UUID in a URL; nothing but an explicit filter stops a cross-tenant write. → Task 2.
4. **Re-dispositioning an already-dispositioned call.** A caller corrects a mistake. The outcome should update; a second Deal should not appear. → Task 2.
5. **Day boundaries in the workspace's timezone.** `getDailyKPIs` builds `startOfDay`/`endOfDay` on the server clock; a call at 23:30 in Bucharest belongs to that day, not the UTC one. → Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/activities/activities.service.ts` | Real service: scoped queries, disposition transaction |
| `backend/src/activities/activities.controller.ts` | Guarded routes |
| `backend/src/activities/activities.module.ts` | Wiring, imports `TasksModule`, `DealsModule`, `ContactsModule` |
| `backend/src/activities/dto/disposition.dto.ts` | Validated request body |
| `backend/src/activities/dto/query-activities.dto.ts` | List filters |
| `backend/src/activities/work-queues.service.ts` | The three lists: follow-ups due, booked, to-call |
| `backend/src/activities/reminder-dispatch.service.ts` | Cron → push |
| `backend/src/analytics/analytics.service.ts` | `callsMade` fix, `occurredAt` bucketing, per-user KPIs |
| `frontend/lib/disposition-draft.ts` | Draft store, web |
| `frontend/components/calls/DispositionDialog.tsx` | The dialog, web |
| `mobile-rn/src/lib/disposition-draft.ts` | Draft store, RN |
| `mobile-rn/src/components/DispositionDialog.tsx` | The dialog, RN |

`work-queues.service.ts` and `reminder-dispatch.service.ts` are separate from `activities.service.ts` because one is a read surface and one is a scheduled writer; folding either into the service that owns the disposition transaction would put three unrelated reasons to change in one file.

The **web** queue screens are Task 10. The **React Native** queue screens are not in this plan — the dialog has to exist on both clients first, and a second client's worth of list UI on top would make a single reviewable task impossible. They are the obvious next plan.

---

### Task 1: Build the activities module

**Files:**
- Modify: `backend/src/activities/activities.service.ts` (replace the 11-line stub)
- Modify: `backend/src/activities/activities.controller.ts`
- Modify: `backend/src/activities/activities.module.ts`
- Create: `backend/src/activities/dto/query-activities.dto.ts`
- Test: `backend/src/activities/activities.service.spec.ts`

**Interfaces:**
- Produces:
  - `ActivitiesService.findAll(workspaceId: string, query: QueryActivitiesDto): Promise<{ data: Activity[]; total: number }>`
  - `ActivitiesService.findOne(workspaceId: string, id: string): Promise<Activity>` — throws `NotFoundException` when the activity belongs to another workspace

- [ ] **Step 1: Write the failing tests**

In `activities.service.spec.ts`, following the mock-repository style of `contacts/contacts.notify.spec.ts`:

```ts
describe('ActivitiesService', () => {
  it('findAll filters by workspaceId', async () => { /* assert the where clause carries workspaceId */ });
  it('findAll applies contactId and type filters when given', async () => { /* … */ });
  it('findOne throws NotFoundException for an activity in another workspace', async () => { /* … */ });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/activities/activities.service.spec.ts`
Expected: FAIL — the stub returns `{ message, data: [] }`

- [ ] **Step 3: Implement the service**

Inject `@InjectRepository(Activity)`. Implement the two signatures above. `QueryActivitiesDto`: optional `contactId`, `type`, `outcome`, `userId`, `page` (default 1), `limit` (default 50, max 100), ordered by `occurredAt DESC`.

- [ ] **Step 4: Wire the module and guard the controller**

`activities.module.ts`: `imports: [TypeOrmModule.forFeature([Activity])]`, export the service. Controller: class-level `@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)` and `@ApiBearerAuth()`, routes taking `@CurrentWorkspace('id')`, roles per Global Constraints.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd backend && npx jest src/activities && npx tsc --noEmit`
Expected: PASS, 0 TS errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/activities
git commit -m "feat(activities): replace stub with a real, workspace-scoped module"
```

---

### Task 2: The disposition endpoint

**Files:**
- Create: `backend/src/activities/dto/disposition.dto.ts`
- Modify: `backend/src/activities/activities.service.ts`
- Modify: `backend/src/activities/activities.controller.ts`
- Modify: `backend/src/activities/activities.module.ts` (import `TasksModule`, `DealsModule`, `ContactsModule`)
- Test: `backend/src/activities/disposition.spec.ts`

**Interfaces:**
- Consumes: `TasksService.create(workspaceId, creatorId, CreateTaskDto)`, `DealsService.create(workspaceId, CreateDealDto)`, `ActivitiesService.findOne` (Task 1)
- Produces:
  - `DispositionDto { outcome: ActivityOutcome; notes?: string; followUp?: { at: string; title?: string }; deal?: { value: number; currency: string }; bookingSent?: boolean; clientRequestId: string }`
  - `ActivitiesService.applyDisposition(workspaceId: string, userId: string, activityId: string, dto: DispositionDto): Promise<Activity>`
  - `ActivitiesService.createAndDisposition(workspaceId: string, userId: string, contactId: string, dto: DispositionDto & { occurredAt?: string; durationSeconds?: number }): Promise<Activity>`

`clientRequestId` is a client-generated UUID, stored at `activity.metadata.dispositionRequestId`. It is what makes a retry safe.

- [ ] **Step 1: Write the failing tests**

```ts
describe('applyDisposition', () => {
  it('sets outcome and followUpNotes on the activity', async () => {});
  it('creates a Task when followUp is given, with dueDate = followUp.at and assignee = caller', async () => {});
  it('creates a Deal with the given value when deal is given', async () => {});
  it('updates contact.lastContactedAt', async () => {});

  // Review Focus 1 — retry safety
  it('is idempotent: the same clientRequestId twice creates one Task and one Deal', async () => {});

  // Review Focus 3 — tenant isolation
  it('throws NotFoundException for an activity in another workspace', async () => {});

  // Review Focus 4 — correction
  it('re-dispositioning with a new clientRequestId updates the outcome without creating a second Deal', async () => {});

  it('rolls back the Task when Deal creation fails', async () => {});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/activities/disposition.spec.ts`
Expected: FAIL — `applyDisposition is not a function`

- [ ] **Step 3: Implement both methods**

Run the whole body inside `dataSource.transaction`. Order: read the activity scoped to `workspaceId`; if `metadata.dispositionRequestId === dto.clientRequestId`, return it unchanged; set `outcome`, `followUpNotes`, and when `followUp` is present `followUpRequired = true` and `followUpDate`; create Task; create Deal only when `activity.dealId` is null; set `contact.lastContactedAt`; record `dispositionRequestId` and `dealId` on the activity.

Re-disposition keeps the existing `dealId` — that is what makes test 7 pass.

- [ ] **Step 4: Add the routes**

`POST activities/:id/disposition` and `POST activities/disposition`, roles per Global Constraints, `@CurrentUser('id')` as the caller.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd backend && npx jest src/activities && npx tsc --noEmit`
Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/activities
git commit -m "feat(activities): transactional, idempotent call disposition"
```

---

### Task 3: Return the activity id when logging a call

**Files:**
- Modify: `backend/src/integrations/whatsapp/whatsapp-calling.controller.ts:99-110`
- Modify: `backend/src/integrations/whatsapp/whatsapp.service.ts` (`logCallActivity`, ~line 1424)
- Test: `backend/src/integrations/whatsapp/log-call-returns-id.spec.ts`

**Interfaces:**
- Produces: `POST /integrations/whatsapp/calls/:callId/log` → `{ success: true, activityId: string }`

Without this the client cannot address the row it must disposition, and the draft store has no key.

- [ ] **Step 1: Write the failing test**

```ts
it('logCall returns the id of the activity it created', async () => {
  // assert the response contains activityId matching the saved activity
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/integrations/whatsapp/log-call-returns-id.spec.ts`
Expected: FAIL — response has no `activityId`

- [ ] **Step 3: Return the saved activity**

Change `logCallActivity` to return the saved `Activity` rather than void, and the controller to return `{ success: true, activityId: activity.id }`. Leave the existing `ActivityType.WHATSAPP_MESSAGE` + `metadata.messageType = 'call'` shape alone — the chat UI depends on it.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd backend && npx jest src/integrations/whatsapp && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/integrations/whatsapp
git commit -m "feat(whatsapp): return activityId from call log so it can be dispositioned"
```

---

### Task 4: Repair the reporting layer

**Files:**
- Modify: `backend/src/analytics/analytics.service.ts` (`getDailyKPIs` ~506-566, `generateEODReport` ~575)
- Modify: `backend/src/analytics/analytics.controller.ts:242-252`
- Test: `backend/src/analytics/daily-kpis.spec.ts`

**Interfaces:**
- Produces: `getDailyKPIs(workspaceId: string, date?: Date, userId?: string)` — unchanged return shape plus per-user filtering when `userId` is given

- [ ] **Step 1: Write the failing tests**

```ts
describe('getDailyKPIs', () => {
  it('counts a WhatsApp call activity in callsMade', async () => {
    // type 'whatsapp_message' with metadata.messageType === 'call'
  });
  it('still counts ActivityType.CALL in callsMade', async () => {});
  it('buckets by occurredAt, not createdAt', async () => {
    // activity occurred yesterday, created today -> not in today's count
  });
  it('filters to one user when userId is given', async () => {});

  // Review Focus 5 — day boundaries
  it('uses the workspace timezone for start and end of day', async () => {
    // a call at 23:30 Europe/Bucharest belongs to that local day
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/analytics/daily-kpis.spec.ts`
Expected: FAIL — `callsMade` is 0 for the WhatsApp call

- [ ] **Step 3: Fix the three defects**

`callsMade` counts `a.type === 'call' || (a.type === 'whatsapp_message' && a.metadata?.messageType === 'call')`. Swap the activity query's `createdAt: Between(...)` for `occurredAt`. Build `startOfDay`/`endOfDay` in `workspace.settings.timezone`, falling back to UTC. Add the optional `userId` filter.

- [ ] **Step 4: Open the EOD report to callers**

`analytics.controller.ts:242` — extend `@Roles` to the disposition roles, and pass `@CurrentUser('id')` as `userId` for non-manager roles so a caller sees their own numbers.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd backend && npx jest src/analytics && npx tsc --noEmit`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/analytics
git commit -m "fix(analytics): count WhatsApp calls, bucket by occurredAt, per-user KPIs"
```

---

### Task 5: The three work queues

**Files:**
- Create: `backend/src/activities/work-queues.service.ts`
- Modify: `backend/src/activities/activities.controller.ts`
- Modify: `backend/src/activities/activities.module.ts` (`TypeOrmModule.forFeature([Activity, Booking, Contact])`)
- Test: `backend/src/activities/work-queues.spec.ts`

**Interfaces:**
- Produces:
  - `WorkQueuesService.findFollowUpsDue(workspaceId: string, userId?: string, before?: Date): Promise<Activity[]>`
  - `WorkQueuesService.findBooked(workspaceId: string, userId?: string): Promise<Booking[]>`
  - `WorkQueuesService.findUnbookedLeads(workspaceId: string, page?: number, limit?: number): Promise<{ data: Contact[]; total: number }>`

Three lists, one service, because they are the same shape — read surfaces over data that already exists, answering "who do I work next?".

- **Follow-ups due** makes `followUpDate` readable. Without it the column stays write-only, which the spec names as an anti-goal.
- **Programați** — bookings with `startTime >= now` and `status` not cancelled, newest first, with the contact joined. `booking.entity.ts` already indexes `startTime` and `status`.
- **De sunat** — contacts with `source = 'typeform'` that have **no** booking. This is the calling queue: people who filled in the form and were never scheduled.

Each row carries `metadata.recordingUrl` from the contact's most recent call activity when one exists, so a caller can listen to the last conversation before dialling again. The field is already populated by `logCallActivity`; nothing new is recorded.

- [ ] **Step 1: Write the failing tests**

```ts
describe('findFollowUpsDue', () => {
  it('returns activities whose followUpDate has passed', async () => {});
  it('excludes activities with followUpRequired false', async () => {});
  it('scopes to the given user when userId is passed', async () => {});
});

describe('findBooked', () => {
  it('returns only bookings starting now or later', async () => {});
  it('excludes cancelled bookings', async () => {});
});

describe('findUnbookedLeads', () => {
  it('returns typeform contacts with no booking', async () => {});
  it('excludes a typeform contact that has a booking', async () => {});
  it('excludes contacts from another workspace', async () => {});
});

it('attaches the latest recordingUrl to a queue row when one exists', async () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/activities/work-queues.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

`findUnbookedLeads` uses a `LEFT JOIN bookings ON bookings.contactId = contact.id` with `bookings.id IS NULL`, not a `NOT IN` subquery — the dataset is tens of thousands of contacts and the join uses the existing index.

- [ ] **Step 4: Add the routes**

`GET activities/follow-ups`, `GET activities/queues/booked`, `GET activities/queues/to-call`. Roles per Global Constraints.

- [ ] **Step 5: Run tests and typecheck**

Run: `cd backend && npx jest src/activities && npx tsc --noEmit`
Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/activities
git commit -m "feat(activities): follow-ups, booked and to-call work queues"
```

---

### Task 6: Reminder pushes

**Files:**
- Create: `backend/src/activities/reminder-dispatch.service.ts`
- Modify: `backend/src/activities/activities.module.ts`
- Test: `backend/src/activities/reminder-dispatch.spec.ts`

**Interfaces:**
- Consumes: `PushNotificationService.sendPushToUser(userId, payload)`
- Produces: `ReminderDispatchService.dispatchDue(now: Date): Promise<number>` — returns how many were sent

`@Cron(CronExpression.EVERY_5_MINUTES)`, following `scheduler/campaign-scheduler.service.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('pushes to the assignee for a task due now', async () => {});

// Review Focus 2 — no repeat notifications
it('does not push again for a task already notified', async () => {});

it('skips completed and cancelled tasks', async () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/activities/reminder-dispatch.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Query tasks with `dueDate <= now`, `status IN (pending, in_progress)`, and no `customFields.reminderNotifiedAt`. Push, then write `reminderNotifiedAt` — read-merge-write `customFields`, per Global Constraints. The marker is what stops the five-minute loop from pushing forever.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd backend && npx jest src/activities && npx tsc --noEmit`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/activities
git commit -m "feat(activities): fire reminder pushes once per due task"
```

---

### Task 7: Draft store

**Files:**
- Create: `frontend/lib/disposition-draft.ts`
- Create: `mobile-rn/src/lib/disposition-draft.ts`
- Test: `frontend/lib/disposition-draft.spec.ts`

**Interfaces:**
- Produces, identical in both files:
  - `saveDraft(activityId: string, draft: DispositionDraft): void`
  - `loadDraft(activityId: string): DispositionDraft | null`
  - `clearDraft(activityId: string): void`
  - `listPendingDrafts(): Array<{ activityId: string; draft: DispositionDraft }>`

Web uses `localStorage`, RN uses `AsyncStorage`. Same names and shapes so the dialogs differ only in rendering.

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips a draft', () => {});
it('returns null for an unknown activity', () => {});
it('survives a storage read that throws', () => {}); // private mode / blocked storage
it('lists drafts that were never cleared', () => {});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx jest lib/disposition-draft.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement both**

Wrap every read and write in try/catch; a blocked store must degrade to "no draft", never throw into the dialog.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx jest lib/disposition-draft.spec.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/disposition-draft.ts frontend/lib/disposition-draft.spec.ts mobile-rn/src/lib/disposition-draft.ts
git commit -m "feat(calls): offline-safe disposition draft store for web and RN"
```

---

### Task 8: The dialog on web

**Files:**
- Create: `frontend/components/calls/DispositionDialog.tsx`
- Modify: `frontend/lib/call-manager.ts` (latch context on the `'ended'` transition, before the ~2500 ms reset at lines 383-409)
- Modify: `frontend/app/(dashboard)/leads/page.tsx` (the "Log call" entry point)

**Interfaces:**
- Consumes: `saveDraft`/`loadDraft`/`clearDraft` (Task 7); `POST activities/:id/disposition` (Task 2); `activityId` from Task 3
- Produces: `<DispositionDialog activityId contactId contactName durationSeconds onClose />`

The seven outcomes, their keys and their follow-on fields are the table in the spec's Part 2. Use it verbatim — the Romanian labels are the UI copy.

- [ ] **Step 1: Build the dialog**

Keys `1`-`7` select an outcome, `Enter` submits, `Esc` closes while keeping the draft. Generate `clientRequestId` once per dialog instance, not per submit attempt — that is what makes the retry idempotent. Save the draft on every field change; on submit failure keep it and retry in the background.

When the activity carries `metadata.recordingUrl`, render an `<audio controls>` above the outcome list so the caller can replay what was just said before choosing. Absent for calls that were not recorded — recording is manual and consent-gated, per the note in `call-manager.ts`.

- [ ] **Step 2: Latch call context on end**

In `call-manager.ts`, capture `{ activityId, contactId, contactName, durationSeconds }` synchronously when the phase becomes `'ended'`, and expose it for the dialog. Reading it after the reset returns nothing.

- [ ] **Step 3: Add the manual entry point**

A "Log call" button on the lead detail surface, opening the same dialog with no `activityId` → posts to `POST activities/disposition`.

- [ ] **Step 4: Verify by hand**

Finish a WhatsApp call: the dialog opens with the contact prefilled. Pick `4` (N-a răspuns) and a callback: a Task appears with that due date. Pick `1` and enter an amount: a Deal appears. Kill the network, submit, restore it: the disposition lands once and only once.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/calls frontend/lib/call-manager.ts "frontend/app/(dashboard)/leads/page.tsx"
git commit -m "feat(calls): disposition dialog on web"
```

---

### Task 9: The dialog on React Native

**Files:**
- Create: `mobile-rn/src/components/DispositionDialog.tsx`
- Modify: `mobile-rn/src/stores/call-store.ts` (latch context at the `'ended'` transition, line ~142, before the reset at ~165)
- Modify: `mobile-rn/src/screens/LeadDetailScreen` (the "Log call" entry point)

**Interfaces:**
- Consumes: the same store functions and endpoints as Task 8, via `mobile-rn/src/lib/disposition-draft.ts`

Same seven outcomes, same copy, same `clientRequestId` rule. Touch targets replace keyboard shortcuts; everything else matches Task 8 so the two clients cannot drift in behaviour.

- [ ] **Step 1: Build the dialog**

- [ ] **Step 2: Latch call context in the zustand store**

`useCallStore.setState({ phase: 'ended' })` at line ~142 is the hook; the reset at ~165 clears `waId` and `contactName`, so capture before it.

- [ ] **Step 3: Add the manual entry point on `LeadDetailScreen`**

- [ ] **Step 4: Verify by hand on a device**

Same five checks as Task 8, Step 4, plus: background the app mid-dialog and reopen — the draft is still there.

- [ ] **Step 5: Commit**

```bash
git add mobile-rn/src
git commit -m "feat(calls): disposition dialog on React Native"
```

---

### Task 10: The two lists on screen (web)

**Files:**
- Create: `frontend/components/queues/BookedList.tsx`
- Create: `frontend/components/queues/ToCallList.tsx`
- Modify: `frontend/app/(dashboard)/leads/page.tsx` (two tabs: `Programați` and `De sunat`)

**Interfaces:**
- Consumes: `GET activities/queues/booked`, `GET activities/queues/to-call` (Task 5); `<DispositionDialog>` (Task 8)

Both lists are tabs on Leads. The caller works one page: picks `De sunat`, rings straight from the row, dispositions, and the contact moves itself to `Programați` when booked. Nothing is copied between screens.

`leads/page.tsx` is already 2,659 lines. The two lists are therefore separate components mounted by it, not more branches inside it — the page is near the point where it stops being safely editable.

- [ ] **Step 1: Build `BookedList`**

Columns: contact name, phone, `startTime` in the workspace timezone, the closer's name. Row click opens the contact. Empty state: `Nicio programare viitoare`.

- [ ] **Step 2: Build `ToCallList`**

Columns: contact name, phone, when the Typeform was submitted, and a play control when the row carries `recordingUrl`. A `Sună` button starts the call through the existing call manager; finishing it opens the disposition dialog, so a caller can work the whole list without leaving the page. Empty state: `Toți cei din formular au fost programați`.

- [ ] **Step 3: Mount both tabs on Leads**

Add `Programați` and `De sunat` alongside the existing tabs, each rendering its component. Remember the selected tab per viewer in `localStorage` only — it is a convenience, not state the server needs.

- [ ] **Step 4: Verify by hand**

A Typeform contact with no booking appears under `De sunat`. Call them from the row, disposition as `Programat`, book them: they leave `De sunat` and appear under `Programați`, without a full page reload and without anyone ticking anything.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/queues "frontend/app/(dashboard)/leads/page.tsx"
git commit -m "feat(queues): Programați and De sunat tabs on leads"
```

---

## Self-Review

**Spec coverage:** Part 0 → Task 1. Part 1 (triggers) → Tasks 8, 9. Part 2 (dialog) → Tasks 8, 9. Part 3 (endpoint) → Task 2, with Task 3 supplying the activity id it needs. Part 4 (reporting) → Tasks 4, 5. Part 5 (reminders) → Task 6. Part 6 (drafts) → Task 7. Booking routing is explicitly sequenced after this plan by the spec and has no task here — `bookingSent` is accepted by the DTO and stored, nothing more.

Added after the spec was approved, at the user's request: the **booked** and **to-call** queues (Task 5), their **web screens** (Task 10), and the **call recording link** (Tasks 5, 8, 9, 10). Recording needed no new capture — `metadata.recordingUrl` is already written by `logCallActivity`; all three additions are read surfaces. The React Native list screens remain a following plan, stated in the File Structure section.

**Step scan:** Bodies appear nowhere; steps carry signatures, test names and the values the spec pins. The two hand-verification steps are concrete observations, not "check it works".

**Type consistency:** `applyDisposition` / `createAndDisposition` / `DispositionDto` match between Tasks 2, 8 and 9. `saveDraft` / `loadDraft` / `clearDraft` / `listPendingDrafts` match between Tasks 7, 8 and 9. `activityId` flows Task 3 → Task 8/9 → Task 2. `getDailyKPIs(workspaceId, date?, userId?)` matches between Tasks 4 and its controller change.

**Review Focus coverage:** 1 → Task 2 test 5. 2 → Task 6 test 2. 3 → Task 2 test 6. 4 → Task 2 test 7. 5 → Task 4 test 5.

**Proportion:** Nine tasks over roughly the spec's length, no function bodies.
