# Auto-Generated Meeting Link + WhatsApp Reminder — Design Spec

**Date:** 2026-07-29
**Backend:** NestJS (`backend/`)
**Frontend:** Next.js (`frontend/app/(dashboard)/`)

## Goal

1. When a lead books a call, auto-generate a Zoom or Google Meet link (configurable per meeting type) instead of requiring a manually pasted link.
2. Send a WhatsApp template reminder 2–3 hours before the meeting with 2 buttons (Yes/No). "Yes" delivers the meeting link (auto-inserted into the template); "No" leads to a reschedule step. Templates are user-authored in Meta; this spec only needs the scheduling + delivery mechanism and the flow-editor hook.

Reuses the WhatsApp conversation-flow engine and durable Bull-job scheduling just shipped for no-reply follow-ups (`2026-07-22-whatsapp-followup-sequences-design.md`).

## Current State

- `Booking` and `MeetingType` entities already have `locationType` (string: `zoom`/`meet`/`phone`/`in-person`) and `location` (the link/details) — but nothing populates `location` automatically today; it's blank unless someone types it in.
- `ZoomIntegrationHandler.createMeeting()` already exists and works (Server-to-Server OAuth) but is called from nowhere.
- The Google integration (already connected, used for Sheets sync) can create Calendar events with `conferenceData` to get a Meet link, via the existing OAuth token — no new Google setup needed.
- `bookings.service.ts` `create()` saves the booking and returns; no calendar sync, no link generation, no notification today. `cancel()` exists; no `reschedule()` method exists (rescheduling today means cancel + re-book).
- WhatsApp `conversationFlows` support triggers `first_message | keyword | after_auto_send`, each with `steps[]` (template/buttons/timeoutBranch — see prior spec).

## What's Being Added

### 1. Meeting link auto-generation

`MeetingType` gains `autoGenerateLink: boolean` (default `false` — no behavior change for existing meeting types). Toggled in the meeting-type editor UI.

At `bookings.service.create()`, after the booking is saved, if `meetingType.autoGenerateLink`:
- `locationType === 'zoom'` → call `ZoomIntegrationHandler.createMeeting()` with `topic` (host + guest names), `startTime`, `duration`; store the returned `join_url` into `booking.location`.
- `locationType === 'meet'` → create a Google Calendar event (`conferenceDataVersion=1`, `conferenceData.createRequest`) via the existing Google integration; extract the `hangoutLink`/video entry point into `booking.location`, store the event id into `booking.calendarEventId`.
- Either path failing (no Zoom/Google integration connected, API error) logs a warning and leaves `location` blank — booking creation itself never fails because of this (best-effort, non-blocking).

### 2. WhatsApp flow trigger: `before_meeting`

Flow object gains, alongside the existing `trigger`/`triggerKeyword`: **`reminderHoursBefore: number`** (default 3, editor exposes a plain number input — "hours before meeting"). Step 1 remains a required template (same convention as the other trigger types).

**New: per-step "Template variables".** A step of `type: 'template'` gains an editable list of body-parameter values (currently not exposed in the editor at all — this is a genuinely new UI, not just wiring). Each value is either a literal string or the token `{{meetingLink}}`. At send time, `sendFlowStep` resolves `{{meetingLink}}` from the booking associated with the send (if any); literal values pass through unchanged. Non-booking-triggered sends with a `{{meetingLink}}` token left unresolved just send the literal text (no crash) — a corner case, not expected in practice since the token is only meaningful on a `before_meeting` flow's steps.

### 3. Durable scheduling (mirrors the follow-up dispatch pattern)

New dedicated queue `QUEUE_NAMES.MEETING_REMINDER`, producer/consumer split exactly like `WhatsAppFollowupDispatch`/`WhatsAppFollowupProcessor`:
- **Producer** (`MeetingReminderDispatchService`): `schedule(bookingId, workspaceId, sendAt)` — cancels-then-enqueues a Bull job with `delay = sendAt - now`, deterministic `jobId = booking:${bookingId}` (reschedule-safe: re-scheduling the same booking replaces the pending job).
- Called from `bookings.service.create()`: if a `before_meeting` flow is enabled for the workspace, compute `sendAt = booking.startTime - reminderHoursBefore * 3600000`; if `sendAt` is already in the past (booked too close to call time), skip scheduling entirely (no immediate-fire fallback — out of scope).
- Called from `bookings.service.cancel()`: cancel the pending reminder job for that booking (never send a reminder for a meeting that no longer exists).
- **Processor**: on fire, re-loads the booking — if not `CONFIRMED` anymore, or `startTime` has already passed, no-op (stale/cancelled). Otherwise resolves the target phone (`contact.phone` if `contactId` set, else `guestPhone`) — no phone available → log + no-op (no SMS/email fallback, out of scope). Starts the `before_meeting` flow via a booking-aware variant of `startFlow` that carries the booking id through so `{{meetingLink}}` resolves correctly for this send and any chained steps in the same flow instance.

### 4. Known limitation (accepted, not solved here)

Flow state (`flowStates[waId]`) is one-per-contact. If the same contact has two bookings whose reminders are both pending replies at overlapping times, the second reminder's flow state overwrites the first's — the first booking's Yes/No tracking breaks. Rare in practice (would need two calls with the same person within a couple hours of each other); not solved in this pass.

## Data Flow Example

1. Lead books "Discovery Call" (meeting type has `autoGenerateLink=true`, `locationType=meet`) for tomorrow 3pm.
2. Booking saved → Google Calendar event created with a Meet link → `booking.location` = the link.
3. A `before_meeting` flow exists, `reminderHoursBefore=3` → reminder job scheduled for tomorrow 12pm.
4. At 12pm: processor loads the booking (still confirmed), resolves the contact's phone, sends step 1's template with the Yes/No buttons.
5. **Contact taps "Yes"** → advances to the step whose template variable is `{{meetingLink}}` → the real Meet link is sent.
6. **Contact taps "No"** → advances to the reschedule step (user's own template/message).
7. **No reply** → this flow's step 1 can optionally carry its own `timeoutBranch` (reusing the follow-up mechanism) for a "still there?" nudge — same mechanism, not a new feature.

## Testing

- Unit: `autoGenerateLink=false` never calls Zoom/Google (no behavior change for existing bookings).
- Unit: Zoom/Google API failure during booking creation doesn't throw — booking still saves, `location` stays blank, warning logged.
- Unit: reminder job scheduling skipped when `sendAt` is already in the past.
- Unit: `{{meetingLink}}` substitution resolves correctly from the booking; literal values pass through unchanged.
- Unit: processor no-ops on a cancelled/altered booking.
- Manual: cancel a booking after its reminder job is scheduled — confirm no message is sent.

## Out of Scope (YAGNI)

- SMS/email fallback when no phone is available.
- Per-meeting-type override of `reminderHoursBefore` (flow-level setting only, in v1).
- Multi-concurrent-booking flow-state handling (see Known Limitation).
- Automatic reschedule flow (the "No" branch message is authored by the user; no reschedule-booking UI is built here).
