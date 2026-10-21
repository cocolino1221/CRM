'use client';

import { useState } from 'react';
import { addTags, removeTag, splitDraft } from '@/lib/tags';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
}

/**
 * The box that was missing: tags were accepted by the API, shown on the lead
 * list and counted in analytics, but there was nowhere to type one.
 *
 * The rules live in lib/tags.ts, where they are covered by a spec that runs —
 * *.dom.spec.tsx cannot run in this monorepo yet (see vitest.config.ts).
 */
export function TagInput({ value, onChange, placeholder, id }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raws: string[]) => {
    const next = addTags(value, raws);
    if (next.length !== value.length) onChange(next);
  };

  return (
    <div className="rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              <span>{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(removeTag(value, tag))}
                className="text-blue-400 transition-colors hover:text-blue-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder ?? 'Adaugă un tag și apasă Enter'}
        onChange={(e) => {
          const { tags, draft: rest } = splitDraft(e.target.value);
          if (tags.length > 0) commit(tags);
          setDraft(rest);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // The box sits inside the lead form: without this, Enter saves the
            // lead with the tag still sitting unsent in the input.
            e.preventDefault();
            commit([draft]);
            setDraft('');
            return;
          }
          if (e.key === 'Backspace' && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        // A tag typed and then left alone — the usual way someone fills this in
        // before hitting Save — would otherwise be dropped.
        onBlur={() => {
          commit([draft]);
          setDraft('');
        }}
        className="w-full border-0 p-0 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
