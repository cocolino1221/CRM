'use client';

/**
 * KPI pe om: calls, bookings, meetings, sales, losses and follow-ups for each
 * person over a day, week, month or custom range. The server decides whose
 * numbers come back — a manager gets the team, anyone else only their own.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';
import {
  customPeriod,
  formatRate,
  formatRevenue,
  formatTypedDate,
  periodFor,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from '@/lib/report-period';

type Row = {
  userId: string;
  name: string;
  role: string | null;
  calls: { total: number; answered: number; notAnswered: number; refused: number; booked: number };
  bookings: { set: number; received: number; held: number; noShow: number; cancelled: number };
  sales: { won: number; lost: number; revenue: number; revenueByCurrency: Record<string, number> };
  followUps: { created: number; done: number; overdue: number };
  rates: { answer: number | null; booking: number | null; show: number | null; close: number | null };
};

const KINDS: Array<{ kind: PeriodKind; label: string }> = [
  { kind: 'day', label: 'Zi' },
  { kind: 'week', label: 'Săptămână' },
  { kind: 'month', label: 'Lună' },
  { kind: 'custom', label: 'Interval' },
];

const COLUMNS: Array<{ label: string; title: string; value: (r: Row) => string | number; tone?: string }> = [
  { label: 'Apeluri', title: 'Apeluri date', value: (r) => r.calls.total },
  { label: 'Răspuns', title: 'Au răspuns (rată)', value: (r) => `${r.calls.answered} · ${formatRate(r.rates.answer)}` },
  { label: 'Fără răsp.', title: 'N-au răspuns, mesagerie, ocupat', value: (r) => r.calls.notAnswered },
  { label: 'Progr. din apel', title: 'Apeluri încheiate cu programare', value: (r) => r.calls.booked },
  { label: 'Progr. făcute', title: 'Programări pentru leadurile lui', value: (r) => r.bookings.set },
  { label: 'Progr. primite', title: 'Programări în calendarul lui', value: (r) => r.bookings.received },
  { label: 'Ținute', title: 'Întâlniri ținute (prezență)', value: (r) => `${r.bookings.held} · ${formatRate(r.rates.show)}` },
  { label: 'No-show', title: 'Nu s-au prezentat', value: (r) => r.bookings.noShow, tone: 'text-rose-600' },
  { label: 'Vândut', title: 'Vânzări încheiate (rată închidere)', value: (r) => `${r.sales.won} · ${formatRate(r.rates.close)}`, tone: 'text-emerald-700 font-semibold' },
  { label: 'Pierdut', title: 'Deal-uri pierdute + refuzuri la telefon', value: (r) => r.sales.lost + r.calls.refused, tone: 'text-rose-600' },
  { label: 'Încasări', title: 'Valoarea vânzărilor, pe monedă', value: (r) => formatRevenue(r.sales.revenueByCurrency) },
  { label: 'Follow-up', title: 'Create / făcute / întârziate acum', value: (r) => `${r.followUps.created} / ${r.followUps.done} / ${r.followUps.overdue}` },
];

export default function UserReportPanel() {
  const [period, setPeriod] = useState<Period>(() => periodFor('week'));
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [customError, setCustomError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/analytics/user-report', {
        params: { from: period.from.toISOString(), to: period.to.toISOString() },
      });
      setRows(res.data?.users ?? []);
      setTotals(res.data?.totals ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Raportul nu a putut fi încărcat.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const chooseKind = (kind: PeriodKind) => {
    setCustomError('');
    if (kind === 'custom') {
      setFromText(formatTypedDate(period.from));
      setToText(formatTypedDate(period.to));
      setPeriod({ kind: 'custom', from: period.from, to: period.to });
    } else {
      setPeriod(periodFor(kind));
    }
  };

  const applyCustom = () => {
    const next = customPeriod(fromText, toText);
    if ('error' in next) {
      setCustomError(next.error);
      return;
    }
    setCustomError('');
    setPeriod(next);
  };

  const showTotals = totals && rows.length > 1;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Users className="h-5 w-5 text-indigo-600" /> KPI pe om
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                onClick={() => chooseKind(k.kind)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  period.kind === k.kind ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            <button onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Perioada anterioară" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-gray-700 dark:text-gray-200">{periodLabel(period)}</span>
            <button onClick={() => setPeriod(shiftPeriod(period, 1))} aria-label="Perioada următoare" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {period.kind === 'custom' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="01.10.2026" className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <span className="text-gray-400">–</span>
          <input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="31.10.2026" className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <button onClick={applyCustom} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">Aplică</button>
          {customError && <span className="text-xs text-red-600">{customError}</span>}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Nicio activitate în perioada aleasă.</p>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700">
                <th className="py-2 pr-3 font-medium">Om</th>
                {COLUMNS.map((c) => (
                  <th key={c.label} title={c.title} className="px-2 py-2 text-right font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-3">
                    <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                    {r.role && <span className="ml-1.5 text-xs text-gray-400">{r.role}</span>}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.label} className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${c.tone ?? 'text-gray-700 dark:text-gray-200'}`}>{c.value(r)}</td>
                  ))}
                </tr>
              ))}
              {showTotals && (
                <tr className="bg-gray-50 font-semibold dark:bg-gray-900">
                  <td className="py-2 pr-3 text-gray-900 dark:text-white">Total echipă</td>
                  {COLUMNS.map((c) => (
                    <td key={c.label} className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-gray-900 dark:text-white">{c.value(totals!)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
