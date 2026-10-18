'use client';

/**
 * "Programează manual" — a setter books a closer's slot without the lead ever
 * touching the public booking link.
 *
 * Until now the only way into the Programați queue was a booking the lead made
 * itself; the disposition dialog could record that a link was sent, but it
 * created nothing. A lead that agreed to a time on the phone stayed in De sunat.
 *
 * The date comes first and the person last: the dialog shows every hour
 * anyone in the team is free (/scheduling/team-slots), coloured by closer, and
 * only asks who takes it when more than one person is free at the hour picked.
 * The setter cannot invent an hour nobody works — the backend refuses those
 * anyway, and a refusal after the lead hung up is useless.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { contactDisplayName, formatQueueTime, type QueueContactRef } from '@/lib/queue-rows';
import { hostColors, resolveHost, slotsForHost, type TeamSlot } from '@/lib/team-slots';

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

  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [slot, setSlot] = useState('');
  const [hostId, setHostId] = useState<string | null>(null);
  /** Show only one closer's hours; null shows everyone. */
  const [filter, setFilter] = useState<string | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const name = contactDisplayName(contact);

  const loadSlots = useCallback(async () => {
    if (!date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setError('');
    // A stale hour staying selected while another day loads would submit the
    // wrong hour, so the choice is dropped on every reload.
    setSlot('');
    try {
      const res = await api.get<TeamSlot[]>('/scheduling/team-slots', { params: { date } });
      setSlots(Array.isArray(res.data) ? res.data.filter((s) => s.hosts?.length) : []);
    } catch (err: any) {
      setSlots([]);
      setError(err?.response?.data?.message || 'Nu s-au putut încărca orele libere.');
    } finally {
      setLoadingSlots(false);
    }
  }, [date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const colors = useMemo(() => hostColors(slots), [slots]);
  const colorOf = useMemo(() => new Map(colors.map((c) => [c.userId, c.color])), [colors]);
  const visible = useMemo(() => slotsForHost(slots, filter), [slots, filter]);
  const picked = useMemo(() => slots.find((s) => s.startTime === slot) ?? null, [slots, slot]);

  // A filter for someone not free at all on the new day would show nothing.
  useEffect(() => {
    if (filter && !colorOf.has(filter)) setFilter(null);
  }, [filter, colorOf]);

  const pickSlot = (s: TeamSlot) => {
    setSlot(s.startTime);
    setHostId(resolveHost(s, hostId ?? filter));
  };

  const timeOf = (iso: string) =>
    new Intl.DateTimeFormat('ro-RO', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
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
          {colors.length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Filtrează după closer">
              <button
                type="button"
                onClick={() => setFilter(null)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  filter === null
                    ? 'border-gray-800 bg-gray-800 text-white dark:border-gray-200 dark:bg-gray-200 dark:text-gray-900'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                Toți
              </button>
              {colors.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => setFilter(filter === c.userId ? null : c.userId)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                    filter === c.userId
                      ? 'font-medium text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                  style={filter === c.userId ? { backgroundColor: c.color, borderColor: c.color } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: filter === c.userId ? '#fff' : c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {loadingSlots ? (
            <div className="flex items-center justify-center py-5 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : visible.length ? (
            <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1">
              {visible.map((s) => {
                const selected = slot === s.startTime;
                const only = s.hosts.length === 1 ? colorOf.get(s.hosts[0].userId) : undefined;
                return (
                  <button
                    key={s.startTime}
                    type="button"
                    data-testid="schedule-slot"
                    onClick={() => pickSlot(s)}
                    title={s.hosts.map((h) => h.name).join(', ')}
                    className={`relative rounded-lg border px-2 pb-2.5 pt-1.5 text-sm transition ${
                      selected
                        ? 'border-blue-500 bg-blue-50 font-medium text-blue-700 ring-2 ring-blue-500/40 dark:bg-blue-950 dark:text-blue-200'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                    style={!selected && only ? { borderLeftColor: only, borderLeftWidth: 4 } : undefined}
                  >
                    {timeOf(s.startTime)}
                    <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                      {s.hosts.map((h) => (
                        <span
                          key={h.userId}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: colorOf.get(h.userId) }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700">
              {slots.length
                ? 'Closerul ales nu are ore libere în ziua asta.'
                : 'Nicio oră liberă în ziua asta. Alege altă dată sau verifică orele din Disponibilitate.'}
            </p>
          )}
        </div>

        {picked && (
          <div className="mb-3">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Closer {picked.hosts.length > 1 && <span className="font-normal text-gray-500">— liberi la {timeOf(picked.startTime)}</span>}
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Closer">
              {picked.hosts.map((h) => {
                const active = hostId === h.userId;
                const color = colorOf.get(h.userId);
                return (
                  <button
                    key={h.userId}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setHostId(h.userId)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      active ? 'font-medium text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                    style={active ? { backgroundColor: color, borderColor: color } : undefined}
                  >
                    {active ? <Check className="h-3.5 w-3.5" /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
                    {h.name}
                  </button>
                );
              })}
            </div>
            {!hostId && <p className="mt-1 text-xs text-amber-600">Alege cine preia programarea.</p>}
          </div>
        )}

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

        {slot && hostId && (
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            Se programează pentru <strong>{formatQueueTime(slot, timeZone)}</strong> cu{' '}
            <strong>{picked?.hosts.find((h) => h.userId === hostId)?.name}</strong>.
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
