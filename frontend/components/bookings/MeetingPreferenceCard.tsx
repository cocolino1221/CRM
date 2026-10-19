'use client';

/**
 * "Platforma mea de întâlniri" — which link a closer's bookings get by
 * default. Saved on the closer's own user preferences; a setter can still
 * pick another platform for a single booking.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Video } from 'lucide-react';
import api from '@/lib/api';
import { PROVIDER_LABELS, type MeetingProvider, type MeetingProvidersInfo } from '@/lib/meeting-providers';

export default function MeetingPreferenceCard() {
  const [info, setInfo] = useState<MeetingProvidersInfo | null>(null);
  const [value, setValue] = useState<MeetingProvider | ''>('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<MeetingProvidersInfo>('/bookings/meeting-providers')
      .then((res) => {
        setInfo(res.data);
        setValue(res.data.preference ?? '');
      })
      .catch(() => setError('Nu s-au putut încărca platformele.'));
  }, []);

  const save = async (next: MeetingProvider | '') => {
    setValue(next);
    setSaved('');
    setError('');
    try {
      await api.patch('/auth/me', { preferences: { meetingProvider: next || null } });
      setSaved('Salvat.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut salva.');
    }
  };

  const options: Array<{ value: MeetingProvider | ''; label: string; disabled?: boolean }> = [
    { value: '', label: 'Automat (Google Meet dacă e conectat, altfel Zoom)' },
    { value: 'google_meet', label: PROVIDER_LABELS.google_meet, disabled: !info?.google_meet },
    { value: 'zoom', label: PROVIDER_LABELS.zoom, disabled: !info?.zoom },
    { value: 'none', label: 'Fără link (sun eu)' },
  ];
  const nothingConnected = info && !info.google_meet && !info.zoom;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
        <Video className="h-4 w-4 text-indigo-600" /> Platforma mea de întâlniri
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        La fiecare programare cu tine se creează automat un link și se trimite pe email lead-ului și ție.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value || 'auto'}
            type="button"
            disabled={o.disabled}
            onClick={() => void save(o.value)}
            className={`rounded-lg border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              value === o.value
                ? 'border-indigo-600 bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200'
            }`}
          >
            {o.label}
            {o.disabled ? ' — neconectat' : ''}
          </button>
        ))}
      </div>
      {nothingConnected && (
        <p className="mt-3 text-xs text-amber-700">
          Nicio platformă conectată. Conectează Google sau Zoom din{' '}
          <Link href="/integrations" className="underline">
            Integrations
          </Link>
          .
        </p>
      )}
      {saved && <p className="mt-2 text-xs text-green-700">{saved}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
