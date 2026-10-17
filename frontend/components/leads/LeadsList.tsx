'use client';

/**
 * Every lead in the workspace, narrowed by date and source.
 *
 * This replaced the per-pipeline board. A closer used to see only the slice
 * belonging to whichever pipeline was selected — and with duplicate default
 * pipelines here, an arbitrary slice. Nothing in this component sends a
 * pipeline id, so what you see is the whole workspace.
 *
 * Filtering happens on the server: the board filtered its already-loaded 200
 * rows in the browser, so a month further back simply looked empty.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Loader2, Phone, Search, Users } from 'lucide-react';
import api from '@/lib/api';
import { contactDisplayName, formatQueueTime } from '@/lib/queue-rows';
import { SOURCE_OPTIONS, buildContactQuery } from '@/lib/lead-filters';
import { DispositionDialog } from '@/components/calls/DispositionDialog';

export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  leadScore?: number;
  createdAt?: string;
}

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];

const sourceLabel = (value?: string) =>
  SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';

export default function LeadsList({
  onViewDetails,
  timeZone = 'Europe/Bucharest',
}: {
  onViewDetails?: (lead: Lead) => void;
  timeZone?: string;
}) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);

  const [dispositionFor, setDispositionFor] = useState<Lead | null>(null);

  const limit = 50;

  // Typing a name should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useMemo(
    () => buildContactQuery({ search, source, month, year, page, limit }),
    [search, source, month, year, page],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/contacts', { params: query });
      const data = res.data;
      setRows(Array.isArray(data) ? data : (data?.contacts ?? data?.data ?? []));
      setTotal(typeof data?.total === 'number' ? data.total : (data?.contacts?.length ?? 0));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca leadurile.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      {/* Filters: date and source. No pipeline — that is the point. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută după nume, email sau telefon…"
            className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={month === null ? '' : String(month)}
          onChange={(e) => {
            setMonth(e.target.value === '' ? null : Number(e.target.value));
            setPage(1);
          }}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="">Toate lunile</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setPage(1);
          }}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={load} className="ml-3 underline">
            Încearcă din nou
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <Users className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Niciun lead pentru filtrele alese</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              {total} {total === 1 ? 'lead' : 'leaduri'}
            </span>
            <span className="text-xs text-gray-500">
              Pagina {page} din {pages}
            </span>
          </div>

          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                <button
                  onClick={() => setDispositionFor(lead)}
                  className="min-w-[12rem] flex-1 text-left font-medium text-gray-900 hover:text-indigo-600 dark:text-white"
                >
                  {contactDisplayName(lead)}
                </button>

                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> {lead.phone}
                  </a>
                )}

                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {sourceLabel(lead.source)}
                </span>

                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" /> {formatQueueTime(lead.createdAt, timeZone)}
                </span>

                {onViewDetails && (
                  <button
                    onClick={() => onViewDetails(lead)}
                    className="text-xs text-gray-500 underline hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Detalii
                  </button>
                )}
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-700"
              >
                <ChevronLeft className="h-4 w-4" /> Înapoi
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-gray-700"
              >
                Înainte <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {dispositionFor && (
        <DispositionDialog
          contactId={dispositionFor.id}
          contactName={contactDisplayName(dispositionFor)}
          phone={dispositionFor.phone}
          onViewDetails={
            onViewDetails
              ? () => {
                  const lead = dispositionFor;
                  setDispositionFor(null);
                  onViewDetails(lead);
                }
              : undefined
          }
          onClose={() => setDispositionFor(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
