'use client';

/**
 * "Programați" — the appointments ahead.
 *
 * Its own component rather than another branch in leads/page.tsx, which is
 * past 2,700 lines and near the point where it stops being safely editable.
 */

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Loader2, MessageCircle, Phone, RefreshCw, User } from 'lucide-react';
import api from '@/lib/api';
import {
  QUEUE_SOURCE_OPTIONS,
  contactDisplayName,
  formatQueueTime,
  queueSourceLabel,
  whatsappDigits,
  type QueueContactRef,
} from '@/lib/queue-rows';

interface Booking {
  id: string;
  startTime: string;
  status?: string;
  contact?: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    source?: string;
  } | null;
  host?: { id: string; firstName?: string; lastName?: string; email?: string } | null;
}

export default function BookedList({
  timeZone = 'Europe/Bucharest',
  onOpenContact,
}: {
  timeZone?: string;
  /** Opens the contact's detail popup. Without it the rows stay inert. */
  onOpenContact?: (contact: QueueContactRef) => void;
}) {
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/activities/queues/booked', {
        params: source ? { source } : undefined,
      });
      setRows(Array.isArray(res.data) ? res.data : (res.data?.data ?? []));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca programările.');
    } finally {
      setLoading(false);
    }
  }, [source]);

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
        <Calendar className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          {source ? 'Nicio programare din sursa aleasă' : 'Nicio programare viitoare'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {loading ? '…' : rows.length} {rows.length === 1 ? 'programare' : 'programări'}
        </span>
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
        {rows.map((b) => (
          <li
            key={b.id}
            role={onOpenContact && b.contact?.id ? 'button' : undefined}
            tabIndex={onOpenContact && b.contact?.id ? 0 : undefined}
            onClick={
              onOpenContact && b.contact?.id
                ? () => onOpenContact(b.contact as QueueContactRef)
                : undefined
            }
            onKeyDown={
              onOpenContact && b.contact?.id
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenContact(b.contact as QueueContactRef);
                    }
                  }
                : undefined
            }
            className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40${
              onOpenContact && b.contact?.id ? ' cursor-pointer' : ''
            }`}
          >
            <span className="min-w-[10rem] flex-1 font-medium text-gray-900 dark:text-white">
              {contactDisplayName(b.contact)}
            </span>
            {queueSourceLabel(b.contact?.source) && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {queueSourceLabel(b.contact?.source)}
              </span>
            )}
            {b.contact?.phone && (
              <a
                href={`tel:${b.contact.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <Phone className="h-3.5 w-3.5" /> {b.contact.phone}
              </a>
            )}
            {whatsappDigits(b.contact?.phone) && (
              <a
                href={`https://wa.me/${whatsappDigits(b.contact?.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
              <Calendar className="h-3.5 w-3.5" /> {formatQueueTime(b.startTime, timeZone)}
            </span>
            {b.host && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <User className="h-3.5 w-3.5" /> {contactDisplayName(b.host)}
              </span>
            )}
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
