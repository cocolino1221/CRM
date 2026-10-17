# Stripe Subscription Billing — Design

**Date:** 2026-08-27
**Status:** Design (approved in chat, pending spec review)
**Author:** Constantin Pristavita (with Claude)

## Goal

Let EasyTeam CRM be sold self-serve: a prospect signs up, gets a real
14-day trial, pays by card, and keeps a working workspace — with the
fiscal invoice issued through SmartBill, as Romanian law requires.

Today none of that exists. The data model anticipates it, but nothing
creates a Stripe customer, nothing ends a trial, and nothing enforces a
plan. This design closes those three gaps.

## Decisions (locked)

1. **Self-serve.** Prospect signs up, picks a plan, pays by card, workspace
   is provisioned automatically. No sales step for Starter and Growth.
2. **Trial without a card.** 14 days, no payment details collected up front.
3. **Read-only on lapse.** When a trial expires or a payment fails past its
   grace period, the workspace keeps every byte of data and every read path,
   but all writes are refused.
4. **Stripe owns subscription state; the app mirrors it.** Webhooks are the
   only writer of billing state. No Stripe call ever sits on a request path.
5. **Stripe collects, SmartBill invoices.** Stripe handles the card and the
   subscription lifecycle. The fiscal document is a SmartBill invoice.
6. **Scale is not self-serve.** The pricing page keeps "Custom" and a contact
   button. Only Starter and Growth have checkout.

## Grounding facts (verified in codebase)

These were read, not assumed:

- `backend/src/database/entities/workspace.entity.ts` — `WorkspaceSettings.billing`
  already declares `grandfathered`, `package: 'legacy'|'starter'|'growth'|'scale'`,
  `billingProvider: 'manual'|'stripe'`, `billingStatus: 'inactive'|'trialing'|'active'|
  'past_due'|'canceled'|'unpaid'`, `stripeCustomerId`, `stripeSubscriptionId`,
  `stripePriceId`, `trialEndsAt`, `currentPeriodEndAt`. **No migration is needed
  for billing state** — `settings` is a JSON column and every field exists.
- `backend/src/auth/auth.service.ts:146` — signup already writes
  `billingProvider: 'stripe'`, `billingStatus: 'trialing'`, and a `package`.
- `backend/src/auth/auth.service.ts:134` — per-package limits already exist:
  starter `{maxUsers: 8, maxWhatsAppNumbers: 1}`, growth `{25, 3}`,
  scale `{null, 10}`.
- **`trialEndsAt` is never written.** The field is declared and read nowhere.
  Trials currently never end.
- **Nothing enforces anything.** A search for `billingStatus`, `maxUsers`,
  `maxWhatsAppNumbers` and the `features` flags outside the entity and
  platform-admin returns only writes and reads-for-display. There is no
  `subscription.guard.ts`. Existing guards: `platform-admin`, `roles`,
  `workspace`, `jwt-auth`, `optional-jwt-auth`, `mcp`, `strict-throttle`.
- **Stripe appears nowhere** — not in `backend/package.json`, not in any `.ts`.
- `backend/src/smartbill/smartbill.service.ts` is complete: `createInvoice`,
  `sendInvoiceByEmail`, `getInvoicePdf`, `lookupCompany(cui)`, series and a
  local product catalog.
- **SmartBill credentials are per-workspace** (`getIntegration(workspaceId)`
  reads the tenant's `Integration` row). The existing module invoices *on
  behalf of each tenant*. Platform billing needs primafisoft's own account.
- The frontend `payments` page calls `/documents/payments` and
  `/documents/payfunnel` — that is the tenants' own collections feature and is
  **unrelated** to SaaS billing. Do not touch it.
- The `plan` column enum is stale: `'trial'|'starter'|'professional'|'enterprise'`,
  while `settings.billing.package` and the marketing site both use
  `starter|growth|scale`. `settings.billing.package` is authoritative.

## Architecture

```
signup ──> workspace { billingStatus: 'trialing', trialEndsAt: +14d }
                │
                ├── TrialExpiryJob (hourly) ──> billingStatus: 'past_due'
                │
   "Upgrade" ──> POST /billing/checkout-session
                   └─> Stripe Checkout (hosted)
                          │
                          ▼
              Stripe ──webhook──> POST /billing/webhook
                                    │ idempotent on event.id
                                    ├─ checkout.session.completed
                                    ├─ customer.subscription.created|updated|deleted
                                    ├─ invoice.paid ──> SmartBill invoice + email
                                    └─ invoice.payment_failed
                                            │
                                            ▼
                              workspace.settings.billing (mirror)
                                            │
                                            ▼
                                   SubscriptionGuard
```

Every request reads only the local mirror. Stripe is never called
synchronously while a user waits.

### Module layout

A new `backend/src/billing/` module, mirroring the shape of existing modules:

| File | Responsibility |
|---|---|
| `billing.module.ts` | Wiring |
| `billing.controller.ts` | `checkout-session`, `portal-session`, `status`, `webhook` |
| `billing.service.ts` | Checkout/portal creation, plan→price mapping |
| `stripe-webhook.service.ts` | Event handling, idempotency, mirror writes |
| `billing-invoice.service.ts` | SmartBill issuance on `invoice.paid` |
| `trial-expiry.service.ts` | Scheduled job |
| `guards/subscription.guard.ts` | Write enforcement |
| `decorators/requires-active-subscription.decorator.ts` | Opt-in marker |

Keeping the guard and the invoice bridge in separate files matters: the guard
is on every write path and must stay small enough to read in one sitting.

## Enforcement model

`SubscriptionGuard` runs after `JwtAuthGuard`. It resolves the workspace's
billing state from the already-loaded workspace and decides:

| `billingStatus` | Trial state | Reads | Writes |
|---|---|---|---|
| `trialing` | `trialEndsAt` in future | allow | allow |
| `trialing` | `trialEndsAt` passed | allow | **402** |
| `active` | — | allow | allow |
| `past_due` | within grace (7 days) | allow | allow |
| `past_due` | grace exhausted | allow | **402** |
| `canceled` / `unpaid` / `inactive` | — | allow | **402** |
| any, `grandfathered: true` | — | allow | allow |

Always exempt, regardless of state: `auth/*`, `billing/*`, `health/*`,
`platform-admin/*`, and any export endpoint. A locked-out customer must
always be able to pay, and to leave with their data.

The guard refuses with HTTP **402 Payment Required** and a stable body:

```json
{ "statusCode": 402, "error": "SUBSCRIPTION_REQUIRED",
  "reason": "trial_expired" | "past_due" | "canceled",
  "trialEndsAt": "...", "package": "starter" }
```

The frontend axios interceptor (`frontend/.../api`) already handles 401 with a
refresh flow; 402 gets a sibling branch that raises the paywall banner rather
than redirecting, so the user keeps their place.

**Limits** (`maxUsers`, `maxWhatsAppNumbers`) are enforced at their own call
sites — inviting a user, connecting a WhatsApp number — not in the guard. They
are quantity checks, not state checks, and belong next to the resource.

## Stripe integration

- **Products/prices** live in Stripe, one price per package per interval.
  Price IDs come from env (`STRIPE_PRICE_STARTER_MONTHLY`, …), never hardcoded.
  `settings.billing.package` maps to a price; the reverse map resolves an
  incoming `stripePriceId` back to a package.
- **Checkout** — `mode: 'subscription'`, `client_reference_id: workspaceId`,
  `customer_email` prefilled, `tax_id_collection: { enabled: true }` and
  `automatic_tax: { enabled: true }` for EU B2B reverse charge.
- **Portal** — Stripe Customer Portal handles card updates, plan changes,
  cancellation and invoice history. This is why there is no billing UI to
  build beyond one page with two buttons.
- **Webhooks** — signature verified with `STRIPE_WEBHOOK_SECRET`. The endpoint
  needs the **raw body**, so it must be registered before the global JSON body
  parser or with a per-route raw-body config.

### Idempotency

Stripe retries webhooks. A new table is the only schema change:

```sql
CREATE TABLE processed_stripe_events (
  event_id    varchar PRIMARY KEY,
  type        varchar NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
```

Insert-first, and treat a unique-violation as "already handled, return 200".
This is a hard database guarantee, not a read-then-write check — two
simultaneous deliveries would both pass a check but only one can win the
insert.

*(This is the same failure that produced duplicate WhatsApp activities and
duplicate Typeform contacts in this codebase. Do not repeat it here: this is
money.)*

## SmartBill bridge

On `invoice.paid`, issue a fiscal invoice through the existing SmartBill
service. Two things must be arranged:

1. **Platform credentials.** Create one dedicated platform workspace holding
   primafisoft's SmartBill `Integration` row, and pass its id to the existing
   `SmartBillService`. This reuses `createInvoice` / `sendInvoiceByEmail`
   unchanged and needs no new SmartBill code. The workspace id comes from env
   (`PLATFORM_BILLING_WORKSPACE_ID`).
2. **Customer fiscal data.** Stripe's `tax_id_collection` yields the VAT id.
   `SmartBillService.lookupCompany(cui)` resolves the rest from the Romanian
   registry, so the invoice carries a correct legal name and address.

Store the resulting invoice number on the workspace
(`settings.billing.lastInvoiceNumber`) and email the PDF to the billing
contact.

**Failure isolation:** a SmartBill outage must never fail the webhook. Payment
already succeeded in Stripe; the invoice is a downstream obligation. Enqueue
issuance as a background job with retries and alert on exhaustion. The webhook
returns 200 as soon as the mirror is written.

## Delivery order

Each step is independently useful and independently shippable:

1. **Make trials real.** Write `trialEndsAt` at signup; backfill existing
   trialing workspaces; hourly job flips expired trials to `past_due`.
   *No Stripe involved.*
2. **Make plans mean something.** `SubscriptionGuard`, the 402 contract, the
   frontend banner, and limit checks at their call sites.
   *Still no Stripe.*
3. **Take money.** Stripe SDK, checkout, portal, webhooks, idempotency table.
4. **Invoice properly.** SmartBill bridge on `invoice.paid`.

Steps 1 and 2 deliver value even if Stripe is deferred, and they are the
prerequisite for step 3 being meaningful.

## Testing

- **Guard matrix** — unit tests over (billingStatus × trial state × HTTP
  method × exempt route). This table is the product; it deserves exhaustive
  coverage.
- **Webhook idempotency** — replay the same `event.id` twice and assert one
  state change and one SmartBill call. Deliver two concurrently and assert the
  same.
- **Stripe test clocks** — advance through trial end, first charge, a failed
  charge, grace expiry, and cancellation; assert the mirror at each step.
- **Stripe CLI** (`stripe listen --forward-to`) for local webhook development.
- **Signature rejection** — a webhook with a bad signature must 400 and change
  nothing.
- **SmartBill outage** — stub a 500 and assert the webhook still returns 200
  and the job retries.

## Out of scope (this pass)

- Annual billing and any discount logic.
- Seat-based or usage-based pricing. Packages are flat per month.
- Self-serve for Scale.
- Proration UX beyond what Stripe Portal does by default.
- Migrating the stale `plan` column enum. `settings.billing.package` is
  authoritative; the column is left alone to avoid touching unrelated code.
- Dunning emails beyond Stripe's built-in sequence.

## Open items to resolve in planning

1. **Grace period on `past_due`** — proposed 7 days. Confirm.
2. **Existing workspaces.** How many are live, and which become
   `grandfathered: true` rather than being asked to pay? Needs a decision
   before the backfill in step 1, because that migration is what starts
   clocks on real customers.
3. **Trial length** — 14 days assumed.
4. **Currency.** Marketing says EUR; `WorkspaceSettings.currency` defaults to
   `'USD'` at signup. Confirm EUR and fix the default.
5. **Which writes are exempt.** The guard's allowlist needs a pass over the
   real route table so a locked workspace can still, for example, respond to
   an inbound WhatsApp message rather than silently dropping a customer
   conversation.
