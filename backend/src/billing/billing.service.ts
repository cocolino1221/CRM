import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import Stripe from 'stripe';
import { Workspace, WorkspaceSettings } from '../database/entities/workspace.entity';
import { User, UserStatus } from '../database/entities/user.entity';
import { Integration, IntegrationType } from '../database/entities/integration.entity';
import {
  BILLING_CURRENCY,
  BillingInterval,
  PLAN_RANK,
  PLANS,
  PlanId,
  TRIAL_DAYS,
  WORKSPACE_PLAN_COLUMN,
  isPlanId,
  priceLookupKey,
  requiredPlanForIntegration,
} from './plans';

type BillingSettings = NonNullable<WorkspaceSettings['billing']>;
type BillingStatus = NonNullable<BillingSettings['billingStatus']>;

export interface BillingAccess {
  /** false for workspaces created before plans existed — they keep full access. */
  requiresPlan: boolean;
  active: boolean;
  plan: PlanId | null;
  interval: BillingInterval | null;
  status: BillingStatus;
  trialEndsAt: string | null;
  currentPeriodEndAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
  trialAvailable: boolean;
  maxUsers: number | null;
  maxWhatsAppNumbers: number | null;
}

// past_due keeps access while Stripe retries the card.
const ACTIVE_STATUSES = new Set<BillingStatus>(['trialing', 'active', 'past_due']);

const mapStripeStatus = (status: Stripe.Subscription.Status): BillingStatus => {
  switch (status) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'unpaid': return 'unpaid';
    case 'canceled': return 'canceled';
    default: return 'inactive'; // incomplete, incomplete_expired, paused
  }
};

const isoFromUnix = (value?: number | null) => (value ? new Date(value * 1000).toISOString() : undefined);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripeClient: Stripe | null = null;
  private readonly priceCache = new Map<string, string>();

  constructor(
    @InjectRepository(Workspace) private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    private readonly configService: ConfigService,
  ) {}

  private get stripe(): Stripe {
    if (!this.stripeClient) {
      const key = this.configService.get<string>('STRIPE_SECRET_KEY');
      if (!key) throw new BadRequestException('Billing is not configured yet (STRIPE_SECRET_KEY missing).');
      this.stripeClient = new Stripe(key);
    }
    return this.stripeClient;
  }

  private frontendUrl(): string {
    return String(this.configService.get('FRONTEND_URL') || 'https://etcrm.primafisoft.com').replace(/\/+$/, '');
  }

  private async getWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  // ── Access & limits ───────────────────────────────────────────────────────

  accessFor(workspace: Workspace): BillingAccess {
    const billing: BillingSettings = (workspace.settings?.billing || {}) as BillingSettings;
    const requiresPlan = billing.requiresPlan === true && billing.grandfathered !== true;
    const status: BillingStatus = billing.billingStatus || 'inactive';
    const plan = isPlanId(billing.package) ? billing.package : null;
    const active = !requiresPlan || (!!plan && ACTIVE_STATUSES.has(status));
    const def = requiresPlan && plan ? PLANS[plan] : null;
    return {
      requiresPlan,
      active,
      plan: requiresPlan ? plan : null,
      interval: billing.interval || null,
      status,
      trialEndsAt: billing.trialEndsAt || null,
      currentPeriodEndAt: billing.currentPeriodEndAt || null,
      cancelAtPeriodEnd: !!billing.cancelAtPeriodEnd,
      hasSubscription: !!billing.stripeSubscriptionId && ACTIVE_STATUSES.has(status),
      trialAvailable: !billing.trialUsed,
      maxUsers: requiresPlan ? (def ? def.maxUsers : 0) : null,
      maxWhatsAppNumbers: requiresPlan ? (def ? def.maxWhatsAppNumbers : 0) : null,
    };
  }

  async getAccess(workspaceId: string): Promise<BillingAccess> {
    return this.accessFor(await this.getWorkspace(workspaceId));
  }

  async assertIntegrationAllowed(
    workspaceId: string,
    integrationKey: string,
    options: { newConnection?: boolean } = {},
  ): Promise<void> {
    const access = await this.getAccess(workspaceId);
    if (!access.requiresPlan) return;
    if (!access.active || !access.plan) {
      throw new ForbiddenException('Choose a plan to use integrations. Go to Billing to start your free trial.');
    }
    const needed = requiredPlanForIntegration(integrationKey);
    if (PLAN_RANK[access.plan] < PLAN_RANK[needed]) {
      throw new ForbiddenException(`This integration needs the ${PLANS[needed].name} plan. Upgrade in Billing.`);
    }
    if (options.newConnection !== false && String(integrationKey).toLowerCase() === IntegrationType.WHATSAPP) {
      await this.assertCanAddWhatsAppNumber(workspaceId, access);
    }
  }

  async assertCanAddUser(workspaceId: string): Promise<void> {
    const access = await this.getAccess(workspaceId);
    if (!access.requiresPlan || access.maxUsers === null) return;
    if (!access.active) throw new ForbiddenException('Choose a plan before adding users. Go to Billing.');
    const count = await this.userRepository.count({
      where: { workspaceId, status: In([UserStatus.ACTIVE, UserStatus.PENDING]) },
    });
    if (count >= access.maxUsers) {
      throw new ForbiddenException(
        `Your ${PLANS[access.plan!].name} plan includes up to ${access.maxUsers} users. Upgrade in Billing to add more.`,
      );
    }
  }

  private async assertCanAddWhatsAppNumber(workspaceId: string, access: BillingAccess): Promise<void> {
    if (access.maxWhatsAppNumbers === null) return;
    const count = await this.integrationRepository.count({ where: { workspaceId, type: IntegrationType.WHATSAPP } });
    if (count >= access.maxWhatsAppNumbers) {
      throw new ForbiddenException(
        `Your ${PLANS[access.plan!].name} plan includes ${access.maxWhatsAppNumbers} WhatsApp number${access.maxWhatsAppNumbers === 1 ? '' : 's'}. Upgrade in Billing to add more.`,
      );
    }
  }

  // ── Stripe Checkout & portal ──────────────────────────────────────────────

  private async ensurePrice(plan: PlanId, interval: BillingInterval): Promise<string> {
    const lookupKey = priceLookupKey(plan, interval);
    const def = PLANS[plan];
    const amount = Math.round((interval === 'year' ? def.yearlyPrice : def.monthlyPrice) * 100);
    const cached = this.priceCache.get(lookupKey);
    if (cached) return cached;

    const existing = (await this.stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })).data[0];
    if (existing && existing.unit_amount === amount && existing.currency === BILLING_CURRENCY) {
      this.priceCache.set(lookupKey, existing.id);
      return existing.id;
    }

    const productId = `etcrm_${plan}`;
    try {
      await this.stripe.products.retrieve(productId);
    } catch {
      await this.stripe.products.create({ id: productId, name: `EasyTeam CRM ${def.name}`, metadata: { etcrm_plan: plan } });
    }
    // A changed price in plans.ts creates a new Stripe price and moves the lookup key to it;
    // existing subscribers stay on their old price until they change plan.
    const price = await this.stripe.prices.create({
      product: productId,
      currency: BILLING_CURRENCY,
      unit_amount: amount,
      recurring: { interval },
      lookup_key: lookupKey,
      transfer_lookup_key: true,
      metadata: { etcrm_plan: plan, interval },
    });
    this.priceCache.set(lookupKey, price.id);
    return price.id;
  }

  async createCheckout(
    workspaceId: string,
    user: { email: string; firstName?: string; lastName?: string },
    plan: PlanId,
    interval: BillingInterval,
  ): Promise<{ url: string }> {
    const workspace = await this.getWorkspace(workspaceId);
    const access = this.accessFor(workspace);
    if (access.hasSubscription) {
      // Plan changes for an existing subscription go through Stripe's portal (proration handled there).
      return this.createPortal(workspaceId);
    }

    const billing: BillingSettings = { ...((workspace.settings?.billing || {}) as BillingSettings) };
    let customerId = billing.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: workspace.name,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await this.saveBilling(workspace, { ...billing, stripeCustomerId: customerId, billingProvider: 'stripe' });
    }

    const price = await this.ensurePrice(plan, interval);
    const base = this.frontendUrl();
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: workspaceId,
      line_items: [{ price, quantity: 1 }],
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { workspaceId, plan, interval },
        ...(access.trialAvailable ? { trial_period_days: TRIAL_DAYS } : {}),
      },
      metadata: { workspaceId, plan, interval },
      success_url: `${base}/billing?checkout=success`,
      cancel_url: `${base}/billing?checkout=cancelled`,
    });
    if (!session.url) throw new BadRequestException('Stripe did not return a checkout URL');
    return { url: session.url };
  }

  async createPortal(workspaceId: string): Promise<{ url: string }> {
    const workspace = await this.getWorkspace(workspaceId);
    const customerId = workspace.settings?.billing?.stripeCustomerId;
    if (!customerId) throw new BadRequestException('No billing account yet — choose a plan first.');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${this.frontendUrl()}/billing`,
    });
    return { url: session.url };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
      throw new BadRequestException(`Invalid Stripe signature: ${err?.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await this.stripe.subscriptions.retrieve(String(session.subscription));
          await this.syncSubscription(sub, session.client_reference_id || undefined);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.trial_will_end':
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await this.syncSubscription(await this.stripe.subscriptions.retrieve(String(invoice.subscription)));
        }
        break;
      }
      default:
        break;
    }
  }

  async syncSubscription(sub: Stripe.Subscription, workspaceIdHint?: string): Promise<void> {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const workspaceId = sub.metadata?.workspaceId || workspaceIdHint;
    let workspace = workspaceId ? await this.workspaceRepository.findOne({ where: { id: workspaceId } }) : null;
    if (!workspace && customerId) {
      workspace = await this.workspaceRepository
        .createQueryBuilder('w')
        .where(`w.settings -> 'billing' ->> 'stripeCustomerId' = :customerId`, { customerId })
        .getOne();
    }
    if (!workspace) {
      this.logger.warn(`[billing] no workspace for subscription ${sub.id} (customer ${customerId})`);
      return;
    }

    const billing: BillingSettings = { ...((workspace.settings?.billing || {}) as BillingSettings) };
    // Ignore late events for an older subscription once the workspace moved to a new one.
    if (billing.stripeSubscriptionId && billing.stripeSubscriptionId !== sub.id && sub.status === 'canceled') return;

    const price = sub.items?.data?.[0]?.price;
    const planFromPrice = String(price?.metadata?.etcrm_plan || price?.lookup_key?.split('_')[1] || '');
    const plan = isPlanId(planFromPrice) ? planFromPrice : isPlanId(sub.metadata?.plan) ? (sub.metadata.plan as PlanId) : billing.package;
    const interval = (price?.recurring?.interval === 'year' ? 'year' : 'month') as BillingInterval;
    const periodEnd = (sub as any).current_period_end ?? (sub.items?.data?.[0] as any)?.current_period_end;

    const next: BillingSettings = {
      ...billing,
      requiresPlan: billing.requiresPlan ?? true,
      billingProvider: 'stripe',
      billingStatus: mapStripeStatus(sub.status),
      package: isPlanId(plan) ? plan : billing.package,
      interval,
      stripeCustomerId: customerId || billing.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: price?.id,
      trialEndsAt: isoFromUnix(sub.trial_end),
      currentPeriodEndAt: isoFromUnix(periodEnd),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      trialUsed: billing.trialUsed || !!sub.trial_start,
    };
    if (isPlanId(next.package)) {
      workspace.plan = WORKSPACE_PLAN_COLUMN[next.package];
      workspace.settings = {
        ...(workspace.settings || ({} as WorkspaceSettings)),
        limits: { maxUsers: PLANS[next.package].maxUsers, maxWhatsAppNumbers: PLANS[next.package].maxWhatsAppNumbers },
      };
    }
    await this.saveBilling(workspace, next);
    this.logger.log(`[billing] workspace ${workspace.id} → ${next.package} (${next.billingStatus})`);
  }

  private async saveBilling(workspace: Workspace, billing: BillingSettings): Promise<void> {
    workspace.settings = { ...(workspace.settings || ({} as WorkspaceSettings)), billing };
    await this.workspaceRepository.save(workspace);
  }
}
