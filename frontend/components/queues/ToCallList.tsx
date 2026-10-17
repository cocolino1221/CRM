'use client';

/**
 * "De sunat" — people who filled in the form and were never scheduled.
 *
 * The caller works this list without leaving the page: dial from the row,
 * record the outcome in the dialog, and a contact who gets booked drops out of
 * the list on the next load. The number is a tel: link rather than an in-app
 * call — calls in this workspace are placed from a handset.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone, PhoneOff, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { contactDisplayName, formatQueueTime } from '@/lib/queue-rows';
import { DispositionDialog } from '@/components/calls/DispositionDialog';

interface Row {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  /** The last call's recording, attached by the backend. */
  recordingUrl?: string;
}

export default function ToCallList({ timeZone = 'Europe/Bucharest' }: { timeZone?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispositionFor, setDispositionFor] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/activities/queues/to-call');
      setRows(res.data?.data ?? []);
      setTotal(res.data?.total ?? 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut încărca lista.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
        <button onClick={load} className="ml-3 underline">
          Încearcă din nou
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
        <PhoneOff className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">Toți cei din formular au fost programați</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {total} de sunat
          </span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reîncarcă
          </button>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-[10rem] flex-1 font-medium text-gray-900 dark:text-white">
                  {contactDisplayName(r)}
                </span>
                <span className="text-xs text-gray-500">
                  Formular: {formatQueueTime(r.createdAt, timeZone)}
                </span>
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 font-medium text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300"
                  >
                    <Phone className="h-3.5 w-3.5" /> Sună
                  </a>
                )}
                <button
                  onClick={() => setDispositionFor(r)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  Rezultat apel
                </button>
              </div>
              {r.recordingUrl && (
                <audio controls src={r.recordingUrl} className="mt-2 h-8 w-full max-w-sm" />
              )}
            </li>
          ))}
        </ul>
      </div>

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
