'use client';

/**
 * Editing the sections of a landing page.
 *
 * The page used to be a hero and a bullet list, and the editor matched it.
 * These are the parts that actually persuade — proof, faces, before and
 * after — so they need somewhere to be typed.
 *
 * Every list operation goes through lib/section-edit.ts, which copies rather
 * than mutates: React state edited in place does not re-render, and the
 * screen then shows old text while the draft holds new, which reads as the
 * editor losing work.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  FITNESS_CONSULT_PRESET,
  SECTION_LIBRARY,
  type LandingSection,
  type SectionType,
} from '@/lib/landing-sections';
import ImageUploadField from '@/components/landing/ImageUploadField';
import {
  addSection,
  addSectionItem,
  itemsKeyFor,
  moveSection,
  removeSection,
  removeSectionItem,
  updateSection,
  updateSectionItem,
} from '@/lib/section-edit';

const input =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800';

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>
      {textarea ? (
        <textarea
          rows={3}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={input}
        />
      ) : (
        <input
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={input}
        />
      )}
    </label>
  );
}

/** The fields one section type needs, beyond its list of items. */
function SectionFields({
  section,
  onPatch,
}: {
  section: LandingSection;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  switch (section.type) {
    case 'video':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Adresa video"
            value={section.url}
            placeholder="https://…/clip.mp4"
            onChange={(v) => onPatch({ url: v })}
          />
          <Field label="Text sub video" value={section.caption} onChange={(v) => onPatch({ caption: v })} />
        </div>
      );

    case 'guarantee':
      return (
        <div className="space-y-3">
          <Field label="Titlu" value={section.title} onChange={(v) => onPatch({ title: v })} />
          <Field label="Text" value={section.text} textarea onChange={(v) => onPatch({ text: v })} />
        </div>
      );

    case 'coach':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nume" value={section.name} onChange={(v) => onPatch({ name: v })} />
            <ImageUploadField
              label="Poză"
              value={section.photo}
              onChange={(v) => onPatch({ photo: v })}
            />
          </div>
          <Field
            label="Calificări (separate prin virgulă)"
            value={(section.credentials || []).join(', ')}
            onChange={(v) =>
              onPatch({ credentials: v.split(',').map((s) => s.trim()).filter(Boolean) })
            }
          />
          <Field label="Despre" value={section.bio} textarea onChange={(v) => onPatch({ bio: v })} />
        </div>
      );

    case 'text':
      return (
        <div className="space-y-3">
          <Field label="Titlu" value={section.title} onChange={(v) => onPatch({ title: v })} />
          <Field label="Text" value={section.body} textarea onChange={(v) => onPatch({ body: v })} />
        </div>
      );

    default:
      return (
        <Field
          label="Titlul secțiunii"
          value={(section as any).title}
          onChange={(v) => onPatch({ title: v })}
        />
      );
  }
}

/** The fields one row inside a section needs. */
function ItemFields({
  type,
  item,
  onPatch,
}: {
  type: string;
  item: any;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  switch (type) {
    case 'socialProof':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cifra" value={item.value} placeholder="500+" onChange={(v) => onPatch({ value: v })} />
          <Field label="Ce înseamnă" value={item.label} placeholder="clienți transformați" onChange={(v) => onPatch({ label: v })} />
        </div>
      );

    case 'testimonials':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nume" value={item.name} placeholder="Andreea M." onChange={(v) => onPatch({ name: v })} />
            <Field
              label="Rezultatul"
              value={item.result}
              placeholder="−12 kg în 4 luni"
              onChange={(v) => onPatch({ result: v })}
            />
          </div>
          <Field label="Ce spune" value={item.text} textarea onChange={(v) => onPatch({ text: v })} />
          <ImageUploadField label="Poză" value={item.photo} onChange={(v) => onPatch({ photo: v })} />
        </div>
      );

    case 'beforeAfter':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageUploadField
              label="Poza „înainte”"
              value={item.beforeImage}
              onChange={(v) => onPatch({ beforeImage: v })}
            />
            <ImageUploadField
              label="Poza „după”"
              value={item.afterImage}
              onChange={(v) => onPatch({ afterImage: v })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Durata" value={item.label} placeholder="4 luni" onChange={(v) => onPatch({ label: v })} />
            <Field label="Cine" value={item.caption} placeholder="Andreea, 34 de ani" onChange={(v) => onPatch({ caption: v })} />
          </div>
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-3">
          <Field label="Întrebarea" value={item.question} onChange={(v) => onPatch({ question: v })} />
          <Field label="Răspunsul" value={item.answer} textarea onChange={(v) => onPatch({ answer: v })} />
        </div>
      );

    default:
      // whatYouGet and steps share a shape.
      return (
        <div className="space-y-3">
          <Field label="Titlu" value={item.title} onChange={(v) => onPatch({ title: v })} />
          <Field label="Detaliu" value={item.description} onChange={(v) => onPatch({ description: v })} />
        </div>
      );
  }
}

export default function SectionsEditor({
  sections,
  onChange,
  onApplyPreset,
}: {
  sections: LandingSection[];
  onChange: (next: LandingSection[]) => void;
  onApplyPreset: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Secțiuni</h3>
          <p className="text-xs text-gray-500">
            Ordinea de aici este ordinea de pe pagină. Dovada înaintea întrebărilor.
          </p>
        </div>
        <button
          type="button"
          onClick={onApplyPreset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
        >
          <Sparkles className="h-4 w-4" /> Șablon fitness
        </button>
      </div>

      {!sections.length && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
          Nicio secțiune. Pagina va arăta doar titlul și formularul.
        </p>
      )}

      <ul className="space-y-2">
        {sections.map((section, i) => {
          const definition = SECTION_LIBRARY.find((s) => s.type === section.type);
          const itemsKey = itemsKeyFor(section);
          const items: any[] = itemsKey ? ((section as any)[itemsKey] ?? []) : [];
          const open = openIndex === i;

          return (
            <li
              key={i}
              className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex-1 text-left"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {definition?.label ?? section.type}
                  </span>
                  {definition && (
                    <span className="ml-2 text-xs text-gray-400">{definition.hint}</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Mută mai sus"
                  disabled={i === 0}
                  onClick={() => onChange(moveSection(sections, i, i - 1))}
                  className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Mută mai jos"
                  disabled={i === sections.length - 1}
                  onClick={() => onChange(moveSection(sections, i, i + 1))}
                  className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Șterge secțiunea"
                  onClick={() => onChange(removeSection(sections, i))}
                  className="rounded p-1 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {open && (
                <div className="space-y-4 border-t border-gray-100 px-3 py-4 dark:border-gray-700">
                  <SectionFields
                    section={section}
                    onPatch={(patch) => onChange(updateSection(sections, i, patch))}
                  />

                  {itemsKey && (
                    <div className="space-y-3">
                      {items.map((item, j) => (
                        <div
                          key={j}
                          className="relative rounded-lg bg-gray-50 p-3 dark:bg-gray-900"
                        >
                          <button
                            type="button"
                            aria-label="Șterge rândul"
                            onClick={() => onChange(removeSectionItem(sections, i, j))}
                            className="absolute right-2 top-2 rounded p-1 text-gray-400 hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <ItemFields
                            type={section.type}
                            item={item}
                            onPatch={(patch) => onChange(updateSectionItem(sections, i, j, patch))}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => onChange(addSectionItem(sections, i))}
                        className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adaugă rând
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Ce adaugi?</span>
            <button type="button" onClick={() => setAdding(false)} aria-label="Renunță">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTION_LIBRARY.map((definition) => (
              <button
                key={definition.type}
                type="button"
                onClick={() => {
                  onChange(addSection(sections, definition.type as SectionType));
                  setOpenIndex(sections.length);
                  setAdding(false);
                }}
                className="rounded-lg border border-gray-200 p-3 text-left hover:border-indigo-400 dark:border-gray-700"
              >
                <span className="block text-sm font-medium text-gray-900 dark:text-white">
                  {definition.label}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{definition.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-700"
        >
          <Plus className="h-4 w-4" /> Adaugă secțiune
        </button>
      )}
    </div>
  );
}
