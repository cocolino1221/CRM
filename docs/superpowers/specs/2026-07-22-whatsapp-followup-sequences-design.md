# WhatsApp Follow-Up Sequences — Design Spec

**Date:** 2026-07-22
**Backend:** NestJS (`backend/`)
**Frontend:** Next.js (`frontend/app/(dashboard)/whatsapp/page.tsx`)

## Goal

Extend the existing WhatsApp conversation-flow engine so that a flow step can define a **no-reply timeout**: if the contact hasn't replied (by button, keyword, or matching text) within a configurable window — minutes, hours, or days, up to 7 days — the flow automatically advances to a follow-up step. Reply content can also branch the flow (e.g. "yes" stops the sequence, "no" continues it), reusing matching logic that already exists.

## Current State (what already exists)

- `integration.config.conversationFlows`: an array of flows, each with a `trigger` (`first_message` | `keyword` | `after_auto_send`), and `steps[]`.
- Each step: `{ id, message, type?: 'template'|'interactive', templateName?, buttons?: Array<{ id, title, nextStepId }>, delayMs, fallbackOnTextReply? }`.
- `armAfterAutoSendFlow` arms flow state right after an auto-send template fires (`whatsapp.service.ts:3919`).
- `checkFlowTrigger` (`whatsapp.service.ts:4243`) matches inbound button clicks and, via `tokensMatch` fuzzy text matching, typed replies (e.g. "da") against a step's button titles — this already covers **reply-content branching**.
- `scheduleDelayedFlowStep` currently uses in-process `setTimeout`, hard-capped at 6 hours (`getFlowStepDelayMs`), and is lost on any server restart. **No mechanism exists today for "if nobody replies within X, do Y."**
- The project already runs Bull + Redis for background jobs (`backend/src/queues/`), used elsewhere for durable delayed/scheduled work. Per project convention, delayed automation must use Bull jobs, not in-process timers or DB-polling crons (keeps Neon from being woken unnecessarily and survives Fly restarts).

## What's Being Added

### 1. Step schema: `timeoutBranch`

Each flow step gains an optional field:

```ts
timeoutBranch?: {
  delayValue: number;       // e.g. 3
  delayUnit: 'minutes' | 'hours' | 'days'; // e.g. 'hours'
  nextStepId: string;       // step to send if no matching reply arrives in time
};
```

Validation: `delayValue * unit` converted to ms must be `> 0` and `<= 7 * 24 * 60 * 60 * 1000` (7 days). `nextStepId` must reference an existing step in the same flow (reuse the existing button `nextStepId` validation pattern in the frontend editor).

### 2. Durable scheduling (Bull, not setTimeout)

- New dedicated queue `QUEUE_NAMES.WHATSAPP_FOLLOWUP` with its own processor (kept separate from the generic `WORKFLOW` queue, which has unrelated action types) and job type `CHECK_FOLLOWUP_REPLY`.
- When a step with a `timeoutBranch` is sent (including the first step armed by `armAfterAutoSendFlow`), enqueue a delayed job:
  ```ts
  { workspaceId, waId, flowId, stepId, armedAt: isoString }
  ```
  with Bull's native `delay` option set to the computed ms (Redis persists this — survives process restarts, unlike `setTimeout`).
- **Processor logic on fire:** re-fetch the integration's current `flowStates[waId]`. If the contact is no longer sitting at `stepId` for `flowId` (i.e. they replied and the flow already advanced, or the flow was cancelled/completed) → no-op (stale job). Otherwise: send `timeoutBranch.nextStepId` via the existing `sendFlowStep`, update `flowStates[waId]` to the new step, and — if that new step itself has a `timeoutBranch` — enqueue the next delayed job the same way. This chains naturally for a 2–3 step sequence.
- Existing 6-hour in-process `setTimeout` path (`scheduleDelayedFlowStep`, used for immediate/short step delays) is untouched — `timeoutBranch` is a separate, additive mechanism specifically for the no-reply case. (Both can coexist; a step's plain `delayMs` still means "wait, then send unconditionally"; `timeoutBranch` means "wait, then send *only if no matching reply arrived*.")

### 3. Reply-content branching (reuse, one small extension)

- No new matching engine — `checkFlowTrigger`'s existing button/keyword fuzzy-match (`tokensMatch`) already resolves a typed "da"/"nu" or button click to a `nextStepId`.
- **Extension needed:** when a matching reply arrives for a step that has a pending timeout job, mark that job stale (state already changes `currentStepId`, which the processor's re-check already handles — no separate cancellation needed, the no-op check above covers it).
- **Default for an unmatched/unclear reply:** stop the automated sequence (clear `flowStates[waId]`) — assume a human should take over once the contact says *something* the bot can't classify. This is the safe default; not configurable in v1 (YAGNI).

### 4. Template requirement for long delays

Any step reachable only through a `timeoutBranch` of >~23 hours will almost certainly fire outside WhatsApp's 24-hour customer-service window, where Meta requires an **approved template** (`step.type === 'template'`), not free text. The frontend editor shows a warning banner on a step's timeout config once the configured delay exceeds ~20 hours: *"This step may send after the 24h window closes — use an approved template or it may fail to deliver."* This is a warning, not a hard block (a fast 1–2 hour timeout can safely stay free text).

### 5. Frontend (flow step editor, `whatsapp/page.tsx` ~line 6000–6300)

Per step, alongside the existing buttons UI, add a "No-reply follow-up" block:
- Toggle to enable/disable `timeoutBranch` for this step
- Number input + unit dropdown (minutes/hours/days), capped at 7 days combined
- "Send step" dropdown (same pattern as the existing button `nextStepId` selects)
- Warning banner per section 4 when delay > ~20 hours

## Data Flow Example

1. Auto-send template fires → `armAfterAutoSendFlow` arms flow at step 1, which has `timeoutBranch: { 3, 'hours', nextStepId: 'followup_1' }` → Bull job enqueued, delay 3h.
2. **No reply in 3h:** job fires, contact still at step 1 → send `followup_1` (plain text is fine here — 3h is well under the 24h window). If `followup_1` has its own `timeoutBranch: { 2, 'days', nextStepId: 'followup_2' }`, a new job is enqueued — and since 2 days is far past the 24h window, `followup_2` must be an approved template.
3. **Contact replies "nu" within the 3h window:** `checkFlowTrigger` matches to a button/keyword → advances state to whatever step "nu" points to (e.g. straight to `followup_2`, or a distinct branch) → original 3h job fires later, sees state has moved on, no-ops.
4. **Contact replies "da":** matches to `nextStepId: step_converted` → state cleared/flow ends → pending job later no-ops.

## Testing

- Unit: `timeoutBranch` validation (bad unit, >7 days, missing `nextStepId`).
- Unit: processor no-ops when `flowStates[waId]` no longer matches the job's `stepId`/`flowId`.
- Unit: processor sends + re-arms chained timeout when the target step also has a `timeoutBranch`.
- Integration: reply arriving after the job already fired (race) does not double-send.
- Manual: verify a queued job survives a Fly redeploy (restart mid-delay, confirm it still fires).

## Out of Scope (YAGNI)

- Configurable behavior for "unmatched reply" (always stops the sequence in v1).
- Applying `timeoutBranch` UI/validation differently per flow `trigger` type — the mechanism is generic and works the same for `after_auto_send`, `keyword`, or `first_message` flows.
- Analytics/reporting on follow-up performance (open rate, reply rate per step) — future addition if requested.
- Per-workspace override of the 7-day cap.
