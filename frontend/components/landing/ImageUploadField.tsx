'use client';

/**
 * An image field that can be typed into or uploaded to.
 *
 * Self-contained on purpose: the editor's original version took the upload
 * handler and the "which field is busy" flag as props, which worked at one
 * level of nesting and would have meant threading both through the section
 * list, the section, and the row. Each field owning its own state costs
 * nothing and keeps the section editor readable.
 *
 * The address field stays editable. Plenty of these images already live
 * somewhere — a site, a Drive link — and forcing a re-upload to use one
 * would be busywork.
 */

import { useRef, useState } from 'react';
import { ImageOff, Loader2, Upload, X } from 'lucide-react';
import api from '@/lib/api';
import { rejectReasonFor } from '@/lib/image-upload';

export default function ImageUploadField({
  label,
  value,
  onChange,
  subfolder = 'landing-pages',
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  subfolder?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [broken, setBroken] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pick = async (file: File | undefined) => {
    setError('');
    // Checked here so a 12 MB phone photo is refused before it crawls up a
    // mobile connection, not after.
    const reason = rejectReasonFor(file);
    if (reason) {
      setError(reason);
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file as File);
      fd.append('subfolder', subfolder);
      const res = await api.post('/upload/single', fd);
      const url = res.data?.url;
      if (!url) throw new Error('Serverul nu a returnat adresa imaginii.');
      setBroken(false);
      onChange(url);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Încărcarea a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </span>

      <div className="flex gap-2">
        <input
          value={value ?? ''}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          placeholder="https://… sau încarcă"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Se încarcă…' : 'Încarcă'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              setBroken(false);
              onChange('');
            }}
            aria-label={`Șterge ${label}`}
            className="shrink-0 rounded-lg border border-gray-300 px-2 text-gray-500 hover:text-red-600 dark:border-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          // Cleared so picking the same file twice still fires a change.
          e.target.value = '';
        }}
      />

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {/* A pasted address that does not resolve is the common way one of
          these ends up blank on the live page, so say so here. */}
      {value && !broken && (
        <img
          src={value}
          alt=""
          onError={() => setBroken(true)}
          className="mt-2 h-20 rounded-lg border border-gray-200 object-cover dark:border-gray-700"
        />
      )}
      {value && broken && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-600">
          <ImageOff className="h-3.5 w-3.5" /> Adresa nu încarcă nicio imagine.
        </p>
      )}
    </div>
  );
}
