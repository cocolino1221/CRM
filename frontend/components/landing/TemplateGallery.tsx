'use client';

/**
 * The "choose a template" screen shown before the landing page editor.
 *
 * Each card is the real page drawn by the public renderer in a scaled
 * iframe (see app/p/template/[key]), so what you pick is what visitors get.
 * Only the centred card and its two neighbours load an iframe; the rest are
 * cheap stand-ins until they come into view.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, FilePlus2, X } from 'lucide-react';
import {
  TEMPLATE_CATEGORIES,
  templatesFor,
  type LandingTemplate,
  type TemplateCategory,
} from '@/lib/landing-templates';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 900;
const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 440;
const SCALE = PREVIEW_WIDTH / PHONE_WIDTH;
/** Card height at fit 1: preview + padding + the caption block. */
const CARD_HEIGHT = PREVIEW_HEIGHT + 190;

function categoryLabel(key: TemplateCategory): string {
  return TEMPLATE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function TemplateCard({
  template,
  offset,
  fit,
  onSelect,
}: {
  template: LandingTemplate;
  offset: number;
  /** Shrinks the whole card so it fits a short window. */
  fit: number;
  onSelect: () => void;
}) {
  const active = offset === 0;
  const near = Math.abs(offset) <= 1;

  return (
    <button
      type="button"
      onClick={onSelect}
      tabIndex={active ? 0 : -1}
      aria-label={`${template.name} — ${categoryLabel(template.category)}`}
      aria-current={active}
      className={[
        'absolute left-1/2 top-1/2 w-[300px] rounded-2xl border p-4 text-left transition-all duration-300 ease-out',
        active
          ? 'z-20 border-orange-500 bg-[#151521] shadow-[0_0_60px_-10px_rgba(249,115,22,0.55)]'
          : 'z-10 border-white/5 bg-[#12121c]',
        // Neighbours only on wider screens; a phone shows one card at a time.
        !active ? 'max-sm:pointer-events-none max-sm:invisible' : '',
        Math.abs(offset) > 2 ? 'pointer-events-none opacity-0' : '',
      ].join(' ')}
      style={{
        transform: `translate(-50%, -50%) translateX(${offset * 330 * fit}px) scale(${(active ? 1 : 0.86) * fit})`,
        opacity: Math.abs(offset) > 2 ? 0 : active ? 1 : Math.abs(offset) === 1 ? 0.35 : 0.15,
      }}
    >
      <div
        className="relative mx-auto overflow-hidden rounded-xl bg-black/40"
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
      >
        {near ? (
          <iframe
            title={`Previzualizare ${template.name}`}
            src={`/p/template/${template.key}`}
            loading="lazy"
            scrolling="no"
            tabIndex={-1}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT, transform: `scale(${SCALE})` }}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold"
            style={{ background: template.content.theme.backgroundColor, color: template.content.theme.textColor }}
          >
            {template.content.hero.title}
          </div>
        )}
      </div>
      <div className="mt-4">
        <span className="inline-block rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-medium text-orange-400">
          {categoryLabel(template.category)}
        </span>
        <p className="mt-1.5 text-[15px] font-semibold text-white">{template.name}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{template.description}</p>
      </div>
    </button>
  );
}

export default function TemplateGallery({
  onPick,
  onBlank,
  onClose,
}: {
  onPick: (template: LandingTemplate) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const [index, setIndex] = useState(0);
  const templates = useMemo(() => templatesFor(category), [category]);
  const current = templates[index];
  const touchStart = useRef<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  // Shrink the cards rather than let them run into the tabs or the button on
  // a short window (a laptop with the browser chrome, a phone in landscape).
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      setFit(Math.max(0.5, Math.min(1, (height - 24) / CARD_HEIGHT)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const go = useCallback(
    (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), templates.length - 1)),
    [templates.length],
  );

  useEffect(() => setIndex(0), [category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && current && (e.target as HTMLElement)?.tagName !== 'BUTTON') onPick(current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, onPick, current]);

  // Categories with nothing in them would only lead to an empty screen.
  const categories = TEMPLATE_CATEGORIES.filter((c) => c.key === 'all' || templatesFor(c.key).length > 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0b0b12] text-white" role="dialog" aria-modal="true" aria-label="Alege un șablon">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-5">
        <div>
          <h2 className="text-lg font-semibold sm:text-xl">Alege un șablon</h2>
          <p className="text-xs text-white/50">{templates.length} șabloane disponibile</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center rounded-xl border border-white/10 bg-white/5 p-1 sm:flex">
            <span className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium">Șablon</span>
            <button onClick={onBlank} className="rounded-lg px-3 py-1.5 text-xs text-white/60 transition hover:text-white">
              De la zero
            </button>
          </div>
          <button onClick={onClose} aria-label="Închide" className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="mt-4 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6">
        <div className="mx-auto flex w-max gap-5 border-b border-white/5">
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`whitespace-nowrap border-b-2 pb-2 text-sm transition ${
                category === c.key ? 'border-orange-500 text-white' : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={stage}
        className="relative min-h-0 flex-1"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchStart.current = null;
        }}
      >
        {templates.map((t, i) => (
          <TemplateCard
            key={t.key}
            template={t}
            offset={i - index}
            fit={fit}
            onSelect={() => (i === index ? onPick(t) : setIndex(i))}
          />
        ))}

        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Șablonul anterior"
          className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 bg-white/5 p-3 text-white transition hover:bg-white/10 disabled:opacity-20 sm:left-6"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => go(1)}
          disabled={index >= templates.length - 1}
          aria-label="Șablonul următor"
          className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 bg-white/5 p-3 text-white transition hover:bg-white/10 disabled:opacity-20 sm:right-6"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center gap-3 px-4 pb-5 pt-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {templates.map((t, i) => (
            <button
              key={t.key}
              onClick={() => setIndex(i)}
              aria-label={`Mergi la ${t.name}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-orange-500' : 'w-1.5 bg-white/25 hover:bg-white/50'}`}
            />
          ))}
        </div>
        <div className="flex w-full max-w-sm flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => current && onPick(current)}
            disabled={!current}
            className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_rgba(249,115,22,0.7)] transition hover:bg-orange-400 disabled:opacity-50 sm:w-auto"
          >
            Folosește șablonul <ArrowRight className="h-4 w-4" />
          </button>
          {current && (
            <a
              href={`/p/template/${current.key}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-white/60 transition hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Previzualizare completă
            </a>
          )}
          <button
            onClick={onBlank}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-white/60 transition hover:text-white sm:hidden"
          >
            <FilePlus2 className="h-3.5 w-3.5" /> De la zero
          </button>
        </div>
      </div>
    </div>
  );
}
