'use client';

/**
 * Which WooCommerce products bring a lead (the book) — those buyers go to
 * Leads to be called. An order with any other product is a sale and the
 * buyer goes straight to Win, with the amount paid.
 */

import { useState } from 'react';
import { Check, Loader2, Search, Trophy, UserPlus, X } from 'lucide-react';
import api from '@/lib/api';

interface Product {
  id: string;
  name: string;
  sku?: string;
}

export default function WooLeadProducts({
  integrationId,
  config,
  onSaved,
}: {
  integrationId: string;
  config: Record<string, any> | undefined;
  onSaved?: () => void;
}) {
  const [chosen, setChosen] = useState<Product[]>(() => {
    const stored = Array.isArray(config?.leadProducts) ? config!.leadProducts : [];
    const ids: string[] = Array.isArray(config?.leadProductIds) ? config!.leadProductIds.map(String) : [];
    return ids.map((id) => stored.find((p: Product) => String(p.id) === id) ?? { id, name: `Produs #${id}` });
  });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  // Products already stored count as saved, so past orders can be processed right away.
  const [saved, setSaved] = useState(() => Array.isArray(config?.leadProductIds) && config!.leadProductIds.length > 0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string>('');
  const [error, setError] = useState('');

  const find = async () => {
    setSearching(true);
    setError('');
    try {
      const res = await api.get(`/integrations/woocommerce/${integrationId}/products`, {
        params: { search: search.trim() || undefined },
      });
      setResults(Array.isArray(res.data?.products) ? res.data.products : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca produsele din magazin.');
    } finally {
      setSearching(false);
    }
  };

  const toggle = (product: Product) => {
    setSaved(false);
    setChosen((list) =>
      list.some((p) => p.id === product.id) ? list.filter((p) => p.id !== product.id) : [...list, product],
    );
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/integrations/${integrationId}`, {
        config: {
          leadProductIds: chosen.map((p) => p.id),
          leadProducts: chosen.map((p) => ({ id: p.id, name: p.name })),
        },
      });
      setSaved(true);
      onSaved?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Salvarea a eșuat.');
    } finally {
      setSaving(false);
    }
  };

  const applyToPast = async () => {
    setApplying(true);
    setError('');
    setApplied('');
    try {
      const { data } = await api.post(`/integrations/woocommerce/${integrationId}/apply-lead-products`);
      setApplied(
        `${data.won} vânzări mutate la Win` +
          (data.alreadyWon ? `, ${data.alreadyWon} erau deja` : '') +
          (data.failed ? `, ${data.failed} comenzi nu s-au putut citi din magazin` : '') +
          '.',
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut aplica.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-indigo-900 dark:text-indigo-200">
        <UserPlus className="h-4 w-4" /> Produse care aduc leaduri
      </h4>
      <p className="mt-1 text-xs text-indigo-800/80 dark:text-indigo-300/80">
        Cine cumpără doar aceste produse intră în <strong>Leads</strong> (Neprogramat, apoi Programat după ce își alege ora).
        O comandă cu orice alt produs e o vânzare: clientul merge direct la <strong>Win</strong>, cu suma plătită — și dacă era deja lead.
        Fără niciun produs ales, toate comenzile intră în Leads.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {chosen.length === 0 && <span className="text-xs text-gray-500">Niciun produs ales.</span>}
        {chosen.map((p) => (
          <span
            key={p.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-200"
          >
            <span className="truncate" title={p.name}>{p.name}</span>
            <button type="button" onClick={() => toggle(p)} aria-label="Scoate" className="text-gray-400 hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void find())}
          placeholder="Caută în produsele magazinului, ex. carte"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
        <button
          type="button"
          onClick={() => void find()}
          disabled={searching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Caută
        </button>
      </div>

      {results.length > 0 && (
        <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
          {results.map((p) => {
            const on = chosen.some((c) => c.id === p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-gray-400">#{p.id}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvează
        </button>
        <button
          type="button"
          onClick={() => void applyToPast()}
          disabled={applying || chosen.length === 0 || !saved}
          title={!saved ? 'Salvează întâi produsele' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:bg-gray-800 dark:text-indigo-300"
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Aplică și pe comenzile vechi
        </button>
        {saved && <span className="text-xs text-green-700">Salvat</span>}
      </div>
      {applied && <p className="mt-2 text-xs text-green-700">{applied}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
