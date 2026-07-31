# Test Plan — WhatsApp, Calendar & Meta Inbox

**Date:** 2026-07-31
**Scope:** Features built/modified in the current work cycle: WhatsApp auto-send + conversation flows + follow-ups + meeting reminders + block/call, Calendar event scheduling, Meta Inbox (Instagram/Facebook) lead creation, and the underlying Bull/Redis job infrastructure.
**Out of scope:** Deals, Companies, Tasks, Analytics, billing/subscriptions, mobile-app screens not touched this cycle (Leads list, Dashboard, etc.).

## 1. Objective

Verify the WhatsApp/Calendar/Meta-Inbox feature set behaves correctly under normal use and under the specific failure modes already found once in this codebase (Redis silently absent, mismatched HTTP verbs, disabled/unscoped flows, eager lead creation, blocked-contact gaps). Every bug found during development should have a permanent regression case here.

## 2. Test Environment

- **Backend:** `slackcrm-backend` on Fly.io (production — no separate staging environment exists today)
- **Frontend:** `easyteamcrm.netlify.app`
- **Mobile:** `mobile-rn` (Expo/React Native), tested via a physical device or simulator with the dev build
- **WhatsApp:** a real Meta WhatsApp Business test number with Cloud API access; at least one approved template with Quick Reply buttons and one without
- **Redis:** co-located on the backend Fly machine (post-migration) — confirm this, not Upstash, before running any scheduling test
- Needs: at least 2 test contacts (with real, reachable WhatsApp numbers) not used for any other purpose, and 2 CRM users with different roles (e.g., one `setter`/`caller`, one `closer`) to exercise "book for closer."

## 3. Entry Criteria

- Latest `main` deployed to Fly + Netlify, health checks green
- `redis-cli ping` from inside the backend machine returns `PONG` (co-located Redis reachable)
- At least one enabled Auto-Send rule and one enabled `before_meeting` flow exist in the test workspace

## 4. Exit Criteria

- All **Critical** and **High** priority cases pass
- Any failing **Medium**/**Low** case has a filed follow-up with a clear repro
- No regression case (§7) fails

## 5. Test Types Covered

Functional, negative/edge-case, integration (cross-feature), regression (known-bug), and one soak/timing check (delayed job actually firing at the right time, not just getting scheduled).

## 6. Risks & Assumptions

- No staging environment — all testing is against production with real Meta API calls. Use disposable/test contacts, and prefer the least destructive path (e.g., don't block a real customer to test blocking).
- Delayed-job tests (follow-ups, reminders) take real wall-clock time (minutes) to observe; can't be fast-forwarded.
- WhatsApp's 24-hour session window means some tests only produce the expected result within (or outside) that window — see cases that call this out explicitly.

---

## 7. Test Cases

### 7.1 WhatsApp Auto-Send

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| AS-01 | Auto-send fires for a matching new contact | Auto-send rule enabled, conditions match a test source (e.g. `typeform`) | Create a new contact via that source with a valid phone | Template message sent within seconds; outbound activity recorded with `messageStatus` eventually `sent`/`delivered` | Critical |
| AS-02 | Auto-send skipped — no matching rule | No rule matches the contact's source/status | Create a contact from an unmatched source | No message sent; log shows "no matching enabled rule"; no error surfaced to user | High |
| AS-03 | Auto-send skipped — invalid/missing phone | Contact has no phone or an unparseable one | Create such a contact from a matching source | No message sent, no crash; contact still created normally | High |
| AS-04 | Auto-send skipped — contact is blocked | Contact's WhatsApp number is on the blocked list (see §7.5) | Create/re-trigger a matching contact whose number is blocked | No message sent; log explicitly shows "is blocked" | Critical |
| AS-05 | Two enabled rules, priority order respected | Two rules both match the same contact, different `priority` | Trigger auto-send for that contact | Only the lower-`priority`-number (higher priority) rule's template is sent, not both | Medium |

### 7.2 Conversation Flows

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| CF-01 | `first_message` flow triggers once per new contact | Flow enabled, trigger = first_message | Send an inbound message from a contact with no prior WhatsApp history | Flow's Step 1 template sends; replying with a Quick Reply button advances to the mapped next step | Critical |
| CF-02 | `first_message` does not re-trigger for a returning contact | Same contact as CF-01 already has history | Send another inbound message later | Flow does not restart from Step 1 | High |
| CF-03 | `keyword` flow matches a configured keyword | Flow enabled, trigger = keyword, e.g. "menu" | Send "menu" as a fresh inbound text | Flow starts | High |
| CF-04 | Step timeout branch fires when no reply | Any flow step has "No-reply follow-up" configured (e.g. 3 minutes) | Get the flow to that step, don't reply, wait past the delay | The mapped next step sends automatically at (or shortly after) the delay | Critical |
| CF-05 | Step timeout branch is cancelled by a reply | Same setup as CF-04 | Reply (button or matched text) before the delay elapses | Only the button's mapped step sends; the timeout's step never fires afterward | Critical |
| CF-06 | Unmatched reply during an active flow stops the sequence | Contact is mid-flow with a timeout branch armed | Reply with unrelated free text that matches no button/keyword | Flow state clears, no further automated message sends, follow-up job is cancelled | High |
| CF-07 | Template-mode on a step 2+ works | A non-Step-1 step is set to Template mode with an approved template | Reach that step | The approved template sends (works even outside the 24h session window — see WA-01) | Medium |
| CF-08 | Step-1 template required (non-`after_auto_send` triggers) | Any flow with trigger `first_message`/`keyword`/`before_meeting`, Step 1 has no template selected | Attempt to save the flow | Save is rejected with "Step 1 must have an approved template selected" | Medium |

### 7.3 No-Reply-After-Auto-Send Flow (regression-heavy area)

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| NRAS-01 | Flow arms silently after a matching auto-send | Flow enabled, trigger = `after_auto_send`, no rule scoping set | Trigger a matching auto-send | Log shows "Flow armed after auto-send"; **no** message sends immediately (Step 1 is a placeholder) | Critical |
| NRAS-02 | Delay fires and sends Step 2 if no reply | Continue from NRAS-01 | Wait past the configured delay without replying | Step 2's message sends | Critical |
| NRAS-03 | Reply before the delay cancels Step 2 | Continue from NRAS-01 | Reply before the delay elapses | Step 2 never sends | Critical |
| NRAS-04 | Rule-scoped flow ignores auto-sends from other rules | Flow's `autoSendRuleId` set to Rule A only | Trigger an auto-send via Rule B | Flow does **not** arm | High |
| NRAS-05 | Disabled flow never arms | Flow `enabled: false` | Trigger a matching auto-send | Nothing happens, no log entry for this flow | High |
| NRAS-06 | Save blocked without a configured delay | Trigger = `after_auto_send`, Step 1 has no "No-reply follow-up" set | Attempt to save | Save rejected: "Step 1 needs 'No-reply follow-up' configured..." | Medium |

### 7.4 Meeting Reminders (Calendar → WhatsApp)

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| MR-01 | Hours-before reminder sends at the right time | Event created with a linked contact, reminder enabled, mode = hours-before (e.g. 1h) | Wait until ~1h before start | Reminder template sends around that time | Critical |
| MR-02 | Fixed-time reminder sends at the configured clock time | Same event, mode = fixed-time (e.g. 07:00) | Wait until that time on the meeting's date | Reminder sends at 07:00, not relative to meeting start | Critical |
| MR-03 | Fixed time after meeting start is rejected | Mode = fixed-time, fixed time later than meeting start | Attempt to save | Frontend blocks with "reminder time must be earlier than the meeting start time" | High |
| MR-04 | Reminder disabled per-event | Toggle off for one specific event, flow otherwise enabled | Reach the reminder time | No message sends for this event | High |
| MR-05 | Editing event date reschedules the reminder | Event with reminder already scheduled | Change the event's date/time, save | Old scheduled job is superseded; new reminder time reflects the updated event | High |
| MR-06 | Cancelling/deleting the event cancels the reminder | Event with reminder scheduled | Delete the event before the reminder fires | No reminder sends | Critical |
| MR-07 | Past-date event cannot be created | New event | Attempt to pick yesterday's date | Blocked client-side (date picker `min`) and server-side (400 if bypassed) | High |
| MR-08 | Today (same-day) event is allowed | New event | Pick today's date, a future time | Event saves successfully | Medium |
| MR-09 | Editing a historical (already-past) event still works | An event whose date is now in the past | Open it, change only the description, save | Save succeeds (past-date block applies to creation only) | Medium |
| MR-10 | **[Known gap, not yet fixed]** Blocked contact still receives a meeting reminder | Contact is blocked; has a linked upcoming event with reminder enabled | Reach the reminder time | *Currently* the reminder still sends — flag as fail until the gap in §"Bugs encountered" item 8 is closed | Critical (expected-fail today) |

### 7.5 Block & Call

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| BC-01 | Blocking a contact calls Meta's block API | Valid WhatsApp integration credentials | Click Block on a conversation, confirm | `POST .../block_users` succeeds; contact shows "Blocked" badge in header | Critical |
| BC-02 | Blocked contact cannot be auto-sent to again | Contact blocked per BC-01 | Re-trigger a matching auto-send condition | Skipped, see AS-04 | Critical |
| BC-03 | Unblocking restores normal behavior | Contact blocked | Click Unblock | Meta `DELETE .../block_users` called; auto-send resumes working for this contact | High |
| BC-04 | Block confirmation dialog can be cancelled | Any conversation | Click Block, then Cancel in the confirm dialog | No API call made, contact remains unblocked | Medium |
| BC-05 | Meta API failure during block still applies the local flag | Simulate/observe a Meta API error (e.g. invalid token) | Attempt to block | Warning logged, but local `conversationBlockedMap` still updated so auto-send stops even if the platform-level block failed | Medium |
| BC-06 | Call button opens the device dialer | Any conversation with a phone number | Tap/click Call | `tel:` link invoked; no crash if no calling app is registered (web) | Low |
| BC-07 | Mobile block flow mirrors web | Mobile app, same contact | Toggle Block from `ChatScreen` | Same behavior as BC-01–03, persisted server-side, reflected next time inbox is fetched | High |

### 7.6 Meta Inbox (Instagram/Facebook) Lead Creation

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| MI-01 | Inbound IG/FB message does **not** auto-create a contact | Brand-new sender, never messaged before | Send an inbound message via Instagram or Messenger | Conversation appears in inbox with no linked contact; "Not added as lead yet" + "Add to Lead" button shown | Critical |
| MI-02 | "Add to Lead" creates the contact and links history | Continue from MI-01, sender has sent 2+ messages before clicking | Click "Add to Lead" | Contact created; success message shows linked-activity count > 0; all prior messages now show under this contact | Critical |
| MI-03 | Setter can reply before adding to lead | Continue from MI-01 (not yet added) | Send a reply from the CRM | Reply sends successfully without requiring a contact to exist | High |
| MI-04 | Conversation list shows contact-less conversations correctly | Multiple conversations, some added, some not | Load the inbox | No crash/blank rows for contact-less conversations; display name falls back to "Instagram/Messenger <id>" | High |
| MI-05 | Adding to lead twice is idempotent | Contact already added (MI-02 done) | Click "Add to Lead" again if the button is still reachable | No duplicate contact created; same contact returned/linked | Low |

### 7.7 Calendar — Contact Search & Book-for-Closer

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| CAL-01 | Contact search returns matches by name/phone/email | 2000+ contacts exist | Type a partial name in the event modal's contact field | Debounced search (~300ms) returns matching results, not the full list | High |
| CAL-02 | No results shows a clear empty state | Search a string matching nobody | Type it | "No contacts found" shown, no crash | Medium |
| CAL-03 | Setter/caller can book an event for a closer | Logged in as setter/caller, closers exist in workspace | Create event, choose a closer in "Book for" | Event's organizer is the chosen closer, not the logged-in user (`POST /events/schedule-for/:userId`) | High |
| CAL-04 | Deleting an event from the modal works | Existing event, open for edit | Click Delete, confirm | Event removed from calendar; any scheduled reminder is cancelled (see MR-06) | High |
| CAL-05 | Deleting from the modal can be cancelled | Existing event | Click Delete, cancel the browser confirm | Event remains, modal stays open | Medium |
| CAL-06 | Clicking an event in the month grid opens it for editing | Any day with an event | Click the event chip | Edit modal opens pre-filled, not a "new event" modal for that day | Medium |

### 7.8 Infrastructure — Bull Queues & Redis

| ID | Title | Preconditions | Steps | Expected Result | Priority |
|----|-------|--------------|-------|------------------|----------|
| INF-01 | Backend boots cleanly against co-located Redis | Fresh deploy | Check boot logs | `Nest application successfully started`, no Redis connection errors/warnings | Critical |
| INF-02 | Exactly 2 Bull queues exist, not 9 | Same | `redis-cli keys "bull:*"` from inside the machine | Only `background-jobs` and `scheduled-tasks` prefixes appear | High |
| INF-03 | A background-jobs job still processes correctly | Trigger any job routed there (e.g. an email send, a data export) | Observe | Job completes; result unaffected by the queue rename | High |
| INF-04 | A scheduled-tasks job still processes correctly | Trigger a WhatsApp follow-up, meeting reminder, or campaign dispatch | Observe | Job fires at the correct delayed time | Critical |
| INF-05 | Redis data survives a deploy | Some job scheduled but not yet due | Run `flyctl deploy` (any innocuous change) | After redeploy, the job is still pending and still fires at its original time — **not yet actually verified end-to-end, do this first** | Critical |
| INF-06 | Redis is not reachable from outside the machine | Co-located Redis, bound to 127.0.0.1 | Attempt to connect from outside (e.g. `redis-cli -h slackcrm-backend.fly.dev`) | Connection refused/times out — confirms it's not exposed | Medium |

---

## 8. Traceability — Bugs Encountered → Regression Cases

| Bug (from this work cycle) | Covered by |
|---|---|
| Redis never configured in production (jobs silently never fired) | INF-01, INF-04, INF-05, CF-04, NRAS-02, MR-01 |
| Calendar update used PATCH, backend only had PUT | CAL-04 (delete-then-update round trip exercises the same edit path) — add a dedicated "edit and save an existing event" case if not already covered elsewhere |
| `after_auto_send` Step 1 wrongly required a template | NRAS-06 |
| Flow silently left disabled | NRAS-05 |
| No Auto-Send-rule scoping, catching unintended contacts | NRAS-04 |
| Instagram/Facebook auto-creating leads before setter decided | MI-01, MI-02, MI-03 |
| 9 Bull queues burning Redis quota | INF-02 |
| Blocked contact still gets meeting reminders | MR-10 (currently expected to fail — tracks the open gap) |

## 9. Open Items Before Sign-Off

1. **Run INF-05 for real** — no test has yet confirmed data survives an actual deploy; do this before relying on it.
2. **Decide on MR-10** — either fix (blocked-check in `scheduleMeetingReminder`/flow-arming) or explicitly accept the gap; don't leave it silently unverified.
3. Add a dedicated "edit an existing Calendar event and save" case explicitly targeting the PUT vs PATCH class of bug (verb correctness), independent of CAL-04.
