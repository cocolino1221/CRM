'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Loader2, Video, X } from 'lucide-react';
import api from '@/lib/api';
import { PAST_STATUS_LABEL, pastStats, toPastBookings, type PastBooking } from '@/lib/calendar-bookings';

const PERIODS = [7, 30, 90];

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  confirmed: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  no_show: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Meetings already over: gone from the calendar, kept here with what became
 * of them. The server scopes the list — a closer sees their own.
 */
export default function PastBookingsPanel({ onClose }: { onClose: () => void }) {
  const [days, setDays] = useState(30);
  const [list, setList] = useState<PastBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const now = new Date();
    api
      .get('/bookings', {
        params: { startDate: new Date(now.getTime() - days * 86_400_000).toISOString(), endDate: now.toISOString() },
      })
      .then((res) => alive && setList(toPastBookings(res.data, now)))
      .catch(() => alive && setList([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const stats = pastStats(list);
  const tiles = [
    { label: 'Întâlniri', value: stats.held, hint: `${stats.online} pe Zoom/Meet` },
    { label: 'No-show', value: stats.noShow },
    { label: 'Anulate', value: stats.cancelled },
    { label: 'Nemarcate', value: stats.unmarked },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
            <History className="h-5 w-5" /> Programări trecute
          </h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Închide">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setDays(p)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  days === p ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                {p} zile
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-700">
                <p className="text-[11px] text-gray-500">{t.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{t.value}</p>
                {t.hint && <p className="text-[10px] text-gray-400">{t.hint}</p>}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Vânzările și ratele pe closer sunt în{' '}
            <Link href="/rapoarte" className="font-semibold text-teal-600 hover:underline">
              Rapoarte
            </Link>
            .
          </p>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Nicio programare trecută în perioada aleasă.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((b) => (
                <li key={b.id} className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{b.leadName}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[b.status] ?? STATUS_CLASS.confirmed}`}>
                      {PAST_STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span>{when(b.startTime)}</span>
                    {b.hostName && <span className="text-gray-400">· {b.hostName}</span>}
                    {b.platform && (
                      <span className="flex items-center gap-0.5">
                        <Video className="h-3 w-3" /> {b.platform}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
