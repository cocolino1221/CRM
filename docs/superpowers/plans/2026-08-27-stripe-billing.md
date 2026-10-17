# Stripe Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EasyTeam CRM sellable self-serve — a real 14-day trial, enforced plans, Stripe checkout, and a SmartBill fiscal invoice on every payment.

**Architecture:** Stripe owns subscription state; webhooks are the only writer of `workspace.settings.billing`, which every request reads locally. A `SubscriptionGuard` refuses writes with HTTP 402 when a workspace has lapsed, while all reads stay open. SmartBill issues the fiscal document downstream of `invoice.paid`, in a retryable job that can never fail the webhook.

**Tech Stack:** NestJS 11, TypeORM + Postgres, `@nestjs/schedule` (already installed), Jest, Next.js 14 App Router, axios, `stripe` Node SDK (to add), Fly.io app `slackcrm-backend`.

**Spec:** `docs/superpowers/specs/2026-08-27-stripe-billing-design.md`

## Global Constraints

- Multi-tenancy is by `workspaceId`. Every query in this plan filters on it.
- `settings.billing.package` (`starter|growth|scale`) is authoritative. The `plan` column enum is stale — **do not touch it**.
- `workspace.settings` is a JSON column. Billing state needs **no migration**; only the idempotency table does.
- Never call Stripe synchronously on a user request path. Read the local mirror.
- Webhook handlers must be idempotent on `event.id`, enforced by a primary key, not a read-then-write check.
- Money code: no silent catches. A swallowed error here is a lost invoice.
- Do not modify `frontend/app/(dashboard)/payments/` or `backend/src/documents/` — that is the tenants' own collections feature, unrelated to SaaS billing.
- Romanian user-facing copy; English code, comments and commits.

## Prerequisites (human, before Phase 3)

Phases 1 and 2 need none of this. Phase 3 is blocked until:

1. Stripe account live, in EUR, with Stripe Tax enabled.
2. Two products with monthly prices: Starter €99, Growth €249. Copy the price IDs.
3. `.env` / Fly secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_GROWTH_MONTHLY`, `APP_PUBLIC_URL`.
4. Webhook endpoint registered at `https://slackcrm-backend.fly.dev/api/v1/billing/webhook` for: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.
5. Phase 4 only: a platform workspace holding primafisoft's SmartBill integration; put its id in `PLATFORM_BILLING_WORKSPACE_ID`.

## Decisions still open (resolve before Task 2)

- **Grace period on `past_due`:** plan assumes **7 days**.
- **Trial length:** plan assumes **14 days**.
- **Existing workspaces:** Task 2's backfill starts a real clock on live customers. Decide which get `grandfathered: true` first. The backfill script takes an explicit exclusion list.
- **Currency:** signup defaults `currency: 'USD'`; marketing sells EUR. Task 1 fixes it to `'EUR'`.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/billing/billing.constants.ts` | Trial length, grace period, package↔price maps, 402 error codes |
| `backend/src/billing/billing.module.ts` | Wiring |
| `backend/src/billing/billing.controller.ts` | `GET status`, `POST checkout-session`, `POST portal-session`, `POST webhook` |
| `backend/src/billing/billing.service.ts` | Entitlement resolution, checkout/portal creation |
| `backend/src/billing/billing-state.ts` | Pure functions: given billing state + now → allowed/denied. No I/O. |
| `backend/src/billing/trial-expiry.service.ts` | Hourly job flipping expired trials |
| `backend/src/billing/stripe-webhook.service.ts` | Event dispatch, idempotency, mirror writes |
| `backend/src/billing/billing-invoice.service.ts` | SmartBill issuance on `invoice.paid` |
| `backend/src/billing/guards/subscription.guard.ts` | Write enforcement |
| `backend/src/billing/decorators/requires-active-subscription.decorator.ts` | Opt-in marker + exempt marker |
| `backend/src/database/entities/processed-stripe-event.entity.ts` | Idempotency row |
| `backend/src/database/migrations/<ts>-AddProcessedStripeEvents.ts` | Its table |
| `frontend/lib/api.ts` | 402 branch alongside the existing 401 refresh |
| `frontend/components/billing/PaywallBanner.tsx` | The banner |

`billing-state.ts` is deliberately separate and pure — it is the decision table from the spec, and it must be testable without a database, a request, or a clock.

---

## Phase 1 — Make trials real

### Task 1: Trial length written at signup

**Files:**
- Create: `backend/src/billing/billing.constants.ts`
- Modify: `backend/src/auth/auth.service.ts` (`buildWorkspaceSettingsForNewSignup`, ~line 146)
- Test: `backend/src/auth/auth.trial.spec.ts`

**Interfaces:**
- Produces: `TRIAL_DAYS`, `GRACE_DAYS`, `addDays(from: Date, days: number): Date`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/auth/auth.trial.spec.ts
import { TRIAL_DAYS } from '../billing/billing.constants';

describe('new workspace signup — trial window', () => {
  // buildWorkspaceSettingsForNewSignup is private; exercise it through the
  // same shape the service produces. Import the service and cast to reach it.
  const build = (svc: any, pkg: 'starter' | 'growth' | 'scale' = 'starter') =>
    svc.buildWorkspaceSettingsForNewSignup(pkg);

  it('sets trialEndsAt TRIAL_DAYS in the future', () => {
    const svc: any = Object.create(require('./auth.service').AuthService.prototype);
    const before = Date.now();
    const settings = build(svc);
    const ends = new Date(settings.billing.trialEndsAt).getTime();
    const expected = before + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(ends - expected)).toBeLessThan(60_000);
  });

  it('defaults currency to EUR', () => {
    const svc: any = Object.create(require('./auth.service').AuthService.prototype);
    expect(build(svc).currency).toBe('EUR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/auth/auth.trial.spec.ts`
Expected: FAIL — `Cannot find module '../billing/billing.constants'`

- [ ] **Step 3: Create the constants**

```ts
// backend/src/billing/billing.constants.ts
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export const BILLING_ERROR = 'SUBSCRIPTION_REQUIRED' as const;
export type BillingDenialReason = 'trial_expired' | 'past_due' | 'canceled';
```

- [ ] **Step 4: Write trialEndsAt at signup**

In `auth.service.ts`, add the import and set the field inside `buildWorkspaceSettingsForNewSignup`:

```ts
import { TRIAL_DAYS, addDays } from '../billing/billing.constants';
```

```ts
      currency: 'EUR',
      // ...
      billing: {
        grandfathered: false,
        package: packageId,
        billingProvider: 'stripe' as const,
        billingStatus: 'trialing' as const,
        trialEndsAt: addDays(new Date(), TRIAL_DAYS).toISOString(),
      },
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd backend && npx jest src/auth/auth.trial.spec.ts && npx tsc --noEmit`
Expected: PASS, 0 TS errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/billing/billing.constants.ts backend/src/auth/auth.service.ts backend/src/auth/auth.trial.spec.ts
git commit -m "feat(billing): set trialEndsAt and EUR currency at signup"
```

---

### Task 2: Backfill existing trials, then expire them on a schedule

**Files:**
- Create: `backend/src/billing/billing-state.ts`
- Create: `backend/src/billing/trial-expiry.service.ts`
- Create: `backend/src/billing/billing.module.ts`
- Create: `backend/scripts/backfill-trial-ends-at.ts`
- Modify: `backend/src/app.module.ts` (register `BillingModule`)
- Test: `backend/src/billing/billing-state.spec.ts`

**Interfaces:**
- Consumes: `TRIAL_DAYS`, `GRACE_DAYS`, `addDays` from Task 1
- Produces:
  - `type BillingDecision = { allowWrites: boolean; reason?: BillingDenialReason }`
  - `decideBilling(billing: WorkspaceSettings['billing'], now: Date): BillingDecision`
  - `isTrialExpired(billing, now): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/billing/billing-state.spec.ts
import { decideBilling } from './billing-state';

const now = new Date('2026-08-27T12:00:00Z');
const iso = (d: string) => new Date(d).toISOString();

describe('decideBilling', () => {
  it('allows writes during an unexpired trial', () => {
    expect(decideBilling({ billingStatus: 'trialing', trialEndsAt: iso('2026-09-05') }, now))
      .toEqual({ allowWrites: true });
  });

  it('denies writes once the trial has passed', () => {
    expect(decideBilling({ billingStatus: 'trialing', trialEndsAt: iso('2026-08-20') }, now))
      .toEqual({ allowWrites: false, reason: 'trial_expired' });
  });

  it('allows writes while active', () => {
    expect(decideBilling({ billingStatus: 'active' }, now)).toEqual({ allowWrites: true });
  });

  it('allows writes during the past_due grace period', () => {
    expect(decideBilling({ billingStatus: 'past_due', currentPeriodEndAt: iso('2026-08-25') }, now))
      .toEqual({ allowWrites: true });
  });

  it('denies writes once grace is exhausted', () => {
    expect(decideBilling({ billingStatus: 'past_due', currentPeriodEndAt: iso('2026-08-01') }, now))
      .toEqual({ allowWrites: false, reason: 'past_due' });
  });

  it('denies writes when canceled or unpaid', () => {
    expect(decideBilling({ billingStatus: 'canceled' }, now).allowWrites).toBe(false);
    expect(decideBilling({ billingStatus: 'unpaid' }, now).allowWrites).toBe(false);
  });

  it('always allows grandfathered workspaces', () => {
    expect(decideBilling({ billingStatus: 'canceled', grandfathered: true }, now))
      .toEqual({ allowWrites: true });
  });

  it('allows writes when billing is absent (never provisioned)', () => {
    expect(decideBilling(undefined, now)).toEqual({ allowWrites: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/billing-state.spec.ts`
Expected: FAIL — `Cannot find module './billing-state'`

- [ ] **Step 3: Implement the decision table**

```ts
// backend/src/billing/billing-state.ts
import { GRACE_DAYS, addDays, BillingDenialReason } from './billing.constants';
import { WorkspaceSettings } from '../database/entities/workspace.entity';

type Billing = WorkspaceSettings['billing'];

export interface BillingDecision {
  allowWrites: boolean;
  reason?: BillingDenialReason;
}

export function isTrialExpired(billing: Billing, now: Date): boolean {
  if (!billing?.trialEndsAt) return false;
  return new Date(billing.trialEndsAt).getTime() <= now.getTime();
}

/**
 * The decision table from the spec. Pure: no I/O, no ambient clock.
 * An absent billing block means the workspace predates billing — allow it
 * rather than locking someone out on a data gap.
 */
export function decideBilling(billing: Billing, now: Date): BillingDecision {
  if (!billing) return { allowWrites: true };
  if (billing.grandfathered) return { allowWrites: true };

  switch (billing.billingStatus) {
    case 'active':
      return { allowWrites: true };

    case 'trialing':
      return isTrialExpired(billing, now)
        ? { allowWrites: false, reason: 'trial_expired' }
        : { allowWrites: true };

    case 'past_due': {
      const anchor = billing.currentPeriodEndAt ? new Date(billing.currentPeriodEndAt) : now;
      return addDays(anchor, GRACE_DAYS).getTime() > now.getTime()
        ? { allowWrites: true }
        : { allowWrites: false, reason: 'past_due' };
    }

    case 'canceled':
    case 'unpaid':
    case 'inactive':
      return { allowWrites: false, reason: 'canceled' };

    default:
      return { allowWrites: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/billing/billing-state.spec.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Add the hourly expiry job**

```ts
// backend/src/billing/trial-expiry.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { isTrialExpired } from './billing-state';

@Injectable()
export class TrialExpiryService {
  private readonly logger = new Logger(TrialExpiryService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireTrials(): Promise<void> {
    const now = new Date();
    const trialing = await this.workspaceRepository
      .createQueryBuilder('w')
      .where("w.settings->'billing'->>'billingStatus' = :status", { status: 'trialing' })
      .andWhere("w.settings->'billing'->>'trialEndsAt' IS NOT NULL")
      .getMany();

    let expired = 0;
    for (const workspace of trialing) {
      const billing = workspace.settings?.billing;
      if (!billing || billing.grandfathered) continue;
      if (!isTrialExpired(billing, now)) continue;

      workspace.settings = {
        ...workspace.settings,
        billing: { ...billing, billingStatus: 'past_due' as const },
      };
      await this.workspaceRepository.save(workspace);
      expired += 1;
      this.logger.log(`Trial expired for workspace ${workspace.id}`);
    }

    if (expired) this.logger.log(`Expired ${expired} trial(s)`);
  }
}
```

- [ ] **Step 6: Wire the module**

```ts
// backend/src/billing/billing.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { TrialExpiryService } from './trial-expiry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workspace])],
  providers: [TrialExpiryService],
  exports: [],
})
export class BillingModule {}
```

Add `BillingModule` to the `imports` array in `backend/src/app.module.ts`.

- [ ] **Step 7: Write the backfill script**

```ts
// backend/scripts/backfill-trial-ends-at.ts
// Usage: npx ts-node scripts/backfill-trial-ends-at.ts [--apply] [--exclude=id1,id2]
// Default is a dry run. Workspaces in --exclude are marked grandfathered instead.
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Workspace } from '../src/database/entities/workspace.entity';
import { TRIAL_DAYS, addDays } from '../src/billing/billing.constants';

async function main() {
  const apply = process.argv.includes('--apply');
  const excludeArg = process.argv.find(a => a.startsWith('--exclude='));
  const exclude = new Set((excludeArg?.split('=')[1] || '').split(',').filter(Boolean));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const repo = app.get<Repository<Workspace>>(getRepositoryToken(Workspace));
  const all = await repo.find();

  for (const w of all) {
    const billing = w.settings?.billing;
    if (!billing) continue;
    if (billing.trialEndsAt || billing.billingStatus !== 'trialing') continue;

    const next = exclude.has(w.id)
      ? { ...billing, grandfathered: true }
      : { ...billing, trialEndsAt: addDays(new Date(), TRIAL_DAYS).toISOString() };

    console.log(`${apply ? 'APPLY' : 'DRY'} ${w.id} ${w.name} -> ${exclude.has(w.id) ? 'grandfathered' : next.trialEndsAt}`);
    if (apply) {
      w.settings = { ...w.settings, billing: next };
      await repo.save(w);
    }
  }
  await app.close();
}
main();
```

- [ ] **Step 8: Dry-run the backfill and review the list with the owner**

Run: `cd backend && npx ts-node scripts/backfill-trial-ends-at.ts`
Expected: a printed list, no writes. **Do not pass `--apply` until the exclusion list is agreed.**

- [ ] **Step 9: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/billing backend/scripts/backfill-trial-ends-at.ts backend/src/app.module.ts
git commit -m "feat(billing): trial state machine, hourly expiry job, backfill script"
```

---

## Phase 2 — Make plans mean something

### Task 3: SubscriptionGuard and the 402 contract

**Files:**
- Create: `backend/src/billing/decorators/requires-active-subscription.decorator.ts`
- Create: `backend/src/billing/guards/subscription.guard.ts`
- Test: `backend/src/billing/guards/subscription.guard.spec.ts`

**Interfaces:**
- Consumes: `decideBilling` (Task 2), `BILLING_ERROR` (Task 1)
- Produces: `@BillingExempt()` decorator; `SubscriptionGuard` usable as a global guard

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/billing/guards/subscription.guard.spec.ts
import { ExecutionContext, PaymentRequiredException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionGuard } from './subscription.guard';

const ctx = (method: string, billing: any, handler = () => undefined): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => ({ method, workspace: { settings: { billing } } }) }),
  getHandler: () => handler,
  getClass: () => class {},
}) as any;

describe('SubscriptionGuard', () => {
  const reflector = new Reflector();
  const guard = new SubscriptionGuard(reflector);
  const expired = { billingStatus: 'trialing', trialEndsAt: '2020-01-01T00:00:00.000Z' };

  it('allows GET even when lapsed', () => {
    expect(guard.canActivate(ctx('GET', expired))).toBe(true);
  });

  it('allows POST while active', () => {
    expect(guard.canActivate(ctx('POST', { billingStatus: 'active' }))).toBe(true);
  });

  it('refuses POST when the trial expired', () => {
    expect(() => guard.canActivate(ctx('POST', expired))).toThrow(PaymentRequiredException);
  });

  it('refuses PATCH and DELETE when lapsed', () => {
    expect(() => guard.canActivate(ctx('PATCH', expired))).toThrow(PaymentRequiredException);
    expect(() => guard.canActivate(ctx('DELETE', expired))).toThrow(PaymentRequiredException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/guards/subscription.guard.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the decorator**

```ts
// backend/src/billing/decorators/requires-active-subscription.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const BILLING_EXEMPT_KEY = 'billingExempt';

/** Routes a lapsed workspace must still reach: auth, billing, health, exports. */
export const BillingExempt = () => SetMetadata(BILLING_EXEMPT_KEY, true);
```

- [ ] **Step 4: Implement the guard**

```ts
// backend/src/billing/guards/subscription.guard.ts
import { CanActivate, ExecutionContext, Injectable, PaymentRequiredException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BILLING_EXEMPT_KEY } from '../decorators/requires-active-subscription.decorator';
import { BILLING_ERROR } from '../billing.constants';
import { decideBilling } from '../billing-state';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exempt = this.reflector.getAllAndOverride<boolean>(BILLING_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return true;

    const request = context.switchToHttp().getRequest();
    if (READ_METHODS.has(request.method)) return true;

    const billing = request.workspace?.settings?.billing;
    const decision = decideBilling(billing, new Date());
    if (decision.allowWrites) return true;

    throw new PaymentRequiredException({
      statusCode: 402,
      error: BILLING_ERROR,
      reason: decision.reason,
      trialEndsAt: billing?.trialEndsAt,
      package: billing?.package,
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/billing/guards/subscription.guard.spec.ts`
Expected: PASS — 4 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/billing/guards backend/src/billing/decorators
git commit -m "feat(billing): SubscriptionGuard refusing writes with 402 when lapsed"
```

---

### Task 4: Register the guard and exempt the routes that must stay open

**Files:**
- Modify: `backend/src/app.module.ts` (register `SubscriptionGuard` as `APP_GUARD`, after `JwtAuthGuard`)
- Modify: `backend/src/auth/auth.controller.ts`, `backend/src/health/*`, `backend/src/platform-admin/platform-admin.controller.ts`, `backend/src/integrations/whatsapp/whatsapp.controller.ts` (inbound webhook), `backend/src/integrations/integrations.controller.ts` (inbound webhooks)
- Test: `backend/src/billing/guards/subscription.exempt.spec.ts`

**Interfaces:**
- Consumes: `SubscriptionGuard`, `BillingExempt` (Task 3)

> **Judgement call, flagged in the spec's open items:** inbound webhooks (WhatsApp, Meta, Typeform) are writes made *by the platform*, not by the customer. Blocking them means a lapsed customer silently loses inbound messages from their own clients. Mark them `@BillingExempt()`. Outbound sending stays blocked — that is the customer spending your Meta quota.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/billing/guards/subscription.exempt.spec.ts
import { Reflector } from '@nestjs/core';
import { BILLING_EXEMPT_KEY, BillingExempt } from '../decorators/requires-active-subscription.decorator';

describe('BillingExempt', () => {
  it('marks a handler exempt', () => {
    class C { @BillingExempt() handler() {} }
    const reflector = new Reflector();
    expect(reflector.get(BILLING_EXEMPT_KEY, C.prototype.handler)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/guards/subscription.exempt.spec.ts`
Expected: FAIL if the decorator export is wrong; PASS once Task 3 landed — then continue.

- [ ] **Step 3: Register the guard globally**

In `backend/src/app.module.ts` providers:

```ts
import { APP_GUARD } from '@nestjs/core';
import { SubscriptionGuard } from './billing/guards/subscription.guard';

// ...
    { provide: APP_GUARD, useClass: SubscriptionGuard },
```

Order matters: it must run after the JWT guard so `request.workspace` is populated.

- [ ] **Step 4: Annotate the exempt controllers**

Add `@BillingExempt()` at class level on the auth, health and platform-admin controllers, and at method level on every inbound webhook handler (`POST integrations/whatsapp/webhook`, the Meta and Typeform webhook handlers).

- [ ] **Step 5: Verify by hand against a lapsed workspace**

Set one test workspace's `trialEndsAt` into the past, then:
- `GET /api/v1/contacts` → 200
- `POST /api/v1/contacts` → 402 with `error: "SUBSCRIPTION_REQUIRED"`
- `POST /api/v1/integrations/whatsapp/webhook` → 200
- `POST /api/v1/auth/refresh` → 200

- [ ] **Step 6: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit && npx jest src/billing
git commit -am "feat(billing): enforce subscription on writes, exempt auth/health/webhooks"
```

---

### Task 5: Frontend paywall banner

**Files:**
- Modify: `frontend/lib/api.ts` (402 branch beside the existing 401 refresh)
- Create: `frontend/components/billing/PaywallBanner.tsx`
- Modify: `frontend/app/(dashboard)/layout.tsx` (render the banner)

**Interfaces:**
- Consumes: the 402 body from Task 3
- Produces: `window` event `billing:blocked` carrying `{ reason, trialEndsAt, package }`

- [ ] **Step 1: Add the 402 branch in `frontend/lib/api.ts`**

Inside the existing response interceptor's error handler, before the 401 logic:

```ts
    if (error.response?.status === 402) {
      const data: any = error.response.data ?? {};
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('billing:blocked', { detail: data }));
      }
      return Promise.reject(error);
    }
```

It must **not** redirect. The user keeps their place; only the banner appears.

- [ ] **Step 2: Create the banner**

```tsx
// frontend/components/billing/PaywallBanner.tsx
'use client';
import { useEffect, useState } from 'react';

type Detail = { reason?: string; trialEndsAt?: string; package?: string };

const MESSAGES: Record<string, string> = {
  trial_expired: 'Perioada de probă s-a încheiat. Contul este în modul doar-citire.',
  past_due: 'Ultima plată nu a putut fi procesată. Contul este în modul doar-citire.',
  canceled: 'Abonamentul este inactiv. Contul este în modul doar-citire.',
};

export function PaywallBanner() {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    const onBlocked = (e: Event) => setDetail((e as CustomEvent).detail || {});
    window.addEventListener('billing:blocked', onBlocked);
    return () => window.removeEventListener('billing:blocked', onBlocked);
  }, []);

  if (!detail) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-amber-50 border-b border-amber-300 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">
        {MESSAGES[detail.reason ?? ''] ?? 'Abonamentul necesită atenție.'}{' '}
        Datele tale sunt intacte.
      </p>
      <a
        href="/settings/billing"
        className="flex-none rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Activează abonamentul
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Render it in the dashboard layout**

Import and place `<PaywallBanner />` as the first child inside the dashboard layout's root element.

- [ ] **Step 4: Verify by hand**

With the lapsed test workspace, attempt to create a contact in the UI. Expected: the create fails, the amber banner appears, the page does not navigate away, and existing data stays visible.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/components/billing frontend/app/\(dashboard\)/layout.tsx
git commit -m "feat(billing): paywall banner driven by 402 responses"
```

---

## Phase 3 — Take money

*Blocked on the Prerequisites section above.*

### Task 6: Idempotency table

**Files:**
- Create: `backend/src/database/entities/processed-stripe-event.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-AddProcessedStripeEvents.ts`

**Interfaces:**
- Produces: `ProcessedStripeEvent` entity with `eventId` primary key

- [ ] **Step 1: Create the entity**

```ts
// backend/src/database/entities/processed-stripe-event.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_stripe_events')
export class ProcessedStripeEvent {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  eventId: string;

  @Column({ type: 'varchar', length: 128 })
  type: string;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
```

- [ ] **Step 2: Generate and inspect the migration**

Run: `cd backend && npx typeorm-ts-node-commonjs migration:generate src/database/migrations/AddProcessedStripeEvents -d src/database/data-source.ts`
Expected: a single `CREATE TABLE processed_stripe_events` with `eventId` as primary key. Confirm it touches nothing else — if it proposes unrelated drops, hand-write the migration instead.

- [ ] **Step 3: Run the migration locally and commit**

```bash
cd backend && npm run migration:run
git add backend/src/database/entities/processed-stripe-event.entity.ts backend/src/database/migrations
git commit -m "feat(billing): processed_stripe_events idempotency table"
```

---

### Task 7: Stripe client, checkout and portal sessions

**Files:**
- Modify: `backend/package.json` (add `stripe`)
- Modify: `backend/src/billing/billing.constants.ts` (price maps)
- Create: `backend/src/billing/billing.service.ts`
- Create: `backend/src/billing/billing.controller.ts`
- Modify: `backend/src/billing/billing.module.ts`
- Test: `backend/src/billing/billing.service.spec.ts`

**Interfaces:**
- Produces:
  - `priceIdForPackage(pkg: 'starter'|'growth'): string`
  - `packageForPriceId(priceId: string): 'starter'|'growth'|null`
  - `BillingService.createCheckoutSession(workspaceId, pkg): Promise<{url: string}>`
  - `BillingService.createPortalSession(workspaceId): Promise<{url: string}>`

- [ ] **Step 1: Install the SDK**

```bash
cd backend && npm install stripe
```

- [ ] **Step 2: Write the failing test for the price map**

```ts
// backend/src/billing/billing.service.spec.ts
import { priceIdForPackage, packageForPriceId } from './billing.constants';

describe('package ↔ price mapping', () => {
  beforeAll(() => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter';
    process.env.STRIPE_PRICE_GROWTH_MONTHLY = 'price_growth';
  });

  it('maps a package to its price id', () => {
    expect(priceIdForPackage('starter')).toBe('price_starter');
    expect(priceIdForPackage('growth')).toBe('price_growth');
  });

  it('maps a price id back to its package', () => {
    expect(packageForPriceId('price_growth')).toBe('growth');
    expect(packageForPriceId('price_unknown')).toBeNull();
  });

  it('refuses scale — it is not self-serve', () => {
    expect(() => priceIdForPackage('scale' as any)).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/billing.service.spec.ts`
Expected: FAIL — `priceIdForPackage is not a function`

- [ ] **Step 4: Add the maps to `billing.constants.ts`**

```ts
export type SelfServePackage = 'starter' | 'growth';

export function priceIdForPackage(pkg: SelfServePackage): string {
  const map: Record<SelfServePackage, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    growth: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
  };
  const priceId = map[pkg];
  if (!priceId) throw new Error(`No Stripe price configured for package "${pkg}"`);
  return priceId;
}

export function packageForPriceId(priceId: string): SelfServePackage | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_GROWTH_MONTHLY) return 'growth';
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest src/billing/billing.service.spec.ts`
Expected: PASS — 3 tests

- [ ] **Step 6: Implement the service**

```ts
// backend/src/billing/billing.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Workspace } from '../database/entities/workspace.entity';
import { SelfServePackage, priceIdForPackage } from './billing.constants';

@Injectable()
export class BillingService {
  private readonly stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    apiVersion: '2025-01-27.acacia',
  });

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  private async getWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async createCheckoutSession(workspaceId: string, pkg: SelfServePackage, email: string) {
    const workspace = await this.getWorkspace(workspaceId);
    const base = process.env.APP_PUBLIC_URL;
    if (!base) throw new BadRequestException('APP_PUBLIC_URL is not configured');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceIdForPackage(pkg), quantity: 1 }],
      client_reference_id: workspaceId,
      customer: workspace.settings?.billing?.stripeCustomerId || undefined,
      customer_email: workspace.settings?.billing?.stripeCustomerId ? undefined : email,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      success_url: `${base}/settings/billing?checkout=success`,
      cancel_url: `${base}/settings/billing?checkout=cancelled`,
    });

    return { url: session.url as string };
  }

  async createPortalSession(workspaceId: string) {
    const workspace = await this.getWorkspace(workspaceId);
    const customerId = workspace.settings?.billing?.stripeCustomerId;
    if (!customerId) throw new BadRequestException('No Stripe customer for this workspace yet');

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.APP_PUBLIC_URL}/settings/billing`,
    });
    return { url: session.url };
  }
}
```

- [ ] **Step 7: Add the controller**

```ts
// backend/src/billing/billing.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingExempt } from './decorators/requires-active-subscription.decorator';
import { BillingService } from './billing.service';
import { decideBilling } from './billing-state';
import { SelfServePackage } from './billing.constants';

@Controller('billing')
@UseGuards(JwtAuthGuard)
@BillingExempt()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  status(@Req() req: any) {
    const billing = req.workspace?.settings?.billing ?? null;
    return { billing, decision: decideBilling(billing, new Date()) };
  }

  @Post('checkout-session')
  checkout(@Req() req: any, @Body() body: { package: SelfServePackage }) {
    return this.billingService.createCheckoutSession(
      req.user.workspaceId,
      body.package,
      req.user.email,
    );
  }

  @Post('portal-session')
  portal(@Req() req: any) {
    return this.billingService.createPortalSession(req.user.workspaceId);
  }
}
```

Register `BillingService` and `BillingController` in `billing.module.ts`.

- [ ] **Step 8: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit && npx jest src/billing
git add backend/package.json backend/package-lock.json backend/src/billing
git commit -m "feat(billing): Stripe checkout and customer portal sessions"
```

---

### Task 8: Webhook endpoint with idempotency

**Files:**
- Create: `backend/src/billing/stripe-webhook.service.ts`
- Modify: `backend/src/billing/billing.controller.ts` (add `POST webhook`)
- Modify: `backend/src/main.ts` (raw body for the webhook path)
- Test: `backend/src/billing/stripe-webhook.spec.ts`

**Interfaces:**
- Consumes: `ProcessedStripeEvent` (Task 6), `packageForPriceId` (Task 7)
- Produces: `StripeWebhookService.handle(event: Stripe.Event): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/billing/stripe-webhook.spec.ts
import { StripeWebhookService } from './stripe-webhook.service';

describe('StripeWebhookService — idempotency', () => {
  const makeService = (insertImpl: jest.Mock) => {
    const processed = { insert: insertImpl } as any;
    const workspaces = { findOne: jest.fn(), save: jest.fn() } as any;
    return new StripeWebhookService(processed, workspaces, { issueFor: jest.fn() } as any);
  };

  it('processes an event the first time', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(insert);
    const handled = await svc.claim({ id: 'evt_1', type: 'invoice.paid' } as any);
    expect(handled).toBe(true);
    expect(insert).toHaveBeenCalled();
  });

  it('skips an event whose id was already stored', async () => {
    const insert = jest.fn().mockRejectedValue({ code: '23505' }); // unique_violation
    const svc = makeService(insert);
    const handled = await svc.claim({ id: 'evt_1', type: 'invoice.paid' } as any);
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/stripe-webhook.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement claim + dispatch**

```ts
// backend/src/billing/stripe-webhook.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { ProcessedStripeEvent } from '../database/entities/processed-stripe-event.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { BillingInvoiceService } from './billing-invoice.service';
import { packageForPriceId } from './billing.constants';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @InjectRepository(ProcessedStripeEvent)
    private readonly processedRepository: Repository<ProcessedStripeEvent>,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly invoiceService: BillingInvoiceService,
  ) {}

  /**
   * Insert-first idempotency. Two concurrent deliveries both pass a
   * read-then-write check; only one can win a primary-key insert.
   */
  async claim(event: Stripe.Event): Promise<boolean> {
    try {
      await this.processedRepository.insert({ eventId: event.id, type: event.type });
      return true;
    } catch (error: any) {
      if (error?.code === '23505') {
        this.logger.debug(`Stripe event ${event.id} already processed — skipping`);
        return false;
      }
      throw error;
    }
  }

  async handle(event: Stripe.Event): Promise<void> {
    if (!(await this.claim(event))) return;

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        await this.mirror(s.client_reference_id, {
          stripeCustomerId: String(s.customer),
          stripeSubscriptionId: String(s.subscription),
          billingStatus: 'active',
        });
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const pkg = packageForPriceId(priceId);
        await this.mirrorByCustomer(String(sub.customer), {
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          ...(pkg ? { package: pkg } : {}),
          billingStatus: this.mapStatus(sub.status),
          currentPeriodEndAt: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        await this.mirrorByCustomer(String(inv.customer), { billingStatus: 'active' });
        await this.invoiceService.issueFor(inv);
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        await this.mirrorByCustomer(String(inv.customer), { billingStatus: 'past_due' });
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }
  }

  private mapStatus(status: Stripe.Subscription.Status) {
    if (status === 'active' || status === 'trialing') return 'active' as const;
    if (status === 'past_due') return 'past_due' as const;
    if (status === 'unpaid') return 'unpaid' as const;
    return 'canceled' as const;
  }

  private async mirror(workspaceId: string | null, patch: Record<string, unknown>) {
    if (!workspaceId) return;
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) return;
    workspace.settings = {
      ...workspace.settings,
      billing: { ...(workspace.settings?.billing ?? {}), ...patch } as any,
    };
    await this.workspaceRepository.save(workspace);
  }

  private async mirrorByCustomer(customerId: string, patch: Record<string, unknown>) {
    const workspace = await this.workspaceRepository
      .createQueryBuilder('w')
      .where("w.settings->'billing'->>'stripeCustomerId' = :customerId", { customerId })
      .getOne();
    if (!workspace) {
      this.logger.warn(`No workspace for Stripe customer ${customerId}`);
      return;
    }
    await this.mirror(workspace.id, patch);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/billing/stripe-webhook.spec.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Add the raw-body route**

In `backend/src/main.ts`, before the global JSON parser:

```ts
import { raw } from 'express';
app.use('/api/v1/billing/webhook', raw({ type: 'application/json' }));
```

Then in `billing.controller.ts`:

```ts
  @Post('webhook')
  @BillingExempt()
  async webhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
    const event = this.billingService.constructEvent(req.body, signature);
    await this.stripeWebhookService.handle(event);
    return { received: true };
  }
```

Add to `BillingService`:

```ts
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }
```

This route must **not** use `JwtAuthGuard` — Stripe has no token. The signature is the authentication.

- [ ] **Step 6: Verify with the Stripe CLI**

```bash
stripe listen --forward-to localhost:4000/api/v1/billing/webhook
stripe trigger checkout.session.completed
stripe trigger invoice.paid
```
Expected: workspace billing mirrors update; replaying the same event id changes nothing and still returns 200.

- [ ] **Step 7: Commit**

```bash
git add backend/src/billing backend/src/main.ts
git commit -m "feat(billing): Stripe webhook with insert-first idempotency"
```

---

## Phase 4 — Invoice properly

### Task 9: SmartBill invoice on `invoice.paid`

**Files:**
- Create: `backend/src/billing/billing-invoice.service.ts`
- Modify: `backend/src/billing/billing.module.ts` (import `SmartBillModule`)
- Test: `backend/src/billing/billing-invoice.spec.ts`

**Interfaces:**
- Consumes: `SmartBillService.createInvoice`, `SmartBillService.sendInvoiceByEmail`, `SmartBillService.lookupCompany`
- Produces: `BillingInvoiceService.issueFor(invoice: Stripe.Invoice): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/billing/billing-invoice.spec.ts
import { BillingInvoiceService } from './billing-invoice.service';

describe('BillingInvoiceService', () => {
  const invoice: any = {
    id: 'in_1', customer: 'cus_1', customer_email: 'client@firma.ro',
    amount_paid: 9900, currency: 'eur',
    customer_tax_ids: [{ type: 'eu_vat', value: 'RO12345678' }],
  };

  it('never throws when SmartBill fails — payment already succeeded', async () => {
    const smartbill: any = { createInvoice: jest.fn().mockRejectedValue(new Error('SmartBill 500')) };
    const svc = new BillingInvoiceService(smartbill, { findOne: jest.fn(), save: jest.fn() } as any);
    await expect(svc.issueFor(invoice)).resolves.toBeUndefined();
  });

  it('issues an invoice for the paid amount', async () => {
    const smartbill: any = {
      createInvoice: jest.fn().mockResolvedValue({ number: 'FCT-100' }),
      sendInvoiceByEmail: jest.fn().mockResolvedValue(undefined),
      lookupCompany: jest.fn().mockResolvedValue({ name: 'Firma SRL' }),
    };
    const workspaces: any = {
      findOne: jest.fn().mockResolvedValue({ id: 'w1', settings: { billing: {} } }),
      save: jest.fn(),
    };
    const svc = new BillingInvoiceService(smartbill, workspaces);
    await svc.issueFor(invoice);
    expect(smartbill.createInvoice).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/billing/billing-invoice.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the bridge**

```ts
// backend/src/billing/billing-invoice.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { SmartBillService } from '../smartbill/smartbill.service';
import { Workspace } from '../database/entities/workspace.entity';

@Injectable()
export class BillingInvoiceService {
  private readonly logger = new Logger(BillingInvoiceService.name);

  constructor(
    private readonly smartBillService: SmartBillService,
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  /**
   * Issue the fiscal document for a Stripe payment that already succeeded.
   * A SmartBill outage must never fail the webhook — the money is collected;
   * the invoice is a downstream obligation. Log loudly and move on.
   */
  async issueFor(invoice: Stripe.Invoice): Promise<void> {
    const platformWorkspaceId = process.env.PLATFORM_BILLING_WORKSPACE_ID;
    if (!platformWorkspaceId) {
      this.logger.error('PLATFORM_BILLING_WORKSPACE_ID is not set — cannot issue invoice');
      return;
    }

    try {
      const vatId = invoice.customer_tax_ids?.[0]?.value ?? undefined;
      const client = vatId
        ? await this.smartBillService.lookupCompany(vatId.replace(/^RO/i, ''))
        : { name: invoice.customer_name ?? invoice.customer_email ?? 'Client' };

      const created = await this.smartBillService.createInvoice(platformWorkspaceId, {
        client,
        products: [{
          name: 'Abonament EasyTeam CRM',
          price: (invoice.amount_paid ?? 0) / 100,
          currency: (invoice.currency ?? 'eur').toUpperCase(),
          quantity: 1,
        }],
      } as any);

      if (invoice.customer_email) {
        await this.smartBillService.sendInvoiceByEmail(platformWorkspaceId, {
          number: (created as any)?.number,
          to: invoice.customer_email,
        } as any);
      }

      this.logger.log(`SmartBill invoice ${(created as any)?.number} issued for ${invoice.id}`);
    } catch (error: any) {
      this.logger.error(
        `SmartBill invoice failed for Stripe invoice ${invoice.id}: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
```

> Confirm the exact `createInvoice` / `sendInvoiceByEmail` DTO shapes against `backend/src/smartbill/smartbill.controller.ts` before finalising — the `as any` casts above are placeholders for the real DTOs and must be replaced with the actual types.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/billing/billing-invoice.spec.ts`
Expected: PASS — 2 tests

- [ ] **Step 5: Full suite, typecheck, commit**

```bash
cd backend && npx jest src/billing && npx tsc --noEmit
git add backend/src/billing
git commit -m "feat(billing): issue SmartBill invoice on invoice.paid"
```

---

### Task 10: Deploy and verify in production

- [ ] **Step 1: Set Fly secrets**

```bash
flyctl secrets set -a slackcrm-backend \
  STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... \
  STRIPE_PRICE_STARTER_MONTHLY=... STRIPE_PRICE_GROWTH_MONTHLY=... \
  APP_PUBLIC_URL=https://etcrm.primafisoft.com \
  PLATFORM_BILLING_WORKSPACE_ID=...
```

- [ ] **Step 2: Deploy**

```bash
cd backend && flyctl deploy -a slackcrm-backend
```

- [ ] **Step 3: Verify the release and health**

```bash
flyctl releases -a slackcrm-backend | head -3
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://slackcrm-backend.fly.dev/api/v1/contacts
```
Expected: new version `complete`, `401` in well under a second.

- [ ] **Step 4: End-to-end with a real card in test mode**

Sign up a throwaway workspace → confirm `trialEndsAt` is set → force the trial into the past → confirm writes 402 and the banner shows → complete checkout → confirm `billingStatus: 'active'` and writes work again → confirm a SmartBill invoice exists.

- [ ] **Step 5: Watch the logs for one dunning cycle**

```bash
flyctl logs -a slackcrm-backend --no-tail | grep -i -E "billing|stripe|smartbill"
```
Expected: no unhandled errors, no repeated event ids.

---

## Self-Review

**Spec coverage:** trial (Tasks 1–2), enforcement (3–4), 402 contract and banner (3, 5), Stripe checkout/portal (7), webhooks and idempotency (6, 8), SmartBill bridge (9), delivery order preserved as phases, testing per the spec's list (unit guard matrix in 3, idempotency in 8, Stripe CLI in 8, outage isolation in 9), deploy (10). Limits enforcement (`maxUsers`, `maxWhatsAppNumbers`) is named in the spec at its own call sites — **not covered by a task here**; it is small and independent, and should be added as Task 11 or a follow-up plan rather than smuggled into the guard.

**Placeholders:** the `as any` casts in Task 9 are called out explicitly with an instruction to replace them against the real DTOs — flagged, not hidden.

**Type consistency:** `decideBilling` / `isTrialExpired` signatures match between Tasks 2, 3 and 7. `priceIdForPackage` / `packageForPriceId` match between Tasks 7 and 8. `issueFor` matches between Tasks 8 and 9. `BillingExempt` matches between Tasks 3, 4 and 7.
