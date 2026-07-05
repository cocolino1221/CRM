'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Upload, Trash2, Send, LoaderCircle, X, Music4 } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export type AudioSendChannel = 'messenger' | 'instagram' | 'whatsapp';

interface AudioTemplate {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

const AUDIO_LIBRARY_MAX = 10;

interface AudioLibraryPickerProps {
  channel: AudioSendChannel;
  to?: string;
  integrationId?: string;
  disabled?: boolean;
  onSent?: () => void;
}

export default function AudioLibraryPicker({
  channel,
  to,
  integrationId,
  disabled,
  onSent,
}: AudioLibraryPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AudioTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/audio-library');
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load audio library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError('');
      setNotice('');
      try {
        const form = new FormData();
        form.append('file', file);
        if (name.trim()) form.append('name', name.trim());
        const res = await api.post('/audio-library', form);
        setItems((prev) => [...prev, res.data]);
        setName('');
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Upload failed');
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [name],
  );

  const remove = useCallback(async (id: string) => {
    setDeletingId(id);
    setError('');
    try {
      await api.delete(`/audio-library/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete clip');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const send = useCallback(
    async (id: string) => {
      if (!to) return;
      setSendingId(id);
      setError('');
      setNotice('');
      try {
        await api.post(`/audio-library/${id}/send`, {
          channel,
          to,
          integrationId: integrationId || undefined,
        });
        setNotice('Audio sent.');
        onSent?.();
        setOpen(false);
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Could not send audio');
      } finally {
        setSendingId(null);
      }
    },
    [channel, to, integrationId, onSent],
  );

  const canSend = !!to && !disabled;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Audio templates"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50',
          open && 'border-slate-400 bg-slate-50',
        )}
      >
        <Mic className="h-4 w-4" />
        Audio
      </button>

      {open && (
        <div className="absolute bottom-full z-40 mb-2 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Music4 className="h-4 w-4 text-slate-500" />
              Audio templates
              <span className="text-xs font-normal text-slate-400">
                {items.length}/{AUDIO_LIBRARY_MAX}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!canSend && (
            <p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
              Open a conversation to send an audio clip.
            </p>
          )}
          {error && <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
          {notice && <p className="mb-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">{notice}</p>}

          <div className="max-h-64 space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No audio clips saved yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-800">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void send(item.id)}
                        disabled={!canSend || sendingId === item.id}
                        title={canSend ? 'Send to conversation' : 'Open a conversation first'}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingId === item.id ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        Send
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        disabled={deletingId === item.id}
                        title="Delete"
                        className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      >
                        {deletingId === item.id ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls preload="none" src={item.url} className="h-8 w-full" />
                </div>
              ))
            )}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clip name (optional)"
              className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-slate-400"
            />
            <label
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50',
                (uploading || items.length >= AUDIO_LIBRARY_MAX) && 'cursor-not-allowed opacity-50',
              )}
            >
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {items.length >= AUDIO_LIBRARY_MAX ? 'Library full (10/10)' : 'Upload audio clip'}
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={uploading || items.length >= AUDIO_LIBRARY_MAX}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
