'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
  ThemePreset,
} from '@/types/landing-page';

interface FormOption {
  id: string;
  name: string;
}

interface Props {
  initial?: LandingPage;
}

type Draft = Partial<LandingPage>;

export default function LandingPageEditor({ initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    initial || {
      name: '',
      status: LandingPageStatus.DRAFT,
      captureType: LandingPageCaptureType.NATIVE,
      content: { hero: { title: '', subtitle: '', accentColor: '#2563eb' }, benefits: [] },
      postSubmit: { successMessage: 'Thank you!', whatsapp: { enabled: false, message: '' } },
      seo: {},
    },
  );
  const [forms, setForms] = useState<FormOption[]>([]);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<FormOption[]>('/forms').then((r) => setForms(r.data)).catch(() => {});
    api.get<ThemePreset[]>('/landing-pages/theme-presets').then((r) => setPresets(r.data)).catch(() => {});
  }, []);

  const hero = draft.content?.hero || {};
  const benefits = draft.content?.benefits || [];
  const theme = draft.content?.theme || {};

  const setHero = (patch: Partial<typeof hero>) =>
    setDraft((d) => ({ ...d, content: { ...d.content, hero: { ...d.content?.hero, ...patch } } }));
  const setBenefits = (next: string[]) =>
    setDraft((d) => ({ ...d, content: { ...d.content, benefits: next } }));
  const applyPreset = (key: string) => {
    const preset = presets.find((p) => p.key === key);
    setDraft((d) => ({
      ...d,
      content: { ...d.content, themePreset: key, theme: { ...(preset?.theme || {}) } },
    }));
  };

  const isTypeform = draft.captureType === LandingPageCaptureType.TYPEFORM;

  const canSaveActive = useMemo(() => {
    if (draft.status !== LandingPageStatus.ACTIVE) return true;
    if (isTypeform) return Boolean(draft.typeformConfig?.formId);
    return Boolean(draft.formId);
  }, [draft, isTypeform]);

  const save = async () => {
    setError(null);
    if (!draft.name?.trim()) {
      setError('Name is required.');
      return;
    }
    if (!canSaveActive) {
      setError(
        isTypeform
          ? 'Set a Typeform form ID before publishing.'
          : 'Select a form before publishing.',
      );
      return;
    }
    setSaving(true);
    try {
      if (initial?.id) {
        await api.patch(`/landing-pages/${initial.id}`, draft);
      } else {
        await api.post('/landing-pages', draft);
      }
      router.push('/landing-pages');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <input
          value={draft.name || ''}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Landing page name"
          className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-lg font-semibold"
        />
        <div className="flex items-center gap-3">
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as LandingPageStatus })}
            className="rounded-lg border border-gray-200 px-3 py-2"
          >
            <option value={LandingPageStatus.DRAFT}>Draft</option>
            <option value={LandingPageStatus.ACTIVE}>Active</option>
            <option value={LandingPageStatus.ARCHIVED}>Archived</option>
          </select>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
        {/* EDITOR */}
        <div className="space-y-6 overflow-y-auto p-6">
          {/* Hero */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Hero</h3>
            <input
              value={hero.title || ''}
              onChange={(e) => setHero({ title: e.target.value })}
              placeholder="Headline"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <textarea
              value={hero.subtitle || ''}
              onChange={(e) => setHero({ subtitle: e.target.value })}
              placeholder="Subtitle"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={hero.image || ''}
              onChange={(e) => setHero({ image: e.target.value })}
              placeholder="Hero image URL"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Accent</label>
              <input
                type="color"
                value={hero.accentColor || '#2563eb'}
                onChange={(e) => setHero({ accentColor: e.target.value })}
              />
            </div>
          </section>

          {/* Theme preset */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Theme preset</h3>
            <select
              value={draft.content?.themePreset || ''}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="">Custom</option>
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </section>

          {/* Benefits */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Benefits</h3>
            {benefits.map((b, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  value={b}
                  onChange={(e) => {
                    const next = [...benefits];
                    next[i] = e.target.value;
                    setBenefits(next);
                  }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
                />
                <button onClick={() => setBenefits(benefits.filter((_, j) => j !== i))} className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={() => setBenefits([...benefits, ''])} className="inline-flex items-center gap-1 text-sm text-blue-600">
              <Plus size={14} /> Add benefit
            </button>
          </section>

          {/* Capture */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Capture block</h3>
            <div className="mb-3 flex gap-2">
              {[LandingPageCaptureType.NATIVE, LandingPageCaptureType.TYPEFORM].map((t) => (
                <button
                  key={t}
                  onClick={() => setDraft({ ...draft, captureType: t })}
                  className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                    draft.captureType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {isTypeform ? (
              <input
                value={draft.typeformConfig?.formId || ''}
                onChange={(e) =>
                  setDraft({ ...draft, typeformConfig: { formId: e.target.value, embedType: 'inline' } })
                }
                placeholder="Typeform form ID"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            ) : (
              <select
                value={draft.formId || ''}
                onChange={(e) => setDraft({ ...draft, formId: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="">Select a form…</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </section>

          {/* Post-submit (native only) */}
          {!isTypeform && (
            <section>
              <h3 className="mb-3 font-semibold text-gray-900">After submit</h3>
              <input
                value={draft.postSubmit?.successMessage || ''}
                onChange={(e) =>
                  setDraft({ ...draft, postSubmit: { ...draft.postSubmit, successMessage: e.target.value } })
                }
                placeholder="Success message"
                className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
              <input
                value={draft.postSubmit?.redirectUrl || ''}
                onChange={(e) =>
                  setDraft({ ...draft, postSubmit: { ...draft.postSubmit, redirectUrl: e.target.value } })
                }
                placeholder="Redirect URL (optional)"
                className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
              <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(draft.postSubmit?.whatsapp?.enabled)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      postSubmit: {
                        ...draft.postSubmit,
                        whatsapp: { ...draft.postSubmit?.whatsapp, enabled: e.target.checked },
                      },
                    })
                  }
                />
                Send WhatsApp welcome
              </label>
              {draft.postSubmit?.whatsapp?.enabled && (
                <textarea
                  value={draft.postSubmit?.whatsapp?.message || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      postSubmit: {
                        ...draft.postSubmit,
                        whatsapp: { ...draft.postSubmit?.whatsapp, message: e.target.value },
                      },
                    })
                  }
                  placeholder="Welcome message (use {{name}})"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              )}
            </section>
          )}

          {/* SEO + slug */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">SEO &amp; URL</h3>
            <input
              value={draft.slug || ''}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder="Slug (auto-generated if blank)"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={draft.seo?.title || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, title: e.target.value } })}
              placeholder="SEO title"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <textarea
              value={draft.seo?.description || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, description: e.target.value } })}
              placeholder="SEO description"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={draft.seo?.ogImage || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, ogImage: e.target.value } })}
              placeholder="OG image URL"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </section>
        </div>

        {/* PREVIEW */}
        <div
          className="overflow-y-auto p-10"
          style={{ background: theme.backgroundColor || '#f8fafc', color: theme.textColor || '#0f172a' }}
        >
          {hero.image && <img src={hero.image} alt="" className="mb-6 w-full rounded-xl object-cover" />}
          <h1 className="mb-3 text-3xl font-bold" style={{ color: hero.accentColor || theme.accentColor }}>
            {hero.title || 'Your headline here'}
          </h1>
          <p className="mb-6 text-lg opacity-80">{hero.subtitle || 'Your subtitle here'}</p>
          {benefits.length > 0 && (
            <ul className="mb-6 space-y-2">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span style={{ color: hero.accentColor || theme.accentColor }}>✓</span> {b}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900">
            {isTypeform ? (
              <p className="text-sm text-gray-500">
                Typeform embed ({draft.typeformConfig?.formId || 'no form ID'})
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Native form ({forms.find((f) => f.id === draft.formId)?.name || 'no form selected'})
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
