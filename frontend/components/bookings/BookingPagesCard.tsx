'use client';

/**
 * Versions of the booking page. "Principal" is the plain link; each variant
 * is the same team calendar under `?v=<id>` with its own age check and
 * questions — e.g. one with questions for book buyers, while Typeform's link
 * goes straight to the calendar.
 */

import { useEffect, useState } from 'react';
import { Check, Copy, ListChecks, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import BookingFormEditor from '@/components/bookings/BookingFormEditor';
import {
  EMPTY_BOOKING_FORM,
  MAX_VARIANTS,
  formOf,
  variantIdFrom,
  variantLink,
  type BookingForm,
  type BookingVariant,
} from '@/lib/booking-form';

const MAIN = '__main__';

export default function BookingPagesCard({ baseLink }: { baseLink: string }) {
  const [main, setMain] = useState<BookingForm>(EMPTY_BOOKING_FORM);
  const [variants, setVariants] = useState<BookingVariant[]>([]);
  const [tab, setTab] = useState<string>(MAIN);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/scheduling/booking-form'), api.get('/scheduling/booking-variants')])
      .then(([formRes, variantsRes]) => {
        setMain(formOf(formRes.data));
        setVariants(
          (Array.isArray(variantsRes.data) ? variantsRes.data : []).map((v: any) => ({ ...v, form: formOf(v.form) })),
        );
      })
      .catch(() => setError('Nu s-au putut încărca setările.'))
      .finally(() => setLoading(false));
  }, []);

  const current = tab === MAIN ? null : variants.find((v) => v.id === tab) ?? null;
  const form = current ? current.form : main;
  const setForm = (next: BookingForm) => {
    setSaved(false);
    if (!current) setMain(next);
    else setVariants((list) => list.map((v) => (v.id === current.id ? { ...v, form: next } : v)));
  };

  const addVariant = () => {
    const name = newName.trim();
    let id = variantIdFrom(name);
    if (!name || !id) {
      setError('Dă-i un nume variantei, ex. „Cumpărători carte”.');
      return;
    }
    while (variants.some((v) => v.id === id)) id = `${id}-2`;
    setVariants((list) => [...list, { id, name, form: EMPTY_BOOKING_FORM }]);
    setTab(id);
    setNewName('');
    setError('');
    setSaved(false);
  };

  const removeVariant = (id: string) => {
    setVariants((list) => list.filter((v) => v.id !== id));
    setTab(MAIN);
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const [formRes, variantsRes] = await Promise.all([
        api.put('/scheduling/booking-form', main),
        api.put('/scheduling/booking-variants', variants),
      ]);
      setMain(formOf(formRes.data));
      const stored: BookingVariant[] = (Array.isArray(variantsRes.data) ? variantsRes.data : []).map((v: any) => ({
        ...v,
        form: formOf(v.form),
      }));
      setVariants(stored);
      if (tab !== MAIN && !stored.some((v) => v.id === tab)) setTab(MAIN);
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Salvarea a eșuat.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="flex justify-center rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </section>
    );
  }

  const link = baseLink ? variantLink(baseLink, current?.id) : '';
  const tabClass = (on: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
      on
        ? 'bg-indigo-600 font-medium text-white'
        : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
    }`;

  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <ListChecks className="h-4 w-4 text-indigo-600" /> Înainte de calendar
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Același calendar al echipei, în mai multe variante: fiecare cu linkul ei și cu întrebările ei (sau fără).
          Răspunsurile apar la notițele programării.
        </p>
      </div>

      {/* Versions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab(MAIN)} className={tabClass(tab === MAIN)}>
          Principal
        </button>
        {variants.map((v) => (
          <button key={v.id} onClick={() => setTab(v.id)} className={tabClass(tab === v.id)}>
            {v.name}
          </button>
        ))}
        {variants.length < MAX_VARIANTS && (
          <span className="flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addVariant()}
              placeholder="Variantă nouă, ex. Carte"
              maxLength={60}
              className="w-44 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
            <button
              onClick={addVariant}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-600 dark:text-gray-300"
            >
              <Plus className="h-4 w-4" /> Adaugă
            </button>
          </span>
        )}
      </div>

      {/* This version's link */}
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-500">Link {current ? `„${current.name}”` : 'principal'}:</span>
          <code className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{link}</code>
          <button
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(link))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {copied === link ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === link ? 'Copiat' : 'Copiază'}
          </button>
          {current && (
            <button
              onClick={() => removeVariant(current.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Șterge varianta
            </button>
          )}
        </div>
      )}
      {current && !link && <p className="text-xs text-gray-500">Linkul apare după ce cineva își salvează programul.</p>}

      <BookingFormEditor value={form} onChange={setForm} />

      {!current && form.questions.length === 0 && !form.ageGate.enabled && (
        <p className="text-xs text-gray-500">Fără întrebări: leadul ajunge direct la calendar.</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvează
        </button>
        {saved && !saving && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> Salvat
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
