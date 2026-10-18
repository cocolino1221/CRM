'use client';

/**
 * The page a Typeform lead lands on to pick an hour.
 *
 * It talks to the API directly rather than through lib/api: that instance
 * carries the CRM's auth interceptors, and everyone who opens this page is a
 * stranger with no account. `/book` is registered in lib/public-routes so the
 * app does not bounce them to a login screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, CheckCircle2, Clock, Loader2, User } from 'lucide-react';
import {
  WORKSPACE_TIMEZONE,
  buildBookingPayload,
  formatSlotTime,
  guestError,
  nextDays,
  type Guest,
} from '@/lib/public-booking';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';
const DAYS_OFFERED = 14;

interface MeetingType {
  id: string;
  name: string;
  description?: string;
  duration: number;
  user?: { firstName?: string; lastName?: string };
}

interface Slot {
  startTime: string;
  endTime: string;
}

export default function PublicBookingPage() {
  const params = useParams();
  const slug = String(params?.slug || '');

  const [days] = useState(() => nextDays(new Date(), DAYS_OFFERED));
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [day, setDay] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [guest, setGuest] = useState<Guest>({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ code?: string; startTime: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/scheduling/public/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('not found');
        setMeeting(await res.json());
        setDay(days[0]?.param || '');
      } catch {
        setError('Pagina de programare nu există sau nu mai este activă.');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, days]);

  const loadSlots = useCallback(async () => {
    if (!slug || !day) return;
    setLoadingSlots(true);
    setChosen(null);
    try {
      const qs = new URLSearchParams({ date: day, timezone: WORKSPACE_TIMEZONE });
      const res = await fetch(
        `${API_BASE}/scheduling/public/${encodeURIComponent(slug)}/slots?${qs}`,
        { cache: 'no-store' },
      );
      setSlots(res.ok ? await res.json() : []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, day]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const submit = async () => {
    if (!meeting || !chosen) return;
    const invalid = guestError(guest);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/scheduling/public/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildBookingPayload({
            meetingTypeId: meeting.id,
            startTime: chosen.startTime,
            guest,
            notes,
          }),
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'Ora aceasta nu mai este liberă.');
      }
      const booking = await res.json();
      setConfirmation({ code: booking?.confirmationCode, startTime: chosen.startTime });
    } catch (err: any) {
      setError(err?.message || 'Programarea nu a putut fi salvată.');
      // The hour may have been taken while the form was being filled in.
      void loadSlots();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (!meeting) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
          {error || 'Pagina de programare nu există.'}
        </p>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Programare confirmată</h1>
          <p className="mt-2 text-sm text-gray-600">
            Te așteptăm pe {new Intl.DateTimeFormat('ro-RO', {
              timeZone: WORKSPACE_TIMEZONE,
              dateStyle: 'full',
              timeStyle: 'short',
            }).format(new Date(confirmation.startTime))}.
          </p>
          {confirmation.code && (
            <p className="mt-4 text-xs text-gray-500">
              Cod: <code className="rounded bg-gray-100 px-1.5 py-0.5">{confirmation.code}</code>
            </p>
          )}
        </div>
      </main>
    );
  }

  const hostName = `${meeting.user?.firstName ?? ''} ${meeting.user?.lastName ?? ''}`.trim();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">{meeting.name}</h1>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {meeting.duration} minute
          </span>
          {hostName && (
            <span className="inline-flex items-center gap-1">
              <User className="h-4 w-4" /> {hostName}
            </span>
          )}
        </p>
        {meeting.description && (
          <p className="mt-3 text-sm text-gray-600">{meeting.description}</p>
        )}
      </header>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Calendar className="h-4 w-4" /> Alege ziua
        </h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {days.map((d) => (
            <button
              key={d.param}
              onClick={() => setDay(d.param)}
              className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm ${
                day === d.param
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700">Alege ora</h2>
        {loadingSlots ? (
          <div className="flex justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <p className="mt-3 rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            Nicio oră liberă în ziua asta. Încearcă altă zi.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.startTime}
                onClick={() => setChosen(slot)}
                className={`rounded-xl border px-2 py-2 text-sm tabular-nums ${
                  chosen?.startTime === slot.startTime
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {formatSlotTime(slot.startTime)}
              </button>
            ))}
          </div>
        )}
      </section>

      {chosen && (
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-700">Datele tale</h2>
          <div className="mt-3 space-y-3">
            <input
              value={guest.name}
              onChange={(e) => setGuest({ ...guest, name: e.target.value })}
              placeholder="Nume și prenume"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={guest.email}
              onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              placeholder="Email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              placeholder="Telefon (opțional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ceva ce ar trebui să știm (opțional)"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Se confirmă…' : `Confirmă pentru ${formatSlotTime(chosen.startTime)}`}
          </button>
        </section>
      )}
    </main>
  );
}
