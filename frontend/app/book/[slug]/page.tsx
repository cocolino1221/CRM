'use client';

/**
 * The page a Typeform lead lands on to pick an hour.
 *
 * It talks to the API directly rather than through lib/api: that instance
 * carries the CRM's auth interceptors, and everyone who opens this page is a
 * stranger with no account. `/book` is registered in lib/public-routes so the
 * app does not bounce them to a login screen.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, CheckCircle2, Clock, Loader2, PhoneCall } from 'lucide-react';
import {
  WORKSPACE_TIMEZONE,
  buildBookingPayload,
  buildCallbackPayload,
  callbackError,
  formatSlotTime,
  guestError,
  guestFromQuery,
  hostsLabel,
  nextDays,
  type Guest,
} from '@/lib/public-booking';
import { accentOf, backgroundStyle, toneOf, type BookingBranding } from '@/lib/booking-branding';
import {
  answersError,
  customAnswersFor,
  formOf,
  prefillQuery,
  type BookingForm,
} from '@/lib/booking-form';
import { unglueBookingLink } from '@/lib/glued-link';
import { trackingFromPage } from '@/lib/booking-tracking';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';
const DAYS_OFFERED = 14;

interface MeetingType {
  id: string;
  name: string;
  description?: string;
  duration: number;
  user?: { firstName?: string; lastName?: string };
  /** Logo, background, colours and texts set in Aspect pagină. */
  branding?: BookingBranding;
  /** The age check and the questions asked before the calendar. */
  form?: BookingForm;
}

interface Host {
  userId: string;
  meetingTypeId: string;
  name: string;
}

interface Slot {
  startTime: string;
  endTime: string;
  /** Everyone bookable at that hour. The lead picks the time first. */
  hosts: Host[];
}

export default function PublicBookingPage() {
  const params = useParams();
  const slug = String(params?.slug || '');

  const [days] = useState(() => nextDays(new Date(), DAYS_OFFERED));
  const [meeting, setMeeting] = useState<MeetingType | null>(null);
  const [day, setDay] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [host, setHost] = useState<Host | null>(null);
  const [askingCallback, setAskingCallback] = useState(false);
  const [callbackDone, setCallbackDone] = useState(false);
  const [guest, setGuest] = useState<Guest>({ name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  /** Typeform sent everything we need: the lead only picks the hour. */
  const [known, setKnown] = useState(false);
  const [editing, setEditing] = useState(false);

  // Read once on arrival. useSearchParams would force a Suspense boundary for
  // a value that never changes while the page is open.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const { guest: fromLink, complete } = guestFromQuery(params);
    setGuest(fromLink);
    setKnown(complete);

    // From a WooCommerce thank-you page (order + key) or a form the CRM
    // served (signed pass): the CRM answers with who it is. The order webhook
    // can land a few seconds after the thank-you page, so it asks a few times.
    const lookup = prefillQuery(params);
    if (!lookup || !slug) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
        if (attempt) await new Promise((r) => setTimeout(r, 2000));
        try {
          const res = await fetch(`${API_BASE}/scheduling/public/${encodeURIComponent(slug)}/prefill?${lookup}`, {
            cache: 'no-store',
          });
          const found = res.ok ? await res.json() : {};
          if (found?.name || found?.email) {
            if (cancelled) return;
            const next: Guest = { name: found.name || '', email: found.email || '', phone: found.phone || '' };
            setGuest(next);
            setKnown(!!next.name && !!next.email && guestError(next) === null);
            return;
          }
        } catch {
          // Try again; in the end the lead simply types their details.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Before the calendar: the age check, then the workspace's own questions.
  const form = formOf(meeting?.form);
  const [age, setAge] = useState<'unknown' | 'ok' | 'under'>('unknown');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionsDone, setQuestionsDone] = useState(false);
  const gatePassed = !form.ageGate.enabled || age === 'ok';
  const ready = gatePassed && (form.questions.length === 0 || questionsDone);
  const askDetails = !known || editing;
  const canCallBack = !!guest.name.trim() && !!guest.phone?.trim();

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ code?: string; startTime: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        // `?v=` picks a version of the page, with its own questions.
        const variant = new URLSearchParams(window.location.search).get('v');
        const qs = variant ? `?v=${encodeURIComponent(variant)}` : '';
        const res = await fetch(`${API_BASE}/scheduling/public/${encodeURIComponent(slug)}${qs}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('not found');
        const found = await res.json();
        // The answers came glued onto the slug: reload the link done right.
        const fixed = unglueBookingLink(slug, String(found?.slug || ''), window.location.search);
        if (fixed) {
          window.location.replace(fixed);
          return;
        }
        setMeeting(found);
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
    setHost(null);
    try {
      const qs = new URLSearchParams({ date: day, timezone: WORKSPACE_TIMEZONE });
      // team-slots, not slots: whoever is free at an hour, across the team.
      const res = await fetch(
        `${API_BASE}/scheduling/public/${encodeURIComponent(slug)}/team-slots?${qs}`,
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
    const target = host ?? chosen?.hosts?.[0] ?? null;
    if (!chosen || !target) return;
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
        body: JSON.stringify({
          ...buildBookingPayload({
            // The hour decides the person, so the booking belongs to their
            // meeting type, not to whoever's link was pasted into Typeform.
            meetingTypeId: target.meetingTypeId,
            startTime: chosen.startTime,
            guest,
            notes,
            customAnswers: customAnswersFor(form, answers, age === 'ok'),
            variant: new URLSearchParams(window.location.search).get('v') || undefined,
          }),
          // Where they came from: becomes the new lead's source.
          tracking: trackingFromPage(window.location.search, document.referrer, window.location.hostname),
        }),
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

  /**
   * The way out of choosing. The lead becomes a contact with no booking,
   * which is what the De sunat queue is, and everyone who works the phone is
   * told — so "I cannot decide" costs a lead nothing.
   */
  const askToBeCalled = async () => {
    const form = { name: guest.name, phone: guest.phone ?? '', email: guest.email, notes };
    const invalid = callbackError(form);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE}/scheduling/public/${encodeURIComponent(slug)}/callback-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...buildCallbackPayload(form),
            tracking: trackingFromPage(window.location.search, document.referrer, window.location.hostname),
          }),
        },
      );
      if (!res.ok) throw new Error('Nu am putut trimite cererea.');
      setCallbackDone(true);
    } catch (err: any) {
      setError(err?.message || 'Nu am putut trimite cererea.');
    } finally {
      setSubmitting(false);
    }
  };

  const branding = meeting?.branding;
  const tone = toneOf(branding);
  const onBg = tone === 'light'
    ? { title: 'text-white', text: 'text-white/85', muted: 'text-white/70' }
    : { title: 'text-gray-900', text: 'text-gray-700', muted: 'text-gray-500' };
  // The accent travels as a CSS variable so every button and selected chip
  // follows it without a style prop each.
  const frame = { ...backgroundStyle(branding), ['--accent' as string]: accentOf(branding) } as CSSProperties;

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

  if (callbackDone) {
    return (
      <main style={frame} className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <PhoneCall className="mx-auto h-12 w-12 text-[var(--accent)]" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Te sunăm noi</h1>
          <p className="mt-2 text-sm text-gray-600">
            Un coleg te contactează în curând ca să stabiliți ora împreună.
          </p>
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main style={frame} className="flex min-h-screen items-center justify-center px-4">
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


  return (
    <div style={frame} className="min-h-screen">
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="text-center">
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="mx-auto mb-4 max-h-16 max-w-[12rem] object-contain" />
        )}
        <h1 className={`text-2xl font-bold ${onBg.title}`}>{branding?.title || meeting.name}</h1>
        {branding?.welcome && <p className={`mt-2 whitespace-pre-line text-sm ${onBg.text}`}>{branding.welcome}</p>}
        {known && (
          <p className={`mt-2 text-sm ${onBg.text}`}>
            Mulțumim, {guest.name.split(' ')[0]}! Mai rămâne doar să alegi ora.
          </p>
        )}
        <p className={`mt-2 flex flex-wrap items-center justify-center gap-4 text-sm ${onBg.muted}`}>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" /> {meeting.duration} minute
          </span>
          {/* No host here: this is the team's page, and who takes the call is
              decided by the hour picked — not by whose link was shared. */}
        </p>
        {meeting.description && (
          <p className={`mt-3 text-sm ${onBg.text}`}>{meeting.description}</p>
        )}
      </header>

      {form.ageGate.enabled && age !== 'ok' && (
        <section className="mx-auto mt-8 max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center">
          {age === 'under' ? (
            <p className="whitespace-pre-line text-sm text-gray-700">{form.ageGate.blockedMessage}</p>
          ) : (
            <>
              <p className="text-base font-semibold text-gray-900">Ai cel puțin {form.ageGate.minAge} ani?</p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={() => setAge('ok')}
                  className="rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Da, am {form.ageGate.minAge}+ ani
                </button>
                <button
                  onClick={() => setAge('under')}
                  className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Nu
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {gatePassed && form.questions.length > 0 && !questionsDone && (
        <section className="mx-auto mt-8 max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
          {form.questions.map((q) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-gray-900">
                {q.label}
                {q.required && <span className="text-red-500"> *</span>}
              </p>
              {q.type === 'text' ? (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(q.type === 'yesno' ? ['Da', 'Nu'] : q.options ?? []).map((option) => {
                    const on = answers[q.id] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: option }))}
                        className={`rounded-xl border px-4 py-2 text-sm ${
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => {
              const problem = answersError(form, answers);
              if (problem) {
                setError(problem);
                return;
              }
              setError('');
              setQuestionsDone(true);
            }}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Continuă spre calendar
          </button>
        </section>
      )}

      {ready && (<>
      <section className="mt-8">
        <h2 className={`flex items-center gap-2 text-sm font-semibold ${onBg.text}`}>
          <Calendar className="h-4 w-4" /> Alege ziua
        </h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {days.map((d) => (
            <button
              key={d.param}
              onClick={() => setDay(d.param)}
              className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm ${
                day === d.param
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className={`text-sm font-semibold ${onBg.text}`}>Alege ora</h2>
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
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {formatSlotTime(slot.startTime)}
              </button>
            ))}
          </div>
        )}
      </section>

      {chosen && chosen.hosts.length > 1 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700">Cu cine vrei să vorbești?</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {chosen.hosts.map((h) => (
              <button
                key={h.meetingTypeId}
                onClick={() => setHost(h)}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  (host ?? chosen.hosts[0]).meetingTypeId === h.meetingTypeId
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {h.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {chosen && (
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
          {!askDetails ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-700">
                Programare pentru <strong>{guest.name}</strong>
                <span className="block text-xs text-gray-500">{guest.email}</span>
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Nu ești tu? Modifică
              </button>
            </div>
          ) : (
          <>
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
              type="tel"
              inputMode="tel"
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              placeholder="Telefon"
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
          </>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {submitting
              ? 'Se confirmă…'
              : `Confirmă ${formatSlotTime(chosen.startTime)} cu ${(host ?? chosen.hosts[0])?.name ?? hostsLabel(chosen.hosts)}`}
          </button>
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
        {!askingCallback ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Nu găsești o oră care să-ți convină?
            </p>
            <button
              onClick={() => {
                setError('');
                // Name and number came with the link: nothing to ask, just send.
                if (known && canCallBack && !editing) void askToBeCalled();
                else setAskingCallback(true);
              }}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-white px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-gray-50"
            >
              <PhoneCall className="h-4 w-4" /> Vreau să fiu sunat
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Te sunăm noi</h2>
            <p className="text-xs text-gray-500">
              Lasă-ne un nume și un număr. Un coleg te caută ca să stabiliți ora.
            </p>
            <input
              value={guest.name}
              onChange={(e) => setGuest({ ...guest, name: e.target.value })}
              placeholder="Nume și prenume"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={guest.phone}
              onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
              placeholder="Telefon"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => void askToBeCalled()}
                disabled={submitting}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? 'Se trimite…' : 'Trimite'}
              </button>
              <button
                onClick={() => setAskingCallback(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-white"
              >
                Renunț
              </button>
            </div>
          </div>
        )}
      </section>
      </>)}
    </main>
    </div>
  );
}
