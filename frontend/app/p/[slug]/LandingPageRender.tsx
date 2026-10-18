'use client';

/**
 * The public landing page.
 *
 * Two things decide whether this page earns anything, and both are structural
 * rather than cosmetic. The form sits beside the headline on a wide screen
 * instead of below the copy, so a visitor who is already convinced never has
 * to go looking for it. And on a phone — where most of this traffic arrives —
 * a sticky bar keeps the call-to-action on screen through the whole scroll.
 *
 * There is exactly one form instance on the page. A second copy in the footer
 * would double the conversion surface and also double the state, and the two
 * would drift apart the first time someone typed into one and submitted the
 * other.
 *
 * The submit, UTM capture and view tracking below are unchanged from the
 * original renderer: they work and they are what the reporting counts.
 */

import { useEffect, useMemo, useState } from 'react';
import { normalizeSections, type LandingSection } from '@/lib/landing-sections';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface PublicForm {
  id: string;
  name: string;
  fields: FormField[];
  settings?: any;
}

interface Props {
  slug: string;
  initialPage: any;
  initialForm: PublicForm | null;
  /** Template gallery preview: no view tracking, and the form doesn't submit. */
  preview?: boolean;
}

function readUtms(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = q.get(k);
    if (v) out[k] = v;
  });
  if (document.referrer) out.referrer = document.referrer;
  return out;
}

export default function LandingPageRender({ slug, initialPage, initialForm, preview = false }: Props) {
  const page = initialPage;
  const form = initialForm;
  const hero = page.content?.hero || {};
  const theme = page.content?.theme || {};
  const isTypeform = page.captureType === 'typeform';
  const sections = useMemo<LandingSection[]>(
    () => normalizeSections(page.content),
    [page.content],
  );
  const sticky = page.content?.stickyCta;

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two identical buttons on screen at once reads as a mistake, so the sticky
  // bar stands down while the form itself is visible.
  const [formOnScreen, setFormOnScreen] = useState(true);

  const utms = useMemo(() => readUtms(), []);

  // Fire a tracked view (raw + unique cookie dedup) once on mount. The host
  // goes along so the view is counted against the right workspace's page.
  useEffect(() => {
    if (preview) return;
    const qs = new URLSearchParams({ host: window.location.host });
    fetch(`${API_BASE}/landing-pages/public/${slug}?${qs}`, { credentials: 'include' }).catch(
      () => {},
    );
  }, [slug, preview]);

  useEffect(() => {
    const el = document.getElementById('formular');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setFormOnScreen(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const typeformSrc = useMemo(() => {
    if (!isTypeform || !page.typeformConfig?.formId) return '';
    const qs = new URLSearchParams(utms).toString();
    return `https://form.typeform.com/to/${page.typeformConfig.formId}${qs ? `#${qs}` : ''}`;
  }, [isTypeform, page.typeformConfig, utms]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (preview) {
      setDone({ message: 'Aceasta este o previzualizare — formularul real apare pe pagina publicată.' });
      return;
    }
    setSubmitting(true);
    try {
      const qs = new URLSearchParams({ host: window.location.host });
      const res = await fetch(`${API_BASE}/landing-pages/public/${slug}/submit?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values, trackingData: utms }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Trimiterea a eșuat');
      }
      const body = await res.json();
      if (body.redirectUrl) {
        window.location.href = body.redirectUrl;
        return;
      }
      setDone({ message: body.successMessage || 'Gata! Te sunăm în cel mai scurt timp.' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accent = hero.accentColor || theme.accentColor || '#2563eb';
  const bg = theme.backgroundColor || '#0b1120';
  const text = theme.textColor || '#f8fafc';
  const card = theme.cardColor || '#ffffff';

  const scrollToForm = () => {
    document.getElementById('formular')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const formCard = (
    <div
      id="formular"
      className="rounded-2xl border border-black/5 p-6 text-gray-900 shadow-2xl sm:p-8"
      style={{ background: card }}
    >
      {isTypeform ? (
        page.typeformConfig?.formId ? (
          <iframe
            title="Formular"
            src={typeformSrc}
            className="h-[500px] w-full rounded-xl border-0"
          />
        ) : (
          <p className="text-gray-500">Formularul nu este disponibil.</p>
        )
      ) : !form ? (
        <p className="text-gray-500">Formularul nu este disponibil.</p>
      ) : done ? (
        <div className="py-6 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white"
            style={{ background: accent }}
          >
            ✓
          </div>
          <p className="text-lg font-semibold text-gray-900">{done.message}</p>
        </div>
      ) : (
        <>
          {hero.ctaLabel && (
            <p className="mb-1 text-lg font-bold text-gray-900">{hero.ctaLabel}</p>
          )}
          {hero.formNote && <p className="mb-4 text-sm text-gray-500">{hero.formNote}</p>}
          <form onSubmit={submit} className="space-y-4">
            {form.fields.map((f) => (
              <div key={f.id}>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    required={f.required}
                    placeholder={f.placeholder}
                    value={values[f.id] || ''}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5"
                  />
                ) : f.type === 'select' ? (
                  <select
                    required={f.required}
                    value={values[f.id] || ''}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5"
                  >
                    <option value="">Alege…</option>
                    {(f.options || []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    // The phone field is the whole point of this page, so it
                    // gets the numeric keypad on a phone rather than a
                    // keyboard the visitor has to fight.
                    type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
                    inputMode={f.type === 'phone' ? 'tel' : undefined}
                    autoComplete={f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : undefined}
                    required={f.required}
                    placeholder={f.placeholder}
                    value={values[f.id] || ''}
                    onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base"
                  />
                )}
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition disabled:opacity-60"
              style={{ background: accent }}
            >
              {submitting
                ? 'Se trimite…'
                : page.content?.submitButtonText || form.settings?.submitButtonText || 'Trimite'}
            </button>
            {hero.trustLine && (
              <p className="text-center text-xs text-gray-500">{hero.trustLine}</p>
            )}
          </form>
        </>
      )}
    </div>
  );

  return (
    <div style={{ background: bg, color: text, fontFamily: theme.fontFamily || undefined }}>
      {/* Hero: the form sits beside the promise, not below the page. */}
      <header className="px-5 pb-12 pt-10 sm:px-8 lg:pb-20 lg:pt-16">
        <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            {hero.logo && <img src={hero.logo} alt="" className="mb-8 h-10" />}
            {hero.eyebrow && (
              <span
                className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
                style={{ background: `${accent}22`, color: accent }}
              >
                {hero.eyebrow}
              </span>
            )}
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
              {hero.title}
            </h1>
            {hero.subtitle && (
              <p className="mt-5 text-lg opacity-80 sm:text-xl">{hero.subtitle}</p>
            )}
            {hero.image && (
              <img
                src={hero.image}
                alt=""
                className="mt-8 w-full rounded-2xl object-cover"
                loading="eager"
              />
            )}
          </div>
          <div className="lg:sticky lg:top-8">{formCard}</div>
        </div>
      </header>

      {sections.map((section, i) => (
        <Section key={i} section={section} accent={accent} card={card} onCta={scrollToForm} />
      ))}

      {/* Mobile sticky CTA: most of this traffic is on a phone, and the form
          is one screen up by the time anyone has read the proof. */}
      {sticky?.enabled && !done && !formOnScreen && (
        <>
          <div className="h-24 lg:hidden" />
          <div
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 px-4 py-3 backdrop-blur lg:hidden"
            style={{ background: `${bg}f2` }}
          >
            <button
              onClick={scrollToForm}
              className="w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white"
              style={{ background: accent }}
            >
              {sticky.label || hero.ctaLabel || 'Vreau consultația gratuită'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Shell({
  title,
  children,
  tight,
}: {
  title?: string;
  children: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <section className={`px-5 sm:px-8 ${tight ? 'py-8' : 'py-12 lg:py-16'}`}>
      <div className="mx-auto max-w-5xl">
        {title && (
          <h2 className="mb-8 text-center text-2xl font-bold sm:text-3xl">{title}</h2>
        )}
        {children}
      </div>
    </section>
  );
}

function Section({
  section,
  accent,
  card,
  onCta,
}: {
  section: LandingSection;
  accent: string;
  card: string;
  onCta: () => void;
}) {
  switch (section.type) {
    case 'socialProof':
      return (
        <Shell tight>
          <div className="grid grid-cols-3 gap-4 text-center">
            {section.stats.map((s, i) => (
              <div key={i}>
                <p className="text-2xl font-extrabold sm:text-4xl" style={{ color: accent }}>
                  {s.value}
                </p>
                <p className="mt-1 text-xs opacity-70 sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </Shell>
      );

    case 'beforeAfter':
      return (
        <Shell title={section.title}>
          <div className="grid gap-6 sm:grid-cols-2">
            {section.items
              .filter((it) => it.beforeImage || it.afterImage)
              .map((it, i) => (
                <figure key={i} className="overflow-hidden rounded-2xl bg-white/5">
                  <div className="grid grid-cols-2">
                    {[it.beforeImage, it.afterImage].map((src, j) => (
                      <div key={j} className="relative">
                        {src && <img src={src} alt="" className="h-56 w-full object-cover" loading="lazy" />}
                        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                          {j === 0 ? 'Înainte' : 'După'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(it.label || it.caption) && (
                    <figcaption className="px-4 py-3 text-sm">
                      {it.label && (
                        <span className="font-semibold" style={{ color: accent }}>
                          {it.label}
                        </span>
                      )}
                      {it.label && it.caption && <span className="opacity-50"> · </span>}
                      {it.caption && <span className="opacity-70">{it.caption}</span>}
                    </figcaption>
                  )}
                </figure>
              ))}
          </div>
        </Shell>
      );

    case 'testimonials':
      return (
        <Shell title={section.title}>
          <div className="grid gap-5 sm:grid-cols-2">
            {section.items.map((t, i) => (
              <blockquote
                key={i}
                className="rounded-2xl p-6 text-gray-900 shadow-lg"
                style={{ background: card }}
              >
                {t.result && (
                  <p className="mb-2 text-sm font-bold" style={{ color: accent }}>
                    {t.result}
                  </p>
                )}
                {t.text && <p className="text-base leading-relaxed">{t.text}</p>}
                {t.name && (
                  <footer className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                    {t.photo && <img src={t.photo} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />}
                    {t.name}
                  </footer>
                )}
              </blockquote>
            ))}
          </div>
        </Shell>
      );

    case 'video':
      // The template gallery marks an unfilled video slot so its preview
      // shows where the owner's video will go.
      if (section.url?.startsWith('preview:')) {
        return (
          <Shell title={section.title}>
            <div
              className="flex aspect-video w-full items-center justify-center rounded-2xl border-2 border-dashed"
              style={{ borderColor: `${accent}66`, background: `${accent}14` }}
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white"
                style={{ background: accent }}
              >
                ▶
              </span>
            </div>
            {section.caption && (
              <p className="mt-3 text-center text-sm opacity-70">{section.caption}</p>
            )}
          </Shell>
        );
      }
      return (
        <Shell title={section.title}>
          <video
            src={section.url}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-2xl"
          />
          {section.caption && (
            <p className="mt-3 text-center text-sm opacity-70">{section.caption}</p>
          )}
        </Shell>
      );

    case 'whatYouGet':
      return (
        <Shell title={section.title}>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.items.map((it, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm text-white"
                  style={{ background: accent }}
                >
                  ✓
                </span>
                <div>
                  <p className="font-semibold">{it.title}</p>
                  {it.description && (
                    <p className="mt-0.5 text-sm opacity-70">{it.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Shell>
      );

    case 'steps':
      return (
        <Shell title={section.title}>
          <ol className="grid gap-6 sm:grid-cols-3">
            {section.items.map((it, i) => (
              <li key={i}>
                <span
                  className="mb-3 flex h-9 w-9 items-center justify-center rounded-full font-bold text-white"
                  style={{ background: accent }}
                >
                  {i + 1}
                </span>
                <p className="font-semibold">{it.title}</p>
                {it.description && <p className="mt-1 text-sm opacity-70">{it.description}</p>}
              </li>
            ))}
          </ol>
        </Shell>
      );

    case 'coach':
      return (
        <Shell>
          <div
            className="flex flex-col items-center gap-6 rounded-2xl p-6 text-gray-900 sm:flex-row sm:p-8"
            style={{ background: card }}
          >
            {section.photo && (
              <img
                src={section.photo}
                alt=""
                className="h-28 w-28 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            )}
            <div>
              {section.name && <p className="text-xl font-bold">{section.name}</p>}
              {section.credentials?.length ? (
                <p className="mt-1 text-sm font-medium" style={{ color: accent }}>
                  {section.credentials.join(' · ')}
                </p>
              ) : null}
              {section.bio && <p className="mt-3 leading-relaxed">{section.bio}</p>}
            </div>
          </div>
        </Shell>
      );

    case 'faq':
      return (
        <Shell title={section.title}>
          <div className="space-y-3">
            {section.items.map((q, i) => (
              <details
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
              >
                <summary className="cursor-pointer font-semibold">{q.question}</summary>
                <p className="mt-3 opacity-80">{q.answer}</p>
              </details>
            ))}
          </div>
        </Shell>
      );

    case 'guarantee':
      return (
        <Shell>
          <div
            className="rounded-2xl border-2 p-6 text-center sm:p-8"
            style={{ borderColor: accent }}
          >
            {section.title && (
              <p className="text-xl font-bold" style={{ color: accent }}>
                {section.title}
              </p>
            )}
            {section.text && <p className="mt-2 opacity-80">{section.text}</p>}
            <button
              onClick={onCta}
              className="mt-6 rounded-xl px-6 py-3 font-semibold text-white"
              style={{ background: accent }}
            >
              Vreau consultația gratuită
            </button>
          </div>
        </Shell>
      );

    case 'text':
      return (
        <Shell title={section.title}>
          <p className="whitespace-pre-line leading-relaxed opacity-80">{section.body}</p>
        </Shell>
      );

    default:
      return null;
  }
}
