'use client';

/**
 * "Win" and "Lost" — the two ends of the pipeline, in one component.
 *
 * They differ in exactly two things: which endpoint they read and whether a
 * row carries money. Everything else — the source filter, the empty state,
 * opening the contact — is the same, and two files that drift apart serve
 * nobody.
 *
 * What a won row shows about money is the point of the tab. Payflow confirms
 * instalments one at a time, so a contact on a 1000 EUR plan who has paid 400
 * must read as "1000 EUR · achitat 400 · rest 600", not as a 400 EUR sale.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Trophy, XCircle } from 'lucide-react';
import api from '@/lib/api';
import {
  QUEUE_SOURCE_OPTIONS,
  contactDisplayName,
  formatQueueTime,
  queueSourceLabel,
  type QueueContactRef,
} from '@/lib/queue-rows';

interface PaymentSummary {
  currency: string;
  total: number;
  paid: number;
  remaining: number;
  inInstalments: boolean;
}

interface Row {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  source?: string;
  updatedAt?: string;
  pipelineStage?: { name?: string; color?: string };
  payment?: PaymentSummary;
  /** One per currency the client paid in. */
  payments?: PaymentSummary[];
}

/** Money as the office says it: no decimals when there are none to show. */
function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    // An unknown currency code must not blank the amount.
    return `${value} ${currency}`;
  }
}

export default function ClosedList({
  kind,
  timeZone = 'Europe/Bucharest',
  onOpenContact,
}: {
  kind: 'won' | 'lost';
  timeZone?: string;
  onOpenContact?: (contact: QueueContactRef) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');

  const won = kind === 'won';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/activities/queues/${kind}`, {
        params: source ? { source } : undefined,
      });
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setRows(data);
      setTotal(typeof res.data?.total === 'number' ? res.data.total : data.length);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          (won ? 'Nu s-au putut încărca vânzările.' : 'Nu s-au putut încărca leadurile pierdute.'),
      );
    } finally {
      setLoading(false);
    }
  }, [kind, source, won]);

  useEffect(() => {
    void load();
  }, [load]);

  // What the whole list is worth, so the tab answers "how much did we sell?"
  // without a calculator. Only paid money counts here.
  // Per currency: RON from the shop and EUR from Payflow must not be added up.
  const paidByCurrency = rows.reduce<Record<string, number>>((acc, r) => {
    for (const p of r.payments ?? (r.payment ? [r.payment] : [])) {
      if (p.paid > 0) acc[p.currency] = (acc[p.currency] ?? 0) + p.paid;
    }
    return acc;
  }, {});
  const paidLabel = Object.entries(paidByCurrency)
    .sort((a, b) => b[1] - a[1])
    .map(([cur, value]) => money(value, cur))
    .join(' + ');

  let body: JSX.Element | null = null;
  if (loading) {
    body = (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  } else if (error) {
    body = (
      <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
        <button onClick={load} className="ml-3 underline">
          Încearcă din nou
        </button>
      </div>
    );
  } else if (!rows.length) {
    body = (
      <div className="p-10 text-center">
        {won ? (
          <Trophy className="mx-auto h-8 w-8 text-gray-300" />
        ) : (
          <XCircle className="mx-auto h-8 w-8 text-gray-300" />
        )}
        <p className="mt-3 text-sm text-gray-500">
          {source
            ? 'Nimic din sursa aleasă'
            : won
              ? 'Nicio vânzare închisă încă'
              : 'Niciun lead pierdut'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {loading ? '…' : total} {won ? (total === 1 ? 'vânzare' : 'vânzări') : 'pierdute'}
          </span>
          {won && paidLabel && (
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
              {paidLabel} încasat
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Sursă"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          >
            {QUEUE_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reîncarcă
          </button>
        </div>
      </div>

      {body ?? (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r) => {
            const name = contactDisplayName(r);
            const sourceLabel = queueSourceLabel(r.source);
            const payments = (r.payments ?? (r.payment ? [r.payment] : [])).filter((x) => x.total > 0);
            return (
              <li
                key={r.id}
                onClick={() => onOpenContact?.(r)}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${
                  onOpenContact ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {r.phone && <span>{r.phone}</span>}
                    {sourceLabel && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                        {sourceLabel}
                      </span>
                    )}
                    <span>{formatQueueTime(r.updatedAt, timeZone)}</span>
                  </p>
                </div>

                {won ? (
                  <div className="text-right">
                    {payments.length > 0 ? (
                      // One line per currency the client paid in.
                      payments.map((p) => (
                        <div key={p.currency} className="mb-1 last:mb-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {money(p.total, p.currency)}
                          </p>
                          {p.inInstalments || p.remaining > 0 ? (
                            <p className="mt-0.5 text-xs">
                              <span className="text-green-700 dark:text-green-400">
                                achitat {money(p.paid, p.currency)}
                              </span>
                              <span className="text-gray-400"> · </span>
                              <span
                                className={
                                  p.remaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500'
                                }
                              >
                                rest {money(p.remaining, p.currency)}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">achitat integral</p>
                          )}
                        </div>
                      ))
                    ) : (
                      // Won in the CRM, but nothing paid is recorded and no
                      // deal carries a figure. Saying "0" would be a lie.
                      <p className="text-xs text-gray-400">fără plată înregistrată</p>
                    )}
                  </div>
                ) : (
                  r.pipelineStage?.name && (
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: r.pipelineStage.color || '#DC2626' }}
                    >
                      {r.pipelineStage.name}
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
