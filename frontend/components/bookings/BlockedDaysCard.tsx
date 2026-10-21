'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import {
  MONTHS_RO,
  WEEKDAYS_SHORT_RO,
  addDays,
  blockWeek,
  copyWeek,
  formatBlockedDay,
  formatWeek,
  isPastDay,
  monthGrid,
  nextWeekend,
  toggleDay,
  toYmd,
  upcomingDays,
  weekDays,
  weekStartOf,
} from '@/lib/blocked-days';

/**
 * Whole days off. Click a day to block it, again to free it; each change is
 * saved at once. No booking — public page or team — lands on a blocked day.
 */
export default function BlockedDaysCard() {
  const [days, setDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  // The week the copy buttons act on: the one of the last day clicked.
  const [focusWeek, setFocusWeek] = useState(() => weekStartOf(toYmd(now)));

  useEffect(() => {
    api
      .get('/scheduling/blocked-days')
      .then((res) => setDays(Array.isArray(res.data?.days) ? res.data.days : []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(
    async (next: string[]) => {
      const before = days;
      setDays(next);
      setSaving(true);
      setError('');
      try {
        const res = await api.put('/scheduling/blocked-days', { days: next });
        setDays(Array.isArray(res.data?.days) ? res.data.days : next);
      } catch {
        setDays(before);
        setError('Nu am putut salva zilele libere. Încearcă din nou.');
      } finally {
        setSaving(false);
      }
    },
    [days],
  );

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
  const today = toYmd(now);
  const ahead = upcomingDays(days, now);
  const weekend = nextWeekend(now);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <CalendarOff className="h-4 w-4 text-rose-600" /> Zile libere
        </h2>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Click pe o zi ca s-o blochezi (weekend, concediu). În zilele blocate nu te poate programa nimeni.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
          <div className="w-full max-w-xs">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={isCurrentMonth}
                className="rounded-full p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Luna anterioară"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold capitalize text-gray-800 dark:text-gray-100">
                {MONTHS_RO[cursor.month]} {cursor.year}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="rounded-full p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Luna următoare"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS_SHORT_RO.map((d) => (
                <span key={d} className="text-[10px] font-semibold text-gray-400">
                  {d}
                </span>
              ))}
              {monthGrid(cursor.year, cursor.month)
                .flat()
                .map((ymd, i) => {
                  if (!ymd) return <span key={`e${i}`} />;
                  const past = isPastDay(ymd, now);
                  const blocked = days.includes(ymd);
                  const weekendCol = i % 7 >= 5;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={past || saving}
                      onClick={() => {
                        setFocusWeek(weekStartOf(ymd));
                        persist(toggleDay(days, ymd));
                      }}
                      title={formatBlockedDay(ymd)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition ${
                        blocked
                          ? 'bg-rose-600 font-bold text-white hover:bg-rose-700'
                          : past
                            ? 'cursor-default text-gray-300 dark:text-gray-600'
                            : `${weekendCol ? 'text-gray-500' : 'text-gray-800 dark:text-gray-100'} hover:bg-rose-50 dark:hover:bg-gray-700`
                      } ${ymd === today && !blocked ? 'ring-1 ring-teal-600' : ''}`}
                    >
                      {Number(ymd.slice(8))}
                    </button>
                  );
                })}
            </div>
            {/* The week last clicked: block it all, or repeat it on the next weeks. */}
            <div className="mt-3 rounded-xl border border-gray-100 p-3 dark:border-gray-700">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Săptămâna {formatWeek(focusWeek)}
                </span>
                <button
                  type="button"
                  onClick={() => persist(blockWeek(days, focusWeek))}
                  disabled={saving || weekDays(focusWeek).every((d) => days.includes(d) || isPastDay(d, now))}
                  className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  Blochează toată
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-500">Copiază pe următoarele:</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => persist(copyWeek(days, focusWeek, n))}
                    disabled={saving}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40 dark:bg-gray-700 dark:text-gray-200"
                  >
                    {n} săpt.
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => persist(addDays(days, weekend))}
              disabled={saving || weekend.every((d) => days.includes(d))}
              className="mt-3 w-full rounded-xl bg-rose-50 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:bg-rose-950/40 dark:text-rose-300"
            >
              Blochează weekendul următor
            </button>
          </div>

          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500">Zile blocate</p>
            {ahead.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">Nicio zi blocată.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {ahead.map((ymd) => (
                  <button
                    key={ymd}
                    type="button"
                    disabled={saving}
                    onClick={() => persist(toggleDay(days, ymd))}
                    className="flex items-center gap-1 rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                    title="Deblochează"
                  >
                    {formatBlockedDay(ymd)} <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </section>
  );
}
