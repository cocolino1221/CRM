'use client';

/**
 * Where a closer says when they can be booked.
 *
 * Until this screen existed the availability table was written by nothing at
 * all, so every closer had an empty week and the public booking page — the one
 * a Typeform lead is sent to — would have had no slots to show for anyone.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Loader2, Save } from 'lucide-react';
import api from '@/lib/api';
import {
  WEEKDAYS,
  buildMeetingSlug,
  dayError,
  planAvailabilityChanges,
  randomSuffix,
  type DayRow,
  type Weekday,
} from '@/lib/booking-settings';

interface ServerAvailability {
  id: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
}

interface MeetingType {
  id: string;
  name: string;
  slug: string;
  duration: number;
  isActive?: boolean;
}

/** A week nobody has touched yet: weekdays nine to five, weekend off. */
const DEFAULT_WEEK = (): DayRow[] =>
  WEEKDAYS.map(({ value }) => ({
    dayOfWeek: value,
    startTime: '09:00',
    endTime: '17:00',
    enabled: value !== 'saturday' && value !== 'sunday',
  }));

export default function BookingSettingsPage() {
  const [days, setDays] = useState<DayRow[]>(DEFAULT_WEEK);
  const [existing, setExisting] = useState<ServerAvailability[]>([]);
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [meetingName, setMeetingName] = useState('Consultație');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [availRes, typesRes] = await Promise.all([
        api.get('/scheduling/availability'),
        api.get('/scheduling/meeting-types'),
      ]);

      const rows: ServerAvailability[] = Array.isArray(availRes.data) ? availRes.data : [];
      setExisting(rows);
      setDays(
        WEEKDAYS.map(({ value }) => {
          const row = rows.find((r) => r.dayOfWeek === value);
          return row
            ? { dayOfWeek: value, startTime: row.startTime.slice(0, 5), endTime: row.endTime.slice(0, 5), enabled: true }
            : { dayOfWeek: value, startTime: '09:00', endTime: '17:00', enabled: false };
        }),
      );

      const types: MeetingType[] = Array.isArray(typesRes.data) ? typesRes.data : [];
      // One closer, one bookable meeting. More than one needs a picker the
      // public page does not have yet, so the first is the one that counts.
      const first = types[0] ?? null;
      setMeeting(first);
      if (first) {
        setMeetingName(first.name);
        setDuration(first.duration);
      }
      // A week that has never been saved starts from the sensible default.
      if (!rows.length) setDays(DEFAULT_WEEK());
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca setările.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const errors = useMemo(() => days.map(dayError), [days]);
  const hasError = errors.some(Boolean) || !meetingName.trim();

  const patch = (index: number, change: Partial<DayRow>) =>
    setDays((prev) => prev.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const save = async () => {
    if (hasError) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      // The meeting type first: availability without something to book is
      // still useless, and this is the call most likely to be refused.
      const payload = { name: meetingName.trim(), duration };
      if (meeting) {
        await api.put(`/scheduling/meeting-types/${meeting.id}`, payload);
      } else {
        await api.post('/scheduling/meeting-types', {
          ...payload,
          // The backend stores the slug as given and the column is unique
          // across every workspace, so it is minted here.
          slug: buildMeetingSlug(meetingName, randomSuffix()),
          isActive: true,
        });
      }

      const plan = planAvailabilityChanges(existing, days);
      for (const row of plan.create) await api.post('/scheduling/availability', row);
      for (const row of plan.update) await api.put(`/scheduling/availability/${row.id}`, row);
      for (const id of plan.remove) await api.delete(`/scheduling/availability/${id}`);

      await load();
      setSaved(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Salvarea a eșuat.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Calendar className="h-6 w-6 text-indigo-600" /> Disponibilitate
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Orele în care poți fi programat. Leadul vede doar zilele pornite aici.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Tipul întâlnirii</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex-1 min-w-[12rem] text-xs text-gray-500">
            Nume
            <input
              value={meetingName}
              onChange={(e) => setMeetingName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              placeholder="Consultație"
            />
          </label>
          <label className="w-32 text-xs text-gray-500">
            Durată (min)
            <input
              type="number"
              min={5}
              max={480}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>
        {meeting && (
          <p className="mt-3 text-xs text-gray-500">
            Identificatorul public al paginii tale:{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">{meeting.slug}</code>
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {days.map((row, i) => (
            <li key={row.dayOfWeek} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <label className="flex w-32 items-center gap-2 font-medium text-gray-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => patch(i, { enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {WEEKDAYS[i].label}
              </label>

              <input
                type="time"
                value={row.startTime}
                disabled={!row.enabled}
                onChange={(e) => patch(i, { startTime: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="text-gray-400">–</span>
              <input
                type="time"
                value={row.endTime}
                disabled={!row.enabled}
                onChange={(e) => patch(i, { endTime: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
              />

              {errors[i] && <span className="text-xs text-red-600">{errors[i]}</span>}
              {!row.enabled && <span className="text-xs text-gray-400">liber</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || hasError}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Se salvează…' : 'Salvează'}
        </button>
        {saved && !saving && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> Salvat
          </span>
        )}
      </div>
    </div>
  );
}
