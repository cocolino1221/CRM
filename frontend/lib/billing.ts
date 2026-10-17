import api from '@/lib/api';

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

export interface BillingAccess {
  requiresPlan: boolean;
  active: boolean;
  plan: PlanId | null;
  interval: BillingInterval | null;
  status: 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  trialEndsAt: string | null;
  currentPeriodEndAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
  trialAvailable: boolean;
  maxUsers: number | null;
  maxWhatsAppNumbers: number | null;
}

export interface BillingOverview {
  access: BillingAccess;
  canManage: boolean;
  currency: string;
  trialDays: number;
  plans: PlanDefinition[];
}

export const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, scale: 3 };
export const PLAN_NAMES: Record<PlanId, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };

// Mirrors backend/src/billing/plans.ts — lowest plan that includes each integration card.
const STARTER_INTEGRATIONS = new Set(['whatsapp']);
const SCALE_INTEGRATIONS = new Set(['meta-conversions', 'mcp-ai-connect']);

export function requiredPlanForIntegration(id: string): PlanId {
  if (STARTER_INTEGRATIONS.has(id)) return 'starter';
  if (SCALE_INTEGRATIONS.has(id)) return 'scale';
  return 'growth';
}

/** null when allowed, otherwise the plan needed (or 'none' when no plan is active). */
export function integrationLock(access: BillingAccess | null, id: string): PlanId | 'none' | null {
  if (!access || !access.requiresPlan) return null;
  if (!access.active || !access.plan) return 'none';
  const needed = requiredPlanForIntegration(id);
  return PLAN_RANK[access.plan] >= PLAN_RANK[needed] ? null : needed;
}

export const fetchBillingOverview = () => api.get<BillingOverview>('/billing').then((r) => r.data);
