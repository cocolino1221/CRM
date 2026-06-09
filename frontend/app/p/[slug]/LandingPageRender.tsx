'use client';

import { useEffect, useMemo, useState } from 'react';

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

export default function LandingPageRender({ slug, initialPage, initialForm }: Props) {
  const page = initialPage;
  const form = initialForm;
  const hero = page.content?.hero || {};
  const benefits: string[] = page.content?.benefits || [];
  const theme = page.content?.theme || {};
  const isTypeform = page.captureType === 'typeform';

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utms = useMemo(() => readUtms(), []);

  // Fire a tracked view (raw + unique cookie dedup) once on mount.
  useEffect(() => {
    fetch(`${API_BASE}/landing-pages/public/${slug}`, { credentials: 'include' }).catch(() => {});
  }, [slug]);

  const typeformSrc = useMemo(() => {
    if (!isTypeform || !page.typeformConfig?.formId) return '';
    const qs = new URLSearchParams(utms).toString();
    return `https://form.typeform.com/to/${page.typeformConfig.formId}${qs ? `#${qs}` : ''}`;
  }, [isTypeform, page.typeformConfig, utms]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/landing-pages/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values, trackingData: utms }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Submission failed');
      }
      const body = await res.json();
      if (body.redirectUrl) {
        window.location.href = body.redirectUrl;
        return;
      }
      setDone({ message: body.successMessage || 'Thank you!' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accent = hero.accentColor || theme.accentColor || '#2563eb';

  return (
    <div
      className="min-h-screen px-6 py-12"
      style={{ background: theme.backgroundColor || '#f8fafc', color: theme.textColor || '#0f172a' }}
    >
      <div className="mx-auto max-w-2xl">
        {hero.logo && <img src={hero.logo} alt="" className="mb-8 h-10" />}
        {hero.image && <img src={hero.image} alt="" className="mb-8 w-full rounded-2xl object-cover" />}
        <h1 className="mb-4 text-4xl font-bold" style={{ color: accent }}>
          {hero.title}
        </h1>
        {hero.subtitle && <p className="mb-8 text-xl opacity-80">{hero.subtitle}</p>}

        {benefits.length > 0 && (
          <ul className="mb-10 space-y-3">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-lg">
                <span style={{ color: accent }}>✓</span> {b}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-sm">
          {isTypeform ? (
            page.typeformConfig?.formId ? (
              <iframe
                title="Typeform"
                src={typeformSrc}
                className="h-[500px] w-full rounded-xl border-0"
              />
            ) : (
              <p className="text-gray-500">Form unavailable.</p>
            )
          ) : !form ? (
            <p className="text-gray-500">Form unavailable.</p>
          ) : done ? (
            <p className="text-center text-lg font-medium" style={{ color: accent }}>
              {done.message}
            </p>
          ) : (
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
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    />
                  ) : f.type === 'select' ? (
                    <select
                      required={f.required}
                      value={values[f.id] || ''}
                      onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
                      required={f.required}
                      placeholder={f.placeholder}
                      value={values[f.id] || ''}
                      onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    />
                  )}
                </div>
              ))}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg px-4 py-3 font-medium text-white disabled:opacity-60"
                style={{ background: accent }}
              >
                {submitting ? 'Submitting…' : form.settings?.submitButtonText || 'Submit'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
