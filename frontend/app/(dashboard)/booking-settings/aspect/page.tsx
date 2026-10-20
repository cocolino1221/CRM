'use client';

/**
 * How the public booking page looks: logo, background, accent colour and the
 * two texts above the hours. One look per workspace, because the page shows
 * the whole team's hours whichever closer's link the lead arrived on.
 *
 * The preview on the right uses the same helpers as the real page
 * (lib/booking-branding), so what is shown here is what a lead gets.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, ExternalLink, Loader2, Palette, Save } from 'lucide-react';
import api from '@/lib/api';
import ImageUploadField from '@/components/landing/ImageUploadField';
import {
  BOOKING_PRESETS,
  DEFAULT_ACCENT,
  accentOf,
  backgroundStyle,
  isHex,
  toneOf,
  type BookingBackground,
  type BookingBranding,
} from '@/lib/booking-branding';

type BackgroundKind = BookingBackground['kind'];

const KIND_LABELS: Record<BackgroundKind, string> = {
  color: 'Culoare',
  gradient: 'Gradient',
  image: 'Imagine',
};

/** A colour swatch plus the hex beside it, so a brand colour can be pasted. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700"
        />
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          maxLength={7}
          className="w-28 rounded-lg border border-gray-300 px-2 py-2 font-mono text-sm uppercase dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
    </label>
  );
}

export default function BookingAppearancePage() {
  const [branding, setBranding] = useState<BookingBranding>({});
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [savedJson, setSavedJson] = useState('{}');

  useEffect(() => {
    (async () => {
      try {
        const [brandRes, typesRes] = await Promise.all([
          api.get<BookingBranding>('/scheduling/booking-page'),
          api.get('/scheduling/meeting-types').catch(() => ({ data: [] })),
        ]);
        const loaded = brandRes.data ?? {};
        setBranding(loaded);
        setSavedJson(JSON.stringify(loaded));
        const first = Array.isArray(typesRes.data) ? typesRes.data[0] : null;
        if (first?.slug) setSlug(first.slug);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Nu s-au putut încărca setările paginii.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = (change: Partial<BookingBranding>) => {
    setBranding((prev) => ({ ...prev, ...change }));
    setSaved(false);
  };

  const background = branding.background ?? { kind: 'color', color: '#f9fafb' };
  const setKind = (kind: BackgroundKind) => {
    // Switching kind keeps something sensible to look at rather than a blank.
    if (kind === background.kind) return;
    if (kind === 'color') patch({ background: { kind, color: '#f9fafb' } });
    if (kind === 'gradient') patch({ background: { kind, from: '#eef2ff', to: '#fdf2f8' } });
    if (kind === 'image') patch({ background: { kind, url: '' } });
  };

  const imageMissing = background.kind === 'image' && !background.url;
  const dirty = JSON.stringify(branding) !== savedJson;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      // An image background with no image yet is not saved as broken: it
      // simply keeps the default until a picture is chosen.
      const payload = imageMissing ? { ...branding, background: undefined } : branding;
      const res = await api.put<BookingBranding>('/scheduling/booking-page', payload);
      setBranding(res.data ?? {});
      setSavedJson(JSON.stringify(res.data ?? {}));
      setSaved(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      setError(
        status === 403
          ? 'Doar un admin sau manager poate schimba aspectul paginii.'
          : Array.isArray(message)
            ? message.join(' ')
            : message || 'Salvarea a eșuat.',
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------- preview ----------
  const previewBranding = imageMissing ? { ...branding, background: undefined } : branding;
  const tone = toneOf(previewBranding);
  const frame = useMemo(
    () => ({ ...backgroundStyle(previewBranding), ['--accent' as string]: accentOf(previewBranding) }) as CSSProperties,
    [previewBranding],
  );
  const onBg = tone === 'light' ? 'text-white' : 'text-gray-900';
  const onBgSoft = tone === 'light' ? 'text-white/80' : 'text-gray-600';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/booking-page" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Pagina de programare
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <Palette className="h-6 w-6 text-indigo-600" /> Aspectul paginii de programare
          </h1>
          <p className="mt-1 text-sm text-gray-500">Logo, fundal și culori — se aplică pentru toată echipa.</p>
        </div>
        {slug && (
          <a
            href={`/book/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <ExternalLink className="h-4 w-4" /> Vezi pagina live
          </a>
        )}
      </header>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Teme</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {BOOKING_PRESETS.map((preset) => {
                const active =
                  JSON.stringify(branding.background ?? null) === JSON.stringify(preset.background) &&
                  accentOf(branding) === preset.accentColor;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      patch({ background: preset.background, accentColor: preset.accentColor, textTone: preset.textTone })
                    }
                    className={`overflow-hidden rounded-xl border text-left text-xs ${
                      active ? 'border-indigo-600 ring-2 ring-indigo-600/30' : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex h-12 items-end p-2" style={backgroundStyle({ background: preset.background })}>
                      <span className="h-3 w-8 rounded-full" style={{ backgroundColor: preset.accentColor }} />
                    </div>
                    <div className="px-2 py-1.5 text-gray-700 dark:text-gray-200">{preset.label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Logo și texte</h2>
            <ImageUploadField
              label="Logo (PNG sau SVG, fundal transparent arată cel mai bine)"
              value={branding.logoUrl ?? ''}
              onChange={(url) => patch({ logoUrl: url || undefined })}
              subfolder="booking-page"
            />
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Titlu <span className="font-normal text-gray-400">(gol = numele întâlnirii)</span>
              <input
                value={branding.title ?? ''}
                maxLength={80}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="Consultație gratuită"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Mesaj sub titlu
              <textarea
                value={branding.welcome ?? ''}
                maxLength={300}
                rows={3}
                onChange={(e) => patch({ welcome: e.target.value })}
                placeholder="Alege ora care ți se potrivește și te sunăm noi la fix."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Culori și fundal</h2>
            <ColorField
              label="Culoarea butoanelor și a orei alese"
              value={accentOf(branding)}
              onChange={(v) => patch({ accentColor: v })}
            />

            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Fundal</span>
              <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                {(Object.keys(KIND_LABELS) as BackgroundKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setKind(kind)}
                    className={`px-3 py-1.5 text-xs font-medium ${
                      background.kind === kind
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>

            {background.kind === 'color' && (
              <ColorField
                label="Culoarea fundalului"
                value={background.color}
                onChange={(color) => patch({ background: { kind: 'color', color } })}
              />
            )}
            {background.kind === 'gradient' && (
              <div className="flex flex-wrap gap-4">
                <ColorField
                  label="De la"
                  value={background.from}
                  onChange={(from) => patch({ background: { ...background, from } })}
                />
                <ColorField
                  label="Până la"
                  value={background.to}
                  onChange={(to) => patch({ background: { ...background, to } })}
                />
              </div>
            )}
            {background.kind === 'image' && (
              <ImageUploadField
                label="Imagine de fundal (o poză lată, minim 1600px)"
                value={background.url}
                onChange={(url) => patch({ background: { kind: 'image', url } })}
                subfolder="booking-page"
              />
            )}

            <div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Textul de pe fundal</span>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {(
                  [
                    [undefined, 'Automat'],
                    ['dark', 'Închis'],
                    ['light', 'Deschis'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => patch({ textTone: value })}
                    className={`rounded-lg border px-3 py-1.5 ${
                      branding.textTone === value
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Se salvează…' : 'Salvează'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBranding({});
                setSaved(false);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Revino la aspectul de bază
            </button>
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <Check className="h-4 w-4" /> Salvat
              </span>
            )}
            {dirty && !saving && <span className="text-xs text-amber-600">Modificări nesalvate</span>}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Previzualizare</p>
          <div
            style={frame}
            className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm dark:border-gray-700"
            aria-label="Previzualizare pagină de programare"
          >
            <div className="px-5 py-8">
              <div className="text-center">
                {branding.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt="" className="mx-auto mb-3 max-h-12 max-w-[10rem] object-contain" />
                )}
                <p className={`text-xl font-bold ${onBg}`}>{branding.title?.trim() || 'Consultație'}</p>
                {branding.welcome?.trim() && (
                  <p className={`mt-1.5 whitespace-pre-line text-sm ${onBgSoft}`}>{branding.welcome}</p>
                )}
                <p className={`mt-1.5 text-xs ${onBgSoft}`}>30 minute</p>
              </div>

              <p className={`mt-6 text-xs font-semibold ${onBgSoft}`}>Alege ziua</p>
              <div className="mt-2 flex gap-1.5 overflow-hidden">
                {['lun., 19 oct.', 'mar., 20 oct.', 'mie., 21 oct.'].map((d, i) => (
                  <span
                    key={d}
                    className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs ${
                      i === 0 ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {d}
                  </span>
                ))}
              </div>

              <p className={`mt-4 text-xs font-semibold ${onBgSoft}`}>Alege ora</p>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {['09:00', '09:30', '11:30', '12:00'].map((h, i) => (
                  <span
                    key={h}
                    className={`rounded-lg border px-2 py-1.5 text-center text-xs tabular-nums ${
                      i === 1 ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    {h}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-700">
                  Programare pentru <strong>Ana Popescu</strong>
                </p>
                <span className="mt-2 block rounded-lg bg-[var(--accent)] py-2 text-center text-xs font-medium text-white">
                  Confirmă 09:30
                </span>
              </div>
            </div>
          </div>
          {!isHex(branding.accentColor) && branding.accentColor && (
            <p className="mt-2 text-xs text-gray-500">Culoarea principală revine la {DEFAULT_ACCENT}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
