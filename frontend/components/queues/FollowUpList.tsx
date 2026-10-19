'use client';

/**
 * "Follow up" — every callback that was promised, not just the ones due.
 *
 * The existing /activities/follow-ups endpoint deliberately stops at today,
 * because a caller's worklist should not trail off into dates three weeks
 * out. This tab is the other view of the same column: the diary, read whole,
 * with what is already overdue pulled to the eye.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import {
  contactDisplayName,
  formatQueueTime,
  whatsappDigits,
  type QueueContactRef,
} from '@/lib/queue-rows';

interface Row {
  id: string;
  followUpDate?: string;
  notes?: string;
  outcome?: string;
  contact?: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  } | null;
}

export default function FollowUpList({
  timeZone = 'Europe/Bucharest',
  onOpenContact,
}: {
  timeZone?: string;
  onOpenContact?: (contact: QueueContactRef) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/activities/queues/follow-ups');
      setRows(Array.isArray(res.data) ? res.data : (res.data?.data ?? []));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca follow-up-urile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  const overdue = rows.filter((r) => r.followUpDate && new Date(r.followUpDate).getTime() < now);

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
        <CalendarClock className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">Niciun follow-up programat</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {loading ? '…' : rows.length} follow-up
          </span>
          {overdue.length > 0 && (
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              {overdue.length} întârziate
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reîncarcă
        </button>
      </div>

      {body ?? (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r) => {
            const contact = r.contact;
            const name = contactDisplayName(contact);
            const due = r.followUpDate ? new Date(r.followUpDate).getTime() : null;
            const isOverdue = due !== null && due < now;
            const wa = whatsappDigits(contact?.phone);
            return (
              <li
                key={r.id}
                onClick={() => contact && onOpenContact?.(contact)}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${
                  contact && onOpenContact
                    ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-gray-100">{name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        isOverdue
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-gray-500'
                      }
                    >
                      {isOverdue ? 'întârziat · ' : ''}
                      {formatQueueTime(r.followUpDate, timeZone)}
                    </span>
                    {r.notes && (
                      <span className="truncate text-gray-500" title={r.notes}>
                        {r.notes}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {contact?.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 font-medium text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                    >
                      <Phone className="h-3.5 w-3.5" /> Sună
                    </a>
                  )}
                  {wa && (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
