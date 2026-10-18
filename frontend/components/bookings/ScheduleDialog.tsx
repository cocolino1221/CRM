'use client';

/**
 * "Programează manual" — a setter books a closer's slot without the lead ever
 * touching the public booking link.
 *
 * Until now the only way into the Programați queue was a booking the lead made
 * itself; the disposition dialog could record that a link was sent, but it
 * created nothing. A lead that agreed to a time on the phone stayed in De sunat.
 *
 * The hours offered come from /bookings/available-slots, so the setter cannot
 * invent an hour the closer does not work — the backend refuses those anyway
 * (BadRequestException), and a refusal after the lead hung up is useless.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { contactDisplayName, formatQueueTime, type QueueContactRef } from '@/lib/queue-rows';

interface Slot {
  startTime: string;
  endTime: string;
  available?: boolean;
}

interface Host {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

/**
 * Who may hold a meeting. Managers and admins run their own calls in small
 * teams, and a workspace with no dedicated closer would otherwise show an
 * empty dropdown and block scheduling entirely.
 */
const HOST_ROLES = ['closer', 'manager', 'admin'];

const DURATIONS = [30, 45, 60];

/** `YYYY-MM-DD` in the given timezone — the format available-slots expects. */
function isoDate(date: Date, timeZone: string): string {
  try {
    // en-CA gives ISO order, and formatToParts would be the same work.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export default function ScheduleDialog({
  contact,
  timeZone = 'Europe/Bucharest',
  onClose,
  onScheduled,
}: {
  contact: QueueContactRef;
  timeZone?: string;
  onClose: () => void;
  /** Fired after the booking exists, so the caller can refresh its lists. */
  onScheduled?: () => void;
}) {
  const today = useMemo(() => isoDate(new Date(), timeZone), [timeZone]);

  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostId, setHostId] = useState('');
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState('');

  const [loadingHosts, setLoadingHosts] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const name = contactDisplayName(contact);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<Host[]>('/users');
        if (cancelled) return;
        const list = (res.data ?? []).filter((u) =>
          HOST_ROLES.includes(String(u.role ?? '').toLowerCase()),
        );
        setHosts(list);
        if (list.length === 1) setHostId(list[0].id);
      } catch {
        if (!cancelled) setError('Nu s-a putut încărca lista de closeri.');
      } finally {
        if (!cancelled) setLoadingHosts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSlots = useCallback(async () => {
    if (!hostId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setError('');
    // A stale slot staying selected while another closer's hours load would
    // submit the wrong hour, so the choice is dropped on every reload.
    setSlot('');
    try {
      const res = await api.get<Slot[]>(`/bookings/available-slots/${hostId}`, {
        params: { date },
      });
      setSlots(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setSlots([]);
      setError(err?.response?.data?.message || 'Nu s-au putut încărca orele libere.');
    } finally {
      setLoadingSlots(false);
    }
  }, [hostId, date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const submit = async () => {
    if (!hostId || !slot) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/bookings', {
        hostId,
        // The exact string the slots endpoint returned, so the hour the setter
        // picked is the hour stored — no re-parsing in the browser's timezone.
        startTime: slot,
        duration,
        contactId: contact.id,
        notes: notes.trim() || undefined,
        timezone: timeZone,
      });
      onScheduled?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Programarea nu a putut fi salvată.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Programează manual"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <div className="mb-4 flex items-start gap-3">
          <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Programează {name}
            </h2>
            <p className="text-sm text-gray-500">
              Lead-ul trece din „De sunat" în „Programați".
            </p>
          </div>
        </div>

        <div className="mb-3">
          <label
            htmlFor="schedule-host"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Closer
          </label>
          <select
            id="schedule-host"
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            disabled={loadingHosts}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">{loadingHosts ? 'Se încarcă…' : 'Alege closerul'}</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {`${h.firstName ?? ''} ${h.lastName ?? ''}`.trim() || h.email}
              </option>
            ))}
          </select>
          {!loadingHosts && !hosts.length && (
            <p className="mt-1 text-xs text-amber-600">
              Niciun closer în workspace — adaugă unul înainte de a programa.
            </p>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="schedule-date"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Data
            </label>
            <input
              id="schedule-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          <div>
            <label
              htmlFor="schedule-duration"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              Durată
            </label>
            <select
              id="schedule-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Ora
          </span>
          {!hostId ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700">
              Alege întâi closerul.
            </p>
          ) : loadingSlots ? (
            <div className="flex items-center justify-center py-5 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : slots.length ? (
            <div className="grid max-h-44 grid-cols-3 gap-2 overflow-y-auto pr-1">
              {slots.map((s) => (
                <button
                  key={s.startTime}
                  type="button"
                  data-testid="schedule-slot"
                  onClick={() => setSlot(s.startTime)}
                  className={`rounded-lg border px-2 py-1.5 text-sm transition ${
                    slot === s.startTime
                      ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  {new Intl.DateTimeFormat('ro-RO', {
                    timeZone,
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(s.startTime))}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700">
              Nicio oră liberă în ziua asta. Alege altă dată.
            </p>
          )}
        </div>

        <div className="mb-3">
          <label
            htmlFor="schedule-notes"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Notiță (opțional)
          </label>
          <textarea
            id="schedule-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        {slot && (
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            Se programează pentru <strong>{formatQueueTime(slot, timeZone)}</strong>.
          </p>
        )}

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!hostId || !slot || saving}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Se salvează…' : 'Programează'}
          </button>
        </div>
      </div>
    </div>
  );
}
