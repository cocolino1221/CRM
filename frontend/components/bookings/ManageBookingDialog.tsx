'use client';

/**
 * Move or cancel a booking — offered only to the closer who takes it (and to
 * admins/managers), the same rule the server enforces.
 *
 * Moving keeps the same closer and offers only that closer's free hours on
 * the chosen day. Cancelling sends the lead back to De sunat, which is what
 * a cancelled meeting means for the queue.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { contactDisplayName, formatQueueTime } from '@/lib/queue-rows';
import type { TeamSlot } from '@/lib/team-slots';

export interface ManagedBooking {
  id: string;
  startTime: string;
  contact?: { firstName?: string; lastName?: string; email?: string } | null;
  host?: { id: string; firstName?: string; lastName?: string; email?: string } | null;
}

function isoDate(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export default function ManageBookingDialog({
  booking,
  mode,
  timeZone = 'Europe/Bucharest',
  onClose,
  onDone,
}: {
  booking: ManagedBooking;
  mode: 'move' | 'cancel';
  timeZone?: string;
  onClose: () => void;
  /** Fired once the change is saved, so the list can reload. */
  onDone: () => void;
}) {
  const today = useMemo(() => isoDate(new Date(), timeZone), [timeZone]);
  const [date, setDate] = useState(() => isoDate(new Date(booking.startTime), timeZone));
  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hostId = booking.host?.id;
  const name = contactDisplayName(booking.contact);
  const timeOf = (iso: string) =>
    new Intl.DateTimeFormat('ro-RO', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const loadSlots = useCallback(async () => {
    if (mode !== 'move' || !date || !hostId) return;
    setLoading(true);
    setError('');
    setSlot('');
    try {
      const res = await api.get<TeamSlot[]>('/scheduling/team-slots', { params: { date } });
      const mine = (Array.isArray(res.data) ? res.data : []).filter((s) =>
        s.hosts?.some((h) => h.userId === hostId),
      );
      setSlots(mine);
    } catch (err: any) {
      setSlots([]);
      setError(err?.response?.data?.message || 'Nu s-au putut încărca orele libere.');
    } finally {
      setLoading(false);
    }
  }, [mode, date, hostId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      if (mode === 'move') {
        if (!slot) return;
        await api.patch(`/bookings/${booking.id}/reschedule`, { startTime: slot });
      } else {
        await api.patch(`/bookings/${booking.id}/cancel`, { reason: reason.trim() || undefined });
      }
      onDone();
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || 'Modificarea nu a putut fi salvată.');
      // The hour may have gone while the dialog was open.
      if (mode === 'move') void loadSlots();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'move' ? 'Mută programarea' : 'Anulează programarea'}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
      >
        <div className="mb-4 flex items-start gap-3">
          {mode === 'move' ? (
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          ) : (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {mode === 'move' ? `Mută programarea cu ${name}` : `Anulează programarea cu ${name}`}
            </h2>
            <p className="text-sm text-gray-500">Acum: {formatQueueTime(booking.startTime, timeZone)}</p>
          </div>
        </div>

        {mode === 'move' ? (
          <>
            <label htmlFor="move-date" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Data nouă
            </label>
            <input
              id="move-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Ora nouă</span>
            {loading ? (
              <div className="flex items-center justify-center py-5 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : slots.length ? (
              <div className="mb-3 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto pr-1">
                {slots.map((s) => (
                  <button
                    key={s.startTime}
                    type="button"
                    data-testid="move-slot"
                    onClick={() => setSlot(s.startTime)}
                    className={`rounded-lg border px-2 py-1.5 text-sm tabular-nums ${
                      slot === s.startTime
                        ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                  >
                    {timeOf(s.startTime)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mb-3 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700">
                Nicio oră liberă în ziua asta. Alege altă dată.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Lead-ul revine în „De sunat”, ca să fie sunat din nou.
            </p>
            <label htmlFor="cancel-reason" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Motiv (opțional)
            </label>
            <textarea
              id="cancel-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: a cerut să fie sunat săptămâna viitoare"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
          </>
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
            onClick={() => void submit()}
            disabled={saving || (mode === 'move' && !slot)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              mode === 'move' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving
              ? 'Se salvează…'
              : mode === 'move'
                ? slot
                  ? `Mută la ${timeOf(slot)}`
                  : 'Mută'
                : 'Anulează programarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
