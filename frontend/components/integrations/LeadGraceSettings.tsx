'use client';

/**
 * How long a fresh lead is left alone before a setter may ring it.
 *
 * Someone who has just bought a book is often seconds away from booking a
 * call themselves. Calling mid-booking wastes the call, so each source gets
 * a few quiet minutes first. Nothing is written to the lead: it simply does
 * not appear in "De sunat" yet, and if it books in the meantime it shows up
 * under "Programați" instead.
 */

import { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface LeadGrace {
  typeform: number;
  woocommerce: number;
  manual: number;
}

const SOURCES: Array<{ key: keyof LeadGrace; label: string; hint: string }> = [
  { key: 'woocommerce', label: 'WooCommerce', hint: 'Cumpără o carte, apoi se programează' },
  { key: 'typeform', label: 'Typeform', hint: 'Completează formularul' },
  { key: 'manual', label: 'Adăugat manual', hint: 'Îl introduce cineva din echipă' },
];

export default function LeadGraceSettings() {
  const [grace, setGrace] = useState<LeadGrace | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<LeadGrace>('/workspaces/current/lead-grace')
      .then((res) => {
        if (!cancelled) setGrace(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Nu s-au putut încărca setările.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!grace) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await api.put<LeadGrace>('/workspaces/current/lead-grace', grace);
      setGrace(res.data);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Setările nu au putut fi salvate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Așteptare înainte de „De sunat"
        </h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Câte minute lăsăm un lead nou să se programeze singur înainte să apară în lista de sunat.
        Dacă se programează între timp, trece direct în „Programați". 0 înseamnă imediat.
      </p>

      {!grace && !error ? (
        <div className="flex items-center py-4 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {SOURCES.map((s) => (
              <div key={s.key}>
                <label
                  htmlFor={`grace-${s.key}`}
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  {s.label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={`grace-${s.key}`}
                    type="number"
                    min={0}
                    max={1440}
                    value={grace?.[s.key] ?? 0}
                    onChange={(e) =>
                      setGrace((g) =>
                        g ? { ...g, [s.key]: Math.max(0, Number(e.target.value) || 0) } : g,
                      )
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  />
                  <span className="text-sm text-gray-500">min</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{s.hint}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !grace}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Se salvează…' : 'Salvează'}
            </button>
            {saved && <span className="text-sm text-green-600">Salvat</span>}
            {error && (
              <span role="alert" className="text-sm text-red-600">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
