# Mobile Enhancements — Phase 1: Backend Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the backend so push notifications respect granular per-category preferences + quiet hours, notifications are tagged by source, the social inbox exposes setter/closer, and a workspace can store a custom logo URL — the foundation every later mobile/web phase reads from.

**Architecture:** Reuse the existing preference seam. `User.preferences` (JSONB) already holds `notifications.push` (a `key → boolean` map) and `sendPushToUser` already skips a push when its key is `false`. We (a) switch the gate to a fine-grained **category** string, (b) add a **quiet-hours** check, (c) thread a `category` through notification creation, (d) fire category-tagged notifications from lead/payment/contract/social-message events, (e) add setter/closer to the meta-messaging inbox payload, and (f) add a workspace branding endpoint. All new data is JSONB — no destructive migrations.

**Tech Stack:** NestJS 10, TypeORM (PostgreSQL/Neon), Jest. Spec: `docs/superpowers/specs/2026-07-13-mobile-app-enhancements-design.md`.

## Global Constraints

- **No destructive migrations.** New data lives in existing JSONB columns (`User.preferences`, `Workspace.settings`, `Notification.metadata`). Do not add/alter enum columns.
- **Backward compatible.** Missing preferences ⇒ treat as all-enabled (never suppress a push when prefs are absent).
- **Never break existing sends.** `sendPushToUser` must keep working for callers that pass no `category`.
- **Run backend typecheck after each task:** `cd backend && npx tsc --noEmit` (must be clean).
- **Category keys (verbatim):** `lead:typeform`, `lead:social`, `lead:manual`, `payment:received`, `payment:failed`, `payment:contract`, `message:instagram`, `message:facebook`, `message:whatsapp`, `task`, `call`.
- **Preferences shape (verbatim):** `user.preferences.notifications = { push: Record<categoryKey, boolean>, quietHours?: { enabled: boolean; start: string; end: string; timezone: string } }` where `start`/`end` are `"HH:MM"` 24h strings.

---

## File Structure

- `backend/src/notifications/quiet-hours.ts` **(new)** — pure `isWithinQuietHours(quietHours, now)` helper (isolated, unit-tested, no deps).
- `backend/src/notifications/push-notification.service.ts` **(modify)** — accept `category`, gate on category + quiet hours.
- `backend/src/notifications/notifications.service.ts` **(modify)** — `CreateNotificationDto.category`, pass it to push; add typed helpers to emit category-tagged notifications.
- `backend/src/notifications/notifications.controller.ts` **(modify)** — `GET/PUT /notifications/preferences`.
- `backend/src/notifications/dto/notification-preferences.dto.ts` **(new)** — request DTO for PUT preferences.
- `backend/src/integrations/meta-messaging/meta-messaging.service.ts` **(modify)** — inbound IG/FB → emit `message:instagram|facebook`; add setter/closer to `getInbox` conversation payload.
- `backend/src/integrations/whatsapp/whatsapp.service.ts` **(modify)** — inbound WhatsApp → emit `message:whatsapp`.
- lead-source + payment/contract trigger sites (located in Task 5/6).
- `backend/src/workspaces/workspaces.controller.ts` + `workspaces.service.ts` **(modify)** — `PUT /workspaces/current/branding`.

---

## Task 1: Quiet-hours helper

**Files:**
- Create: `backend/src/notifications/quiet-hours.ts`
- Test: `backend/src/notifications/quiet-hours.spec.ts`

**Interfaces:**
- Produces: `export interface QuietHours { enabled: boolean; start: string; end: string; timezone: string }` and `export function isWithinQuietHours(q: QuietHours | undefined | null, now?: Date): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/notifications/quiet-hours.spec.ts
import { isWithinQuietHours } from './quiet-hours';

// Build a Date whose wall-clock time in the given IANA tz is hh:mm.
function atTz(tz: string, hh: number, mm: number): Date {
  // 2026-06-15 is DST-active for Europe/Bucharest; pick a fixed day.
  const iso = `2026-06-15T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  // Interpret iso as wall time in tz by measuring tz offset at that instant.
  const asUtc = new Date(iso + 'Z');
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(asUtc).find((p) => p.type === 'timeZoneName')!.value; // e.g. "GMT+3"
  const offsetH = Number(tzName.replace('GMT', '')) || 0;
  return new Date(asUtc.getTime() - offsetH * 3600 * 1000);
}

describe('isWithinQuietHours', () => {
  const tz = 'Europe/Bucharest';
  it('returns false when disabled or missing', () => {
    expect(isWithinQuietHours(undefined)).toBe(false);
    expect(isWithinQuietHours({ enabled: false, start: '22:00', end: '08:00', timezone: tz })).toBe(false);
  });
  it('handles an overnight window (22:00–08:00)', () => {
    const q = { enabled: true, start: '22:00', end: '08:00', timezone: tz };
    expect(isWithinQuietHours(q, atTz(tz, 23, 30))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 2, 0))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 7, 59))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 8, 0))).toBe(false);
    expect(isWithinQuietHours(q, atTz(tz, 12, 0))).toBe(false);
  });
  it('handles a same-day window (13:00–14:00)', () => {
    const q = { enabled: true, start: '13:00', end: '14:00', timezone: tz };
    expect(isWithinQuietHours(q, atTz(tz, 13, 30))).toBe(true);
    expect(isWithinQuietHours(q, atTz(tz, 14, 1))).toBe(false);
    expect(isWithinQuietHours(q, atTz(tz, 9, 0))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/notifications/quiet-hours.spec.ts`
Expected: FAIL — `Cannot find module './quiet-hours'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/notifications/quiet-hours.ts
export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  timezone: string; // IANA, e.g. "Europe/Bucharest"
}

function minutesInTz(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hh * 60 + mm;
}

function parseHm(hm: string): number {
  const [h, m] = String(hm || '').split(':').map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinQuietHours(q: QuietHours | undefined | null, now: Date = new Date()): boolean {
  if (!q || !q.enabled) return false;
  let cur: number;
  try {
    cur = minutesInTz(now, q.timezone);
  } catch {
    return false; // bad timezone → don't suppress
  }
  const start = parseHm(q.start);
  const end = parseHm(q.end);
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;      // same-day window
  return cur >= start || cur < end;                        // overnight window
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/notifications/quiet-hours.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/quiet-hours.ts backend/src/notifications/quiet-hours.spec.ts
git commit -m "feat(notifications): timezone-aware quiet-hours helper"
```

---

## Task 2: Category + quiet-hours gate in push send

**Files:**
- Modify: `backend/src/notifications/push-notification.service.ts` (the `sendPushToUser` signature + the preference-check block)
- Test: `backend/src/notifications/push-notification.service.spec.ts`

**Interfaces:**
- Consumes: `isWithinQuietHours` (Task 1).
- Produces: `sendPushToUser(userId, notification)` where `notification` gains an optional `category?: string`. Gate order: if `category` present and `preferences.notifications.push[category] === false` ⇒ return (no push); else if `isWithinQuietHours(preferences.notifications.quietHours)` ⇒ return; else send as today. Absent `category`/prefs ⇒ unchanged behavior.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/notifications/push-notification.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';
import { User } from '../database/entities/user.entity';
import { DeviceToken } from '../database/entities/device-token.entity';
import { NotificationType } from '../database/entities/notification.entity';

function makeService(user: any) {
  const userRepo = { findOne: jest.fn().mockResolvedValue(user) };
  const tokenRepo = { find: jest.fn().mockResolvedValue([]) }; // no tokens → send loop is a no-op
  return { svc: null as any, userRepo, tokenRepo };
}

describe('PushNotificationService gating', () => {
  async function build(user: any) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue(user) } },
        { provide: getRepositoryToken(DeviceToken), useValue: { find: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();
    const svc = moduleRef.get(PushNotificationService);
    (svc as any).apnsEnabled = true; // pass the early "no push transport" guard
    return svc;
  }

  it('suppresses when the category is disabled', async () => {
    const user = { id: 'u1', preferences: { notifications: { push: { 'message:instagram': false } } } };
    const svc = await build(user);
    const findSpy = jest.spyOn((svc as any).deviceTokenRepository ?? {}, 'find');
    await svc.sendPushToUser('u1', { type: NotificationType.WHATSAPP, title: 't', message: 'm', category: 'message:instagram' });
    // No tokens fetched because we returned before the token query.
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('sends (reaches token query) when category enabled and outside quiet hours', async () => {
    const user = { id: 'u1', preferences: { notifications: { push: { 'message:instagram': true } } } };
    const svc = await build(user);
    const findSpy = jest.spyOn((svc as any).deviceTokenRepository, 'find');
    await svc.sendPushToUser('u1', { type: NotificationType.WHATSAPP, title: 't', message: 'm', category: 'message:instagram' });
    expect(findSpy).toHaveBeenCalled();
  });
});
```

> Note: the test reaches into `deviceTokenRepository`; keep that property name when editing the service. If the private field is named differently, adjust the spy target to match.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/notifications/push-notification.service.spec.ts`
Expected: FAIL — `category` not on the accepted type / gate not applied.

- [ ] **Step 3: Write minimal implementation** — edit `sendPushToUser`

Add `category?: string;` to the `notification` param type. Replace the existing preference-check block with:

```ts
    // Fine-grained category gate (falls back to the legacy per-type key).
    const category = notification.category || this.getPreferenceKey(notification.type);
    const notifPrefs = (user.preferences as any)?.notifications;
    if (category && notifPrefs?.push && notifPrefs.push[category] === false) {
      return;
    }
    // Quiet hours: suppress push (the in-app notification row is already saved).
    if (isWithinQuietHours(notifPrefs?.quietHours)) {
      return;
    }
```

Add the import at the top of the file:

```ts
import { isWithinQuietHours } from './quiet-hours';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/notifications/push-notification.service.spec.ts` → PASS.
Then `cd backend && npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/push-notification.service.ts backend/src/notifications/push-notification.service.spec.ts
git commit -m "feat(notifications): gate push by category + quiet hours"
```

---

## Task 3: Thread `category` through notification creation

**Files:**
- Modify: `backend/src/notifications/notifications.service.ts` (`CreateNotificationDto` + `create`)
- Test: `backend/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `sendPushToUser` now accepts `category` (Task 2).
- Produces: `CreateNotificationDto` gains `category?: string`. `create()` stores it in `metadata.category` and forwards it to `sendPushToUser`. Also new typed emitters used by later tasks:
  `notifyLead(workspaceId, userId, source: 'typeform'|'social'|'manual', title, message, link?)`,
  `notifyPayment(workspaceId, userId, kind: 'received'|'failed'|'contract', title, message, link?)`,
  `notifyMessage(workspaceId, userId, channel: 'instagram'|'facebook'|'whatsapp', title, message, metadata?)`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/notifications/notifications.service.spec.ts
import { NotificationsService } from './notifications.service';
import { NotificationType } from '../database/entities/notification.entity';

describe('NotificationsService category tagging', () => {
  it('forwards category to push and stores it in metadata', async () => {
    const saved = { id: 'n1' };
    const notifRepo = { create: (x: any) => x, save: jest.fn().mockResolvedValue(saved) };
    const push = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };
    const svc = new NotificationsService(notifRepo as any, {} as any, push as any);

    await svc.notifyMessage('ws', 'u1', 'instagram', 'New IG message', 'Hi');

    const savedArg = notifRepo.save.mock.calls[0][0];
    expect(savedArg.metadata.category).toBe('message:instagram');
    expect(savedArg.type).toBe(NotificationType.WHATSAPP); // social messages reuse the messaging type
    const pushArg = push.sendPushToUser.mock.calls[0][1];
    expect(pushArg.category).toBe('message:instagram');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/notifications/notifications.service.spec.ts`
Expected: FAIL — `notifyMessage` is not a function.

- [ ] **Step 3: Write minimal implementation**

Add `category?: string;` to `CreateNotificationDto`. In `create`, merge category into metadata and pass to push:

```ts
  async create(workspaceId: string, dto: CreateNotificationDto): Promise<Notification> {
    const metadata = { ...(dto.metadata || {}), ...(dto.category ? { category: dto.category } : {}) };
    const notification = this.notificationRepository.create({ ...dto, metadata, workspaceId });
    const saved = await this.notificationRepository.save(notification);
    this.pushNotificationService
      .sendPushToUser(dto.userId, {
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link,
        notificationId: saved.id,
        metadata,
        category: dto.category,
      })
      .catch((err) => this.logger.error(`Push error: ${err.message}`));
    return saved;
  }

  notifyLead(workspaceId: string, userId: string, source: 'typeform' | 'social' | 'manual', title: string, message: string, link?: string) {
    return this.create(workspaceId, { type: NotificationType.LEAD, userId, title, message, link, category: `lead:${source}` });
  }

  notifyPayment(workspaceId: string, userId: string, kind: 'received' | 'failed' | 'contract', title: string, message: string, link?: string) {
    return this.create(workspaceId, { type: NotificationType.SYSTEM, userId, title, message, link, category: `payment:${kind}` });
  }

  notifyMessage(workspaceId: string, userId: string, channel: 'instagram' | 'facebook' | 'whatsapp', title: string, message: string, metadata?: Record<string, any>) {
    return this.create(workspaceId, { type: NotificationType.WHATSAPP, userId, title, message, metadata, category: `message:${channel}` });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/notifications/notifications.service.spec.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/notifications.service.ts backend/src/notifications/notifications.service.spec.ts
git commit -m "feat(notifications): category-tagged create + typed emitters"
```

---

## Task 4: Preferences endpoints (GET/PUT)

**Files:**
- Create: `backend/src/notifications/dto/notification-preferences.dto.ts`
- Modify: `backend/src/notifications/notifications.controller.ts` (add routes), `backend/src/notifications/notifications.service.ts` (add `getPreferences`/`setPreferences`)
- Test: `backend/src/notifications/notification-preferences.e2e-spec.ts` (light controller test via service)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  `GET /notifications/preferences` → `{ push: Record<string, boolean>; quietHours?: QuietHours }` (defaults: `{}`, no quietHours).
  `PUT /notifications/preferences` body `{ push?: Record<string, boolean>; quietHours?: QuietHours }` → persists into `user.preferences.notifications`, returns the merged result.
  Service: `getPreferences(userId)`, `setPreferences(userId, dto)` on a `userRepository` (inject `@InjectRepository(User)` into `NotificationsService`).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/notifications/notification-preferences.e2e-spec.ts
import { NotificationsService } from './notifications.service';

describe('preferences persistence', () => {
  it('merges push map + quietHours into user.preferences.notifications', async () => {
    const user = { id: 'u1', preferences: { theme: 'dark' } };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
    };
    const svc = new NotificationsService({} as any, {} as any, {} as any, userRepo as any);
    const res = await svc.setPreferences('u1', {
      push: { 'lead:typeform': false },
      quietHours: { enabled: true, start: '22:00', end: '08:00', timezone: 'Europe/Bucharest' },
    });
    expect(res.push['lead:typeform']).toBe(false);
    expect(res.quietHours.enabled).toBe(true);
    // theme preserved, notifications nested under preferences
    expect(userRepo.save.mock.calls[0][0].preferences.theme).toBe('dark');
    expect(userRepo.save.mock.calls[0][0].preferences.notifications.push['lead:typeform']).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/notifications/notification-preferences.e2e-spec.ts`
Expected: FAIL — `setPreferences` is not a function / constructor arity mismatch.

- [ ] **Step 3: Write minimal implementation**

Inject the User repo into `NotificationsService` (add constructor param `@InjectRepository(User) private userRepository: Repository<User>` — import `User` from `../database/entities/user.entity`). Add:

```ts
  async getPreferences(userId: string): Promise<{ push: Record<string, boolean>; quietHours?: any }> {
    const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id', 'preferences'] });
    const n = (user?.preferences as any)?.notifications || {};
    return { push: n.push || {}, quietHours: n.quietHours };
  }

  async setPreferences(userId: string, dto: { push?: Record<string, boolean>; quietHours?: any }) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const prefs: any = { ...(user.preferences || {}) };
    const notifications = { ...(prefs.notifications || {}) };
    if (dto.push) notifications.push = { ...(notifications.push || {}), ...dto.push };
    if (dto.quietHours !== undefined) notifications.quietHours = dto.quietHours;
    prefs.notifications = notifications;
    user.preferences = prefs;
    await this.userRepository.save(user);
    return { push: notifications.push || {}, quietHours: notifications.quietHours };
  }
```

Create the DTO:

```ts
// backend/src/notifications/dto/notification-preferences.dto.ts
export class QuietHoursDto {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
}
export class UpdateNotificationPreferencesDto {
  push?: Record<string, boolean>;
  quietHours?: QuietHoursDto;
}
```

Add controller routes (mirror the existing guard/`@Req()` pattern already used in the file):

```ts
  @Get('preferences')
  async getPreferences(@Req() req: any) {
    return this.notificationsService.getPreferences(req.user.id);
  }

  @Put('preferences')
  async updatePreferences(@Req() req: any, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationsService.setPreferences(req.user.id, dto);
  }
```

Import `Put`, `Body` from `@nestjs/common` and the DTO. Ensure `TypeOrmModule.forFeature([...])` in `notifications.module.ts` includes `User`.

- [ ] **Step 4: Run test + typecheck**

Run: `cd backend && npx jest src/notifications/notification-preferences.e2e-spec.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/dto/notification-preferences.dto.ts backend/src/notifications/notifications.controller.ts backend/src/notifications/notifications.service.ts backend/src/notifications/notification-preferences.e2e-spec.ts backend/src/notifications/notifications.module.ts
git commit -m "feat(notifications): GET/PUT preferences endpoints"
```

---

## Task 5: Source-tagged lead + payment/contract notifications

**Files:**
- Modify: the lead/contact creation path and the payment/contract paths to call the Task 3 emitters.
- Test: co-located `.spec.ts` for whichever service method now emits.

**Interfaces:**
- Consumes: `notifyLead`, `notifyPayment` (Task 3).

- [ ] **Step 1: Locate the trigger sites**

Run and read:
```bash
cd backend
grep -rnE "ContactSource|source:|create\(.*[Cc]ontact|leadsService|notificationsService" src/contacts src/leads 2>/dev/null | grep -iE "create|source" | head
grep -rnE "payment|invoice|failed|contract|signed" src/payments src/documents 2>/dev/null | grep -iE "status|failed|signed|paid" | head
```
Identify: (a) the method that creates a contact/lead (to map `contact.source` → `typeform`/`social`/`manual`), (b) payment success/failure handler, (c) contract-signed handler.

- [ ] **Step 2: Write the failing test** (example for the lead path — adapt the service/mock names to what Step 1 found)

```ts
// e.g. backend/src/leads/leads.notify.spec.ts
// Assert: creating a contact whose source is TYPEFORM calls notifyLead(ws, ownerId, 'typeform', ...).
// Mock NotificationsService and assert the emitter is called with the mapped source.
```

Mapping rule (implement as a small pure helper next to the trigger):
```ts
function leadSource(contactSource: string): 'typeform' | 'social' | 'manual' {
  const s = String(contactSource || '').toLowerCase();
  if (s.includes('typeform')) return 'typeform';
  if (['facebook', 'instagram', 'whatsapp', 'meta', 'social'].some((k) => s.includes(k))) return 'social';
  return 'manual';
}
```

- [ ] **Step 3: Run test to verify it fails**, **Step 4: implement the emitter calls**, **Step 5: run to pass**

- On contact/lead create: `await this.notificationsService.notifyLead(workspaceId, ownerId, leadSource(contact.source), 'New lead', \`${contact.firstName} ${contact.lastName}\`, \`/leads/${contact.id}\`);`
- On payment received/failed: `notifyPayment(ws, ownerId, 'received'|'failed', ...)`.
- On contract signed: `notifyPayment(ws, ownerId, 'contract', ...)`.
Run the new spec(s) → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/leads backend/src/contacts backend/src/payments backend/src/documents
git commit -m "feat(notifications): source-tagged lead + payment/contract triggers"
```

---

## Task 6: Inbound social-message notifications

**Files:**
- Modify: `backend/src/integrations/meta-messaging/meta-messaging.service.ts` (in `ingestWebhookEvent`, after a successful `saveInboundActivity`) and `backend/src/integrations/whatsapp/whatsapp.service.ts` (inbound save path).
- Test: `backend/src/integrations/meta-messaging/meta-messaging.notify.spec.ts` (assert emitter called with the right channel).

**Interfaces:**
- Consumes: `notifyMessage(ws, userId, 'instagram'|'facebook'|'whatsapp', title, message, metadata)` (Task 3). Inject `NotificationsService` (already imported via `NotificationsModule`, which meta-messaging imports).

- [ ] **Step 1: Write the failing test**

```ts
// meta-messaging.notify.spec.ts — call the inbound handler with an IG event
// and assert notifyMessage(ws, ownerId, 'instagram', ...) was invoked once.
// Mock NotificationsService; provide the other repos as jest mocks.
```

- [ ] **Step 2: fail → Step 3: implement → Step 4: pass**

After `await this.saveInboundActivity(...)` in `ingestWebhookEvent`, add (fire-and-forget, never block ingest):
```ts
    this.notificationsService
      .notifyMessage(workspaceId, ownerId, provider === 'facebook' ? 'facebook' : 'instagram',
        `New ${provider === 'facebook' ? 'Messenger' : 'Instagram'} message`,
        description,
        { channel, externalUserId: senderId, contactId: contact.id })
      .catch(() => undefined);
```
In `whatsapp.service.ts`, at the inbound-store site, call `notifyMessage(ws, ownerId, 'whatsapp', 'New WhatsApp message', preview, { waId, contactId })`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/integrations/meta-messaging/meta-messaging.service.ts backend/src/integrations/whatsapp/whatsapp.service.ts backend/src/integrations/meta-messaging/meta-messaging.notify.spec.ts
git commit -m "feat(notifications): push on inbound IG/FB/WhatsApp messages"
```

---

## Task 7: Setter/closer on the social inbox payload

**Files:**
- Modify: `backend/src/integrations/meta-messaging/meta-messaging.service.ts` (`getInbox` conversation object)
- Test: `backend/src/integrations/meta-messaging/getinbox-assignees.spec.ts`

**Interfaces:**
- Produces: each conversation in `getInbox().data` gains `setterId`, `setterName`, `closerId`, `closerName` (nullable), read from the linked `activity.contact` (which already carries `setterId`/`closerId`; join the assignee users or read cached names).

- [ ] **Step 1: Write the failing test** — build two activities for one contact that has `setterId`/`closerId`, run `getInbox`, assert the conversation exposes `setterId`/`closerId` (+ names when the user join is present).

- [ ] **Step 2: fail → Step 3: implement**

In `getInbox`, the query already `leftJoinAndSelect('activity.contact', 'contact')`. Also select the contact's setter/closer ids, and (if a relation exists) join `contact.setter`/`contact.closer`; otherwise resolve names from the workspace user list already loaded. Add to the conversation-create block:
```ts
          setterId: activity.contact?.setterId || null,
          setterName: getUserName(activity.contact?.setter) || null,
          closerId: activity.contact?.closerId || null,
          closerName: getUserName(activity.contact?.closer) || null,
```
Add a local `getUserName(u)` helper (`[firstName, lastName].filter(Boolean).join(' ') || u?.email || null`). If `contact.setter`/`closer` relations aren't loaded, extend the query builder to `leftJoinAndSelect('contact.setter','setter').leftJoinAndSelect('contact.closer','closer')` (verify those relation names on the Contact entity first; if the columns are plain `setterId` without relations, return ids only and let the frontend map names from the team list).

- [ ] **Step 4: pass**, **Step 5: Commit**

```bash
git add backend/src/integrations/meta-messaging/meta-messaging.service.ts backend/src/integrations/meta-messaging/getinbox-assignees.spec.ts
git commit -m "feat(meta-inbox): expose setter/closer on conversations"
```

---

## Task 8: Workspace branding (logo) endpoint

**Files:**
- Modify: `backend/src/workspaces/workspaces.controller.ts`, `backend/src/workspaces/workspaces.service.ts`
- Test: `backend/src/workspaces/workspaces.branding.spec.ts`

**Interfaces:**
- Produces: `PUT /workspaces/current/branding` body `{ brandLogoUrl: string | null }` (admin-only), stores into `workspace.settings.brandLogoUrl`, returns the updated settings. `GET` current workspace already returns `settings` so no read endpoint is needed.

- [ ] **Step 1: Write the failing test**

```ts
// workspaces.branding.spec.ts
// setBranding(workspaceId, 'https://cdn/logo.png') merges into settings.brandLogoUrl
// without dropping other settings keys; null clears it.
```

- [ ] **Step 2: fail → Step 3: implement**

```ts
  async setBranding(workspaceId: string, brandLogoUrl: string | null) {
    const ws = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!ws) throw new NotFoundException('Workspace not found');
    ws.settings = { ...(ws.settings || {} as any), brandLogoUrl: brandLogoUrl || undefined };
    await this.workspaceRepository.save(ws);
    return ws.settings;
  }
```

Controller (reuse the existing admin guard + `@Req()` workspace pattern in the file):
```ts
  @Put('current/branding')
  async setBranding(@Req() req: any, @Body() body: { brandLogoUrl: string | null }) {
    return this.workspacesService.setBranding(req.user.workspaceId, body.brandLogoUrl);
  }
```
Actual logo upload uses the existing `/upload` endpoint on the client; this endpoint only stores the resulting URL.

- [ ] **Step 4: pass + typecheck**, **Step 5: Commit**

```bash
git add backend/src/workspaces/workspaces.controller.ts backend/src/workspaces/workspaces.service.ts backend/src/workspaces/workspaces.branding.spec.ts
git commit -m "feat(workspaces): brand logo URL endpoint"
```

---

## Phase 1 Self-Review checklist (run before handing off)

- [ ] `cd backend && npx tsc --noEmit` clean; `npx jest src/notifications` green.
- [ ] Spec coverage: prefs model (T2–4), quiet hours (T1–2), source-tagged triggers (T5–6), setter/closer (T7), branding (T8). ✅
- [ ] Backward-compat: no `category`/prefs ⇒ push still sent (verify the gate only suppresses on explicit `=== false` / `enabled` quiet window).
- [ ] No enum/column migrations added (all JSONB).

## Next phases (separate plans, after Phase 1 lands)
Phase 2 mobile notifications UI · Phase 3 chat redesign (Direction C) · Phase 4 media composer · Phase 5 setter/closer filters (mobile+web) · Phase 6 white-label logo + web↔mobile account sync. Each gets its own `docs/superpowers/plans/…` file grounded in the then-current code.
