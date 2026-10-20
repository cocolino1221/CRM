'use client';

/**
 * The age check and the questions for one version of the booking page.
 * Controlled: the parent holds the value and saves it.
 */

import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  MAX_QUESTIONS,
  newQuestion,
  type BookingForm,
  type BookingQuestion,
  type BookingQuestionType,
} from '@/lib/booking-form';

const TYPES: Array<{ value: BookingQuestionType; label: string }> = [
  { value: 'text', label: 'Text liber' },
  { value: 'choice', label: 'Variante' },
  { value: 'yesno', label: 'Da / Nu' },
];

export default function BookingFormEditor({
  value,
  onChange,
}: {
  value: BookingForm;
  onChange: (next: BookingForm) => void;
}) {
  const form = value;
  const setForm = (update: (f: BookingForm) => BookingForm) => onChange(update(form));
  const patchGate = (change: Partial<BookingForm['ageGate']>) =>
    setForm((f) => ({ ...f, ageGate: { ...f.ageGate, ...change } }));
  const patchQuestion = (id: string, change: Partial<BookingQuestion>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.id === id ? { ...q, ...change } : q)) }));

  return (
    <div className="space-y-5">
      {/* Age */}
      <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-700">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
          <input
            type="checkbox"
            checked={form.ageGate.enabled}
            onChange={(e) => patchGate({ enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          <ShieldCheck className="h-4 w-4 text-indigo-600" /> Restricție de vârstă
        </label>
        {form.ageGate.enabled && (
          <div className="mt-3 space-y-3 pl-6">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              Vârsta minimă:
              {([16, 18] as const).map((age) => (
                <button
                  key={age}
                  type="button"
                  onClick={() => patchGate({ minAge: age })}
                  className={`rounded-lg border px-3 py-1 text-sm ${
                    form.ageGate.minAge === age
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  {age}+
                </button>
              ))}
            </div>
            <label className="block text-xs text-gray-500">
              Mesaj pentru cine e sub {form.ageGate.minAge} ani (nu mai vede calendarul)
              <textarea
                value={form.ageGate.blockedMessage}
                onChange={(e) => patchGate({ blockedMessage: e.target.value })}
                rows={2}
                maxLength={400}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </label>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {form.questions.map((q, i) => (
          <div key={q.id} className="space-y-2 rounded-xl border border-gray-100 p-4 dark:border-gray-700">
            <div className="flex items-start gap-2">
              <span className="mt-2 text-xs font-semibold text-gray-400">{i + 1}.</span>
              <input
                value={q.label}
                onChange={(e) => patchQuestion(q.id, { label: e.target.value })}
                placeholder="Întrebarea, ex. „Care e obiectivul tău?”"
                maxLength={200}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, questions: f.questions.filter((x) => x.id !== q.id) }))}
                aria-label="Șterge întrebarea"
                className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-5">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() =>
                    patchQuestion(q.id, {
                      type: t.value,
                      options: t.value === 'choice' ? q.options ?? ['', ''] : undefined,
                    })
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs ${
                    q.type === t.value
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => patchQuestion(q.id, { required: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                Obligatorie
              </label>
            </div>
            {q.type === 'choice' && (
              <label className="block pl-5 text-xs text-gray-500">
                Variante, câte una pe rând (minim 2)
                <textarea
                  value={(q.options ?? []).join('\n')}
                  onChange={(e) => patchQuestion(q.id, { options: e.target.value.split('\n') })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </label>
            )}
          </div>
        ))}

        {form.questions.length < MAX_QUESTIONS && (
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, questions: [...f.questions, newQuestion(f.questions)] }))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-gray-600 dark:text-gray-300"
          >
            <Plus className="h-4 w-4" /> Adaugă întrebare
          </button>
        )}
      </div>

    </div>
  );
}
