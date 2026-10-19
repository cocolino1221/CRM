'use client';

/**
 * "De sunat" — people who filled in the form and were never scheduled.
 *
 * The caller works this list without leaving the page: dial from the row,
 * book the hour agreed on the phone, record the outcome in the dialog, and a
 * contact who gets booked drops out of the list on the next load. The number
 * is a tel: link rather than an in-app call — calls in this workspace are
 * placed from a handset.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Loader2, MessageCircle, Phone, PhoneOff, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { MONTH_NAMES, periodRange, type PeriodKind } from '@/lib/lead-filters';
import {
  QUEUE_SOURCE_OPTIONS,
  contactDisplayName,
  formatQueueTime,
  queueSourceLabel,
  whatsappDigits,
  type QueueContactRef,
} from '@/lib/queue-rows';
import { DispositionDialog } from '@/components/calls/DispositionDialog';
import ScheduleDialog from '@/components/bookings/ScheduleDialog';

interface Row {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  source?: string;
  createdAt?: string;
  /** The last call's recording, attached by the backend. */
  recordingUrl?: string;
}

export default function ToCallList({
  timeZone = 'Europe/Bucharest',
  onOpenContact,
}: {
  timeZone?: string;
  /** Opens the contact's detail popup. Without it the rows stay inert. */
  onOpenContact?: (contact: QueueContactRef) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  // Leads still inside their source's grace period: hidden from the list on
  // purpose, counted so nobody thinks they went missing.
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispositionFor, setDispositionFor] = useState<Row | null>(null);
  const [schedulingFor, setSchedulingFor] = useState<Row | null>(null);
  const [source, setSource] = useState('');
  const [periodKind, setPeriodKind] = useState<PeriodKind>('all');
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { createdFrom, createdTo } = periodRange({ kind: periodKind, year, month, from, to });
      const params = {
        ...(source ? { source } : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdTo ? { createdTo } : {}),
      };
      const res = await api.get('/activities/queues/to-call', {
        params: Object.keys(params).length ? params : undefined,
      });
      setRows(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
      setWaiting(res.data?.waiting ?? 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut încărca lista.');
    } finally {
      setLoading(false);
    }
  }, [source, periodKind, month, year, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // The header stays up while loading or empty, so the source filter can
  // always be changed back.
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
        <PhoneOff className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          {source || periodKind !== 'all'
            ? 'Nimeni de sunat cu filtrele alese'
            : 'Toți leadurii au fost programați'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {loading ? '…' : total} de sunat
            </span>
            {!loading && waiting > 0 && (
              <span
                className="text-sm font-medium text-gray-500"
                title="Intrate de curând — li se lasă câteva minute să se programeze singure"
              >
                {waiting} în așteptare
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
          <select
            value={periodKind}
            onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Perioadă"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="all">Toată perioada</option>
            <option value="month">Pe lună</option>
            <option value="custom">Interval</option>
          </select>

          {periodKind === 'month' && (
            <>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                aria-label="Luna"
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                aria-label="Anul"
                className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
              />
            </>
          )}

          {periodKind === 'custom' && (
            <>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label="De la"
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Până la"
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
              />
            </>
          )}

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
          {rows.map((r) => (
            <li
              key={r.id}
              role={onOpenContact ? 'button' : undefined}
              tabIndex={onOpenContact ? 0 : undefined}
              onClick={onOpenContact ? () => onOpenContact(r) : undefined}
              onKeyDown={
                onOpenContact
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenContact(r);
                      }
                    }
                  : undefined
              }
              className={`px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40${
                onOpenContact ? ' cursor-pointer' : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-[10rem] flex-1 font-medium text-gray-900 dark:text-white">
                  {contactDisplayName(r)}
                </span>
                {r.phone && (
                  <span className="text-xs tabular-nums text-gray-600 dark:text-gray-300">
                    {r.phone}
                  </span>
                )}
                {queueSourceLabel(r.source) && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {queueSourceLabel(r.source)}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  Intrat: {formatQueueTime(r.createdAt, timeZone)}
                </span>
                {/*
                  Two ways to reach the same person. Each stops the click from
                  reaching the row, which would open the popup behind the call.
                */}
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 font-medium text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300"
                  >
                    <Phone className="h-3.5 w-3.5" /> Sună
                  </a>
                )}
                {whatsappDigits(r.phone) && (
                  <a
                    href={`https://wa.me/${whatsappDigits(r.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {/*
                  Booking straight from the row: the setter has the lead on the
                  phone and should not have to open the detail popup first.
                */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSchedulingFor(r);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                >
                  <CalendarPlus className="h-3.5 w-3.5" /> Programează
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDispositionFor(r);
                  }}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  Rezultat apel
                </button>
              </div>
              {r.recordingUrl && (
                <audio
                  controls
                  src={r.recordingUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 h-8 w-full max-w-sm"
                />
              )}
            </li>
          ))}
        </ul>
        )}
      </div>

      {schedulingFor && (
        <ScheduleDialog
          contact={schedulingFor}
          timeZone={timeZone}
          onClose={() => setSchedulingFor(null)}
          // Once the booking exists the lead belongs in Programați.
          onScheduled={load}
        />
      )}

      {dispositionFor && (
        <DispositionDialog
          contactId={dispositionFor.id}
          contactName={contactDisplayName(dispositionFor)}
          phone={dispositionFor.phone}
          onClose={() => setDispositionFor(null)}
          // A contact who was just booked belongs in Programați, not here.
          onSaved={load}
        />
      )}
    </>
  );
}
