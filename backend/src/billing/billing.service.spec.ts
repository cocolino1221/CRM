import { ForbiddenException } from '@nestjs/common';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let workspace: any;
  let userCount: number;
  let whatsappCount: number;
  let service: BillingService;
  let saved: any[];

  const make = (billing: any) => {
    workspace = { id: 'ws1', name: 'Acme', plan: 'trial', settings: { billing } };
  };

  beforeEach(() => {
    userCount = 0;
    whatsappCount = 0;
    saved = [];
    make({ requiresPlan: true, billingStatus: 'inactive' });
    const workspaceRepository: any = {
      findOne: jest.fn(async () => workspace),
      save: jest.fn(async (w) => { saved.push(JSON.parse(JSON.stringify(w))); return w; }),
      createQueryBuilder: jest.fn(),
    };
    const userRepository: any = { count: jest.fn(async () => userCount) };
    const integrationRepository: any = { count: jest.fn(async () => whatsappCount) };
    service = new BillingService(workspaceRepository, userRepository, integrationRepository, { get: jest.fn() } as any);
  });

  it('keeps full access for workspaces created before plans existed', async () => {
    make({ billingStatus: 'trialing', package: 'starter' });
    const access = await service.getAccess('ws1');
    expect(access).toMatchObject({ requiresPlan: false, active: true, maxUsers: null });
    await expect(service.assertIntegrationAllowed('ws1', 'woocommerce')).resolves.toBeUndefined();
    userCount = 500;
    await expect(service.assertCanAddUser('ws1')).resolves.toBeUndefined();
  });

  it('blocks integrations and new users until a plan is chosen', async () => {
    await expect(service.assertIntegrationAllowed('ws1', 'whatsapp')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertCanAddUser('ws1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies plan tiers to integrations', async () => {
    make({ requiresPlan: true, billingStatus: 'trialing', package: 'starter', stripeSubscriptionId: 'sub_1' });
    await expect(service.assertIntegrationAllowed('ws1', 'whatsapp')).resolves.toBeUndefined();
    await expect(service.assertIntegrationAllowed('ws1', 'woocommerce')).rejects.toThrow(/Growth/);

    make({ requiresPlan: true, billingStatus: 'active', package: 'growth', stripeSubscriptionId: 'sub_1' });
    await expect(service.assertIntegrationAllowed('ws1', 'woocommerce')).resolves.toBeUndefined();
    await expect(service.assertIntegrationAllowed('ws1', 'meta-conversions')).rejects.toThrow(/Scale/);
  });

  it('enforces the user and WhatsApp number limits', async () => {
    make({ requiresPlan: true, billingStatus: 'active', package: 'starter', stripeSubscriptionId: 'sub_1' });
    userCount = 7;
    await expect(service.assertCanAddUser('ws1')).resolves.toBeUndefined();
    userCount = 8;
    await expect(service.assertCanAddUser('ws1')).rejects.toThrow(/up to 8 users/);

    whatsappCount = 1;
    await expect(service.assertIntegrationAllowed('ws1', 'whatsapp')).rejects.toThrow(/1 WhatsApp number/);
    // Reconnecting the existing number is fine.
    await expect(service.assertIntegrationAllowed('ws1', 'whatsapp', { newConnection: false })).resolves.toBeUndefined();
  });

  it('locks paid features again when the subscription is cancelled or unpaid', async () => {
    make({ requiresPlan: true, billingStatus: 'canceled', package: 'growth', stripeSubscriptionId: 'sub_1' });
    expect((await service.getAccess('ws1')).active).toBe(false);
    make({ requiresPlan: true, billingStatus: 'past_due', package: 'growth', stripeSubscriptionId: 'sub_1' });
    expect((await service.getAccess('ws1')).active).toBe(true);
  });

  it('stores plan, status and limits from a Stripe subscription', async () => {
    await service.syncSubscription({
      id: 'sub_1',
      status: 'trialing',
      customer: 'cus_1',
      metadata: { workspaceId: 'ws1' },
      trial_start: 1_700_000_000,
      trial_end: 1_701_209_600,
      current_period_end: 1_701_209_600,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: 'price_1', lookup_key: 'etcrm_growth_monthly', metadata: { etcrm_plan: 'growth' }, recurring: { interval: 'month' } } }] },
    } as any);

    const last = saved[saved.length - 1];
    expect(last.plan).toBe('professional');
    expect(last.settings.limits).toEqual({ maxUsers: 25, maxWhatsAppNumbers: 3 });
    expect(last.settings.billing).toMatchObject({
      package: 'growth', billingStatus: 'trialing', stripeSubscriptionId: 'sub_1', trialUsed: true, interval: 'month',
    });
    expect((await service.getAccess('ws1')).active).toBe(true);
  });
});
