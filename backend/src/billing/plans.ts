// EasyTeam CRM subscription plans. Prices are in EUR; Stripe prices are
// created on first use and found again by their lookup key.

export type PlanId = 'starter' | 'growth' | 'scale';
export type BillingInterval = 'month' | 'year';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxUsers: number | null;
  maxWhatsAppNumbers: number;
  highlights: string[];
}

export const BILLING_CURRENCY = 'eur';
export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 49,
    yearlyPrice: 490,
    maxUsers: 8,
    maxWhatsAppNumbers: 1,
    highlights: [
      'Up to 8 users',
      '1 WhatsApp number',
      'Leads, pipeline, contacts, tasks & calendar',
      'WhatsApp inbox, templates & calls',
      'Forms & landing pages',
      'iPhone & Android app',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 89,
    yearlyPrice: 890,
    maxUsers: 25,
    maxWhatsAppNumbers: 3,
    highlights: [
      'Up to 25 users',
      '3 WhatsApp numbers',
      'Everything in Starter',
      'Messenger & Instagram inbox',
      'All integrations (WooCommerce, Typeform, Google, Payflow, Lead Ads…)',
      'Automations, auto-send rules & email campaigns',
      'Call recording, documents & e-signature',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    monthlyPrice: 149,
    yearlyPrice: 1490,
    maxUsers: null,
    maxWhatsAppNumbers: 10,
    highlights: [
      'Unlimited users',
      '10 WhatsApp numbers',
      'Everything in Growth',
      'AI Connect (ChatGPT, Claude)',
      'Meta Conversions API',
      'Your logo in the mobile app',
      'Priority support',
    ],
  },
};

export const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, scale: 3 };

export const isPlanId = (value: unknown): value is PlanId =>
  value === 'starter' || value === 'growth' || value === 'scale';

export const priceLookupKey = (plan: PlanId, interval: BillingInterval) => `etcrm_${plan}_${interval}ly`;

// Lowest plan that includes an integration. Anything not listed needs Growth.
const STARTER_INTEGRATIONS = new Set(['whatsapp']);
const SCALE_INTEGRATIONS = new Set(['meta_capi', 'meta-conversions', 'mcp', 'mcp-ai-connect']);

export function requiredPlanForIntegration(key: string): PlanId {
  const k = String(key || '').trim().toLowerCase();
  if (STARTER_INTEGRATIONS.has(k)) return 'starter';
  if (SCALE_INTEGRATIONS.has(k)) return 'scale';
  return 'growth';
}

// Workspace.plan column values (legacy enum) for each plan.
export const WORKSPACE_PLAN_COLUMN: Record<PlanId, string> = {
  starter: 'starter',
  growth: 'professional',
  scale: 'enterprise',
};
