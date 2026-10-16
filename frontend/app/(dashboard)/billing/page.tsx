'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, CreditCard, Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { BillingInterval, BillingOverview, PLAN_NAMES, PlanId, fetchBillingOverview } from '@/lib/billing';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Free trial',
  active: 'Active',
  past_due: 'Payment failed — update your card',
  canceled: 'Cancelled',
  unpaid: 'Unpaid',
  inactive: 'No plan',
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function BillingContent() {
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const checkout = searchParams.get('checkout');
  const welcome = searchParams.get('welcome') === '1';

  const load = () =>
    fetchBillingOverview()
      .then((data) => {
        setOverview(data);
        if (data.access.interval) setInterval(data.access.interval);
      })
      .catch((err) => setError(err?.response?.data?.message || 'Could not load billing'));

  useEffect(() => {
    load();
    // Stripe's webhook can land a few seconds after the redirect back.
    if (checkout === 'success') {
      const t1 = setTimeout(load, 3000);
      const t2 = setTimeout(load, 8000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [checkout]);

  const choosePlan = async (plan: PlanId) => {
    setBusy(plan);
    setError('');
    try {
      const res = await api.post<{ url: string }>('/billing/checkout', { plan, interval });
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not open checkout. Please try again.');
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    setError('');
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      window.location.href = res.data.url;
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not open billing. Please try again.');
      setBusy(null);
    }
  };

  if (!overview) {
    return (
      <div className="flex justify-center py-20">
        {error ? <p className="text-red-600">{error}</p> : <Loader2 className="h-8 w-8 animate-spin text-gray-400" />}
      </div>
    );
  }

  const { access, plans, canManage, trialDays } = overview;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Choose the plan for your workspace. Prices in EUR, VAT may apply.</p>
      </div>

      {welcome && !access.active && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Welcome to EasyTeam CRM! 🎉</p>
          <p className="mt-1">Pick a plan to start your {trialDays}-day free trial. You won&apos;t be charged until the trial ends, and you can cancel anytime.</p>
        </div>
      )}
      {checkout === 'success' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {access.active ? 'Your plan is active — thank you!' : 'Payment received — activating your plan…'}
        </div>
      )}
      {checkout === 'cancelled' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Checkout was cancelled. No payment was taken.</div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!access.requiresPlan ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-700">
          Your workspace is on a legacy plan with full access. Nothing to do here.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <p className="text-sm text-gray-500">Current plan</p>
            <p className="text-lg font-semibold text-gray-900">
              {access.plan && access.active ? PLAN_NAMES[access.plan] : 'No plan yet'}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${access.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[access.status] || access.status}
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {access.status === 'trialing' && access.trialEndsAt && <>Trial ends {formatDate(access.trialEndsAt)}. </>}
              {access.cancelAtPeriodEnd && access.currentPeriodEndAt && <>Cancels on {formatDate(access.currentPeriodEndAt)}. </>}
              {!access.cancelAtPeriodEnd && access.status === 'active' && access.currentPeriodEndAt && <>Renews {formatDate(access.currentPeriodEndAt)}. </>}
              {access.maxUsers !== null && access.active && <>Up to {access.maxUsers ?? 'unlimited'} users · {access.maxWhatsAppNumbers} WhatsApp number{access.maxWhatsAppNumbers === 1 ? '' : 's'}.</>}
            </p>
          </div>
          {canManage && access.hasSubscription && (
            <button
              onClick={openPortal}
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Manage billing (change plan, card, invoices)
            </button>
          )}
        </div>
      )}

      {access.requiresPlan && (
        <>
          <div className="flex justify-center">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm font-medium">
              {(['month', 'year'] as BillingInterval[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setInterval(value)}
                  className={`rounded-lg px-4 py-2 ${interval === value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {value === 'month' ? 'Monthly' : 'Yearly · 2 months free'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = access.active && access.plan === plan.id;
              const price = interval === 'year' ? plan.yearlyPrice : plan.monthlyPrice;
              const popular = plan.id === 'growth';
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 ${popular ? 'border-indigo-400 shadow-lg' : 'border-gray-200'}`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                      <Sparkles className="h-3 w-3" /> Most popular
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
                  <p className="mt-3">
                    <span className="text-4xl font-bold text-gray-900">€{price}</span>
                    <span className="text-sm text-gray-500"> / {interval === 'year' ? 'year' : 'month'}</span>
                  </p>
                  {interval === 'year' && <p className="text-xs text-emerald-700">€{Math.round(plan.yearlyPrice / 12)} / month, billed yearly</p>}
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-gray-700">
                    {plan.highlights.map((item) => (
                      <li key={item} className="flex gap-2"><Check className="h-4 w-4 flex-shrink-0 text-emerald-600 mt-0.5" />{item}</li>
                    ))}
                  </ul>
                  {canManage ? (
                    <button
                      onClick={() => (access.hasSubscription ? openPortal() : choosePlan(plan.id))}
                      disabled={busy !== null || isCurrent}
                      className={`mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
                        isCurrent ? 'bg-gray-100 text-gray-500' : popular ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {busy === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isCurrent
                        ? 'Current plan'
                        : access.hasSubscription
                          ? `Switch to ${plan.name}`
                          : access.trialAvailable
                            ? `Start ${trialDays}-day free trial`
                            : `Choose ${plan.name}`}
                    </button>
                  ) : (
                    <p className="mt-6 text-center text-xs text-gray-500">Ask your workspace admin to change the plan.</p>
                  )}
                </div>
              );
            })}
          </div>
          {access.trialAvailable && !access.hasSubscription && (
            <p className="text-center text-xs text-gray-500">
              Card required. Free for {trialDays} days, then billed automatically. Cancel anytime from Manage billing.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}>
      <BillingContent />
    </Suspense>
  );
}
