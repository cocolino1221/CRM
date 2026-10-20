'use client';

/**
 * Where a closer says when they can be booked.
 *
 * A week grid rather than one start–end per day: a closer is not a shop, and
 * a day of 09:00–10:00, 11:30–12:30 and 16:00–18:00 has to be sayable. Cells
 * are painted by click or drag; contiguous cells are saved as one window.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MeetingPreferenceCard from '@/components/bookings/MeetingPreferenceCard';
import BookingFormCard from '@/components/bookings/BookingFormCard';
import { Calendar, Check, Copy, Eraser, ExternalLink, Loader2, Palette, Save } from 'lucide-react';
import api from '@/lib/api';
import {
  SLOT_INTERVALS,
  WEEKDAYS,
  buildMeetingSlug,
  cellState,
  defaultWeek,
  emptyWeek,
  planAvailabilityChanges,
  randomSuffix,
  rangeUnits,
  toTime,
  unitsToIntervals,
  weekFromRows,
  type SlotInterval,
  type WeekUnits,
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
  slotInterval?: number;
  isActive?: boolean;
}

/** The part of the day shown unless the closer asks for all of it. */
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

const SHORT_DAY: Record<Weekday, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mie',
  thursday: 'Joi',
  friday: 'Vin',
  saturday: 'Sâm',
  sunday: 'Dum',
};

const WORKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const cloneWeek = (week: WeekUnits): WeekUnits =>
  Object.fromEntries(WEEKDAYS.map(({ value }) => [value, new Set(week[value])])) as WeekUnits;

/** True when some selected unit falls outside the default visible hours. */
const outsideDefault = (week: WeekUnits) =>
  WEEKDAYS.some(({ value }) => [...week[value]].some((m) => m < DAY_START || m >= DAY_END));

export default function BookingSettingsPage() {
  const [week, setWeek] = useState<WeekUnits>(defaultWeek);
  const [existing, setExisting] = useState<ServerAvailability[]>([]);
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [meetingName, setMeetingName] = useState('Consultație');
  const [duration, setDuration] = useState(30);
  const [step, setStep] = useState<SlotInterval>(30);
  const [fullDay, setFullDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

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
      // A week that has never been saved starts from the sensible default.
      const loaded = rows.length ? weekFromRows(rows) : defaultWeek();
      setWeek(loaded);
      if (outsideDefault(loaded)) setFullDay(true);

      const types: MeetingType[] = Array.isArray(typesRes.data) ? typesRes.data : [];
      // One closer, one bookable meeting. More than one needs a picker the
      // public page does not have yet, so the first is the one that counts.
      const first = types[0] ?? null;
      setMeeting(first);
      if (first) {
        setMeetingName(first.name);
        setDuration(first.duration);
        const interval = Number(first.slotInterval);
        if ((SLOT_INTERVALS as readonly number[]).includes(interval)) setStep(interval as SlotInterval);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca setările.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------- painting ----------

  const paint = useRef<{ mode: 'add' | 'remove'; last: string } | null>(null);

  const applyCell = useCallback(
    (day: Weekday, start: number, mode: 'add' | 'remove') => {
      setWeek((prev) => {
        const next = cloneWeek(prev);
        for (const m of rangeUnits(start, start + step)) {
          if (mode === 'add') next[day].add(m);
          else next[day].delete(m);
        }
        return next;
      });
      setSaved(false);
    },
    [step],
  );

  const cellFromPoint = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest<HTMLElement>('[data-cell]');
    if (!cell) return null;
    return { day: cell.dataset.day as Weekday, start: Number(cell.dataset.start) };
  };

  const onPointerDown = (e: React.PointerEvent, day: Weekday, start: number) => {
    e.preventDefault();
    // The first cell decides the stroke: start on an empty cell and the drag
    // fills, start on a full one and it erases.
    const mode = cellState(week[day], start, step) === 'all' ? 'remove' : 'add';
    paint.current = { mode, last: `${day}|${start}` };
    applyCell(day, start, mode);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!paint.current) return;
    // Touch pointers are captured by the first cell, so the target is useless;
    // the point under the finger is what was dragged over.
    const hit = cellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    const key = `${hit.day}|${hit.start}`;
    if (key === paint.current.last) return;
    paint.current.last = key;
    applyCell(hit.day, hit.start, paint.current.mode);
  };

  useEffect(() => {
    const stop = () => {
      paint.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  // ---------- quick actions ----------

  const copyMondayToWorkdays = () => {
    setWeek((prev) => {
      const next = cloneWeek(prev);
      for (const day of WORKDAYS) next[day] = new Set(prev.monday);
      return next;
    });
    setSaved(false);
  };

  const clearDay = (day: Weekday) => {
    setWeek((prev) => ({ ...cloneWeek(prev), [day]: new Set<number>() }));
    setSaved(false);
  };

  const clearAll = () => {
    setWeek(emptyWeek());
    setSaved(false);
  };

  // ---------- derived ----------

  const rangeStart = fullDay ? 0 : DAY_START;
  const rangeEnd = fullDay ? 24 * 60 : DAY_END;
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = rangeStart; m < rangeEnd; m += step) out.push(m);
    return out;
  }, [rangeStart, rangeEnd, step]);

  const plan = useMemo(() => planAvailabilityChanges(existing, week), [existing, week]);
  const meetingChanged =
    !meeting ||
    meeting.name !== meetingName.trim() ||
    meeting.duration !== duration ||
    (meeting.slotInterval ?? 15) !== step;
  const dirty = plan.create.length > 0 || plan.remove.length > 0 || meetingChanged;
  const durationError = !Number.isInteger(duration) || duration < 5 || duration > 480;
  const hasError = !meetingName.trim() || durationError;
  const totalWindows = WEEKDAYS.reduce((n, { value }) => n + unitsToIntervals(week[value]).length, 0);

  const save = async () => {
    if (hasError) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      // The meeting type first: availability without something to book is
      // still useless, and this is the call most likely to be refused.
      const payload = { name: meetingName.trim(), duration, slotInterval: step };
      if (meeting) {
        await api.put(`/scheduling/meeting-types/${meeting.id}`, payload);
      } else {
        await api.post('/scheduling/meeting-types', {
          ...payload,
          // The backend stores the slug as given and the column is unique
          // across every workspace, so it is minted here.
          slug: buildMeetingSlug(meetingName, randomSuffix()),
          isActive: true,
          // getMeetingTypeBySlug filters on isPublic, which the column
          // defaults to false — without this the booking page 404s.
          isPublic: true,
        });
      }

      // The column defaults to UTC, but the grid is in the viewer's own
      // clock — without this a 09:00 start is read as 11:00.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest';
      // New windows before old ones go, so a failure halfway leaves the
      // closer bookable rather than with an empty week.
      for (const row of plan.create) await api.post('/scheduling/availability', { ...row, timezone });
      for (const id of plan.remove) await api.delete(`/scheduling/availability/${id}`);

      await load();
      setSaved(true);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(' ') : message || 'Salvarea a eșuat.');
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

  // The page renders only after the client has loaded, so window is there.
  // The public page lives on the same origin as this dashboard.
  const bookingLink = meeting ? `${window.location.origin}/book/${meeting.slug}` : '';

  const showLabel = (m: number) => step >= 30 || m % 60 === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
          <Calendar className="h-6 w-6 text-indigo-600" /> Disponibilitate
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Marchează în calendar orele în care poți fi programat. Leadul vede doar intervalele colorate.
        </p>
        </div>
        <Link
          href="/booking-settings/aspect"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Palette className="h-4 w-4" /> Aspectul paginii
        </Link>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <MeetingPreferenceCard />

      <BookingFormCard />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Tipul întâlnirii</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="min-w-[12rem] flex-1 text-xs text-gray-500">
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
        {durationError && <p className="mt-2 text-xs text-red-600">Durata trebuie să fie între 5 și 480 de minute.</p>}
        {meeting && (
          <div className="mt-3 text-xs text-gray-500">
            Linkul pe care îl primește leadul ca să-și aleagă ora:
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">{bookingLink}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(bookingLink).then(() => setCopied(true));
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiat' : 'Copiază'}
              </button>
              <a
                href={bookingLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Deschide
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            Pas
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
              {SLOT_INTERVALS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStep(value);
                    setSaved(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    step === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {value} min
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
              disabled={outsideDefault(week)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Toată ziua (00–24)
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyMondayToWorkdays}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Copy className="h-3.5 w-3.5" /> Copiază Luni pe Lun–Vin
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Eraser className="h-3.5 w-3.5" /> Golește tot
            </button>
          </div>
        </div>

        <p className="px-4 pt-3 text-xs text-gray-500">
          Click sau trage peste celule ca să marchezi orele libere; trage peste celule colorate ca să le ștergi. Leadul
          poate alege un început din {step} în {step} minute.
        </p>

        <div
          className="max-h-[32rem] select-none overflow-y-auto px-2 pb-3 pt-2 sm:px-4"
          onPointerMove={onPointerMove}
        >
          <div className="grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] gap-x-1">
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800" />
            {WEEKDAYS.map(({ value, label }) => (
              <div
                key={value}
                className="sticky top-0 z-10 bg-white pb-1 text-center text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                title={label}
              >
                {SHORT_DAY[value]}
              </div>
            ))}

            {rows.map((m) => (
              <div key={m} className="contents">
                <div className="-mt-1.5 pr-1 text-right text-[10px] leading-none tabular-nums text-gray-400">
                  {showLabel(m) ? toTime(m) : ''}
                </div>
                {WEEKDAYS.map(({ value, label }) => {
                  const state = cellState(week[value], m, step);
                  return (
                    <div
                      key={value}
                      data-cell
                      data-day={value}
                      data-start={m}
                      role="checkbox"
                      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                      aria-label={`${label} ${toTime(m)}–${toTime(m + step)}`}
                      tabIndex={0}
                      onPointerDown={(e) => onPointerDown(e, value, m)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          applyCell(value, m, state === 'all' ? 'remove' : 'add');
                        }
                      }}
                      style={{ touchAction: 'none' }}
                      className={`h-6 cursor-pointer border-t ${
                        m % 60 === 0 ? 'border-gray-200 dark:border-gray-600' : 'border-gray-100 dark:border-gray-700'
                      } ${
                        state === 'all'
                          ? 'bg-indigo-500 hover:bg-indigo-600'
                          : state === 'some'
                            ? 'bg-indigo-200 hover:bg-indigo-300 dark:bg-indigo-900'
                            : 'bg-gray-50 hover:bg-indigo-100 dark:bg-gray-900/40 dark:hover:bg-indigo-950'
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
          Rezumat
        </h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {WEEKDAYS.map(({ value, label }) => {
            const intervals = unitsToIntervals(week[value]);
            return (
              <li key={value} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="w-24 font-medium text-gray-900 dark:text-white">{label}</span>
                {intervals.length === 0 ? (
                  <span className="text-xs text-gray-400">liber</span>
                ) : (
                  intervals.map((i) => (
                    <span
                      key={i.startTime}
                      className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      {i.startTime}–{i.endTime === '23:59' ? '24:00' : i.endTime}
                    </span>
                  ))
                )}
                {intervals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearDay(value)}
                    className="ml-auto text-xs text-gray-400 hover:text-red-600"
                  >
                    Golește
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || hasError || !dirty}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Se salvează…' : 'Salvează'}
        </button>
        {saved && !saving && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> Salvat
          </span>
        )}
        {dirty && !saving && <span className="text-xs text-amber-600">Modificări nesalvate</span>}
        {totalWindows === 0 && (
          <span className="text-xs text-red-600">Nicio oră marcată — leadul nu va putea programa nimic.</span>
        )}
      </div>
    </div>
  );
}
