'use client';

/**
 * Domains a workspace serves its landing pages on.
 *
 * The screen's real job is the copy-paste: whoever adds a domain is usually
 * in another browser tab looking at a DNS panel, and a record typed from
 * memory with one character wrong fails in a way nobody can see. So each
 * record is a field with its own copy button, and the failure message is the
 * server's own sentence, which names the exact record it looked for.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Globe, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { DomainRow, describeDomain, nextActionFor } from '@/lib/domain-status';

const TONE_STYLES: Record<string, string> = {
  live: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
  waiting: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  problem: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the value is on screen either way.
    }
  };

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <div className="flex items-stretch gap-1">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copiază ${label}`}
          className="shrink-0 rounded-lg border border-gray-300 px-2.5 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function DomainsSettings() {
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [hostname, setHostname] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<DomainRow[]>('/landing-pages/domains');
      setDomains(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca domeniile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await api.post<DomainRow>('/landing-pages/domains', { hostname });
      setDomains((prev) => [...prev, res.data]);
      setHostname('');
    } catch (err: any) {
      setAddError(err?.response?.data?.message || 'Nu s-a putut adăuga domeniul.');
    } finally {
      setAdding(false);
    }
  };

  const verify = async (id: string) => {
    setBusyId(id);
    try {
      const res = await api.post<DomainRow>(`/landing-pages/domains/${id}/verify`);
      setDomains((prev) => prev.map((d) => (d.id === id ? res.data : d)));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Verificarea a eșuat.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (domain: DomainRow) => {
    // Removing a live domain takes its pages offline immediately, so it is
    // worth one question.
    const live = domain.status === 'active';
    if (
      !window.confirm(
        live
          ? `Scoți ${domain.hostname}? Paginile servite pe el nu vor mai răspunde.`
          : `Scoți ${domain.hostname}?`,
      )
    ) {
      return;
    }
    setBusyId(domain.id);
    try {
      await api.delete(`/landing-pages/domains/${domain.id}`);
      setDomains((prev) => prev.filter((d) => d.id !== domain.id));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut scoate domeniul.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Globe className="h-5 w-5 text-indigo-600" /> Domenii proprii
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Servește paginile de prezentare pe domeniul tău, de exemplu{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">pagini.firma-ta.ro</code>.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="pagini.firma-ta.ro"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-[16rem] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          type="submit"
          disabled={adding || !hostname.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adaugă
        </button>
      </form>

      {addError && <p className="text-sm text-red-600">{addError}</p>}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}{' '}
          <button onClick={load} className="underline">
            Reîncarcă
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !domains.length ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <Globe className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            Niciun domeniu încă. Paginile sunt accesibile pe adresa implicită.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {domains.map((domain) => {
            const d = describeDomain(domain);
            const busy = busyId === domain.id;
            return (
              <li
                key={domain.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 font-medium text-gray-900 dark:text-white">
                    {domain.hostname}
                  </span>
                  {d.isPrimary && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      principal
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_STYLES[d.tone]}`}
                  >
                    {d.label}
                  </span>
                  {nextActionFor(domain) === 'verify' && (
                    <button
                      onClick={() => verify(domain.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-700"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Verifică
                    </button>
                  )}
                  <button
                    onClick={() => remove(domain)}
                    disabled={busy}
                    aria-label={`Scoate ${domain.hostname}`}
                    className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-sm text-gray-500">{d.detail}</p>

                {/* The records stay visible for a live domain too: removing
                    them later silently breaks the certificate renewal. */}
                {domain.dns && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <CopyField label={`${domain.dns.verification.type} — nume`} value={domain.dns.verification.name} />
                      <CopyField label="valoare" value={domain.dns.verification.value} />
                    </div>
                    <div className="space-y-2">
                      <CopyField label={`${domain.dns.pointing.type} — nume`} value={domain.dns.pointing.name} />
                      <CopyField label="valoare" value={domain.dns.pointing.value} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
