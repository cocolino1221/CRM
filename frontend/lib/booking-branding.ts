/**
 * The look of the public booking page: a logo, a background, one accent colour
 * and two texts. Mirrors backend/src/scheduling/booking-branding.ts, which
 * validates everything before it is stored.
 */

import type { CSSProperties } from 'react';

export type BookingBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'image'; url: string };

export interface BookingBranding {
  logoUrl?: string;
  accentColor?: string;
  background?: BookingBackground;
  textTone?: 'dark' | 'light';
  title?: string;
  welcome?: string;
}

/** What the page looked like before it could be changed. */
export const DEFAULT_ACCENT = '#4f46e5';
export const DEFAULT_BACKGROUND: BookingBackground = { kind: 'color', color: '#f9fafb' };

export interface BookingPreset {
  id: string;
  label: string;
  accentColor: string;
  background: BookingBackground;
  textTone: 'dark' | 'light';
}

/** Starting points; every value stays editable after picking one. */
export const BOOKING_PRESETS: BookingPreset[] = [
  { id: 'clasic', label: 'Clasic', accentColor: DEFAULT_ACCENT, background: DEFAULT_BACKGROUND, textTone: 'dark' },
  {
    id: 'lavanda',
    label: 'Lavandă',
    accentColor: '#7c3aed',
    background: { kind: 'gradient', from: '#eef2ff', to: '#fdf2f8' },
    textTone: 'dark',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    accentColor: '#0284c7',
    background: { kind: 'gradient', from: '#0ea5e9', to: '#1e3a8a' },
    textTone: 'light',
  },
  {
    id: 'natura',
    label: 'Natură',
    accentColor: '#16a34a',
    background: { kind: 'gradient', from: '#f0fdf4', to: '#dcfce7' },
    textTone: 'dark',
  },
  {
    id: 'cald',
    label: 'Cald',
    accentColor: '#ea580c',
    background: { kind: 'gradient', from: '#fff7ed', to: '#fef3c7' },
    textTone: 'dark',
  },
  {
    id: 'noapte',
    label: 'Noapte',
    accentColor: '#f59e0b',
    background: { kind: 'gradient', from: '#111827', to: '#312e81' },
    textTone: 'light',
  },
];

export const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: string | undefined): value is string {
  return !!value && HEX.test(value);
}

export function accentOf(branding: BookingBranding | undefined): string {
  return isHex(branding?.accentColor) ? branding!.accentColor! : DEFAULT_ACCENT;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Which text colour reads on a background. An explicit choice wins; a plain
 * colour or gradient decides by its brightness; a photo cannot be measured,
 * so it defaults to light text on the darkening overlay.
 */
export function toneOf(branding: BookingBranding | undefined): 'dark' | 'light' {
  if (branding?.textTone) return branding.textTone;
  const bg = branding?.background;
  if (!bg) return 'dark';
  if (bg.kind === 'image') return 'light';
  const colors = bg.kind === 'color' ? [bg.color] : [bg.from, bg.to];
  const avg = colors.filter(isHex).reduce((sum, c) => sum + luminance(c), 0) / colors.length;
  return avg > 0.35 ? 'dark' : 'light';
}

/**
 * The page background as style. A photo gets an overlay in the text's
 * opposite colour, or a busy picture would swallow the title.
 */
export function backgroundStyle(branding: BookingBranding | undefined): CSSProperties {
  const bg = branding?.background ?? DEFAULT_BACKGROUND;
  if (bg.kind === 'color') return { backgroundColor: isHex(bg.color) ? bg.color : '#f9fafb' };
  if (bg.kind === 'gradient') {
    return { backgroundImage: `linear-gradient(135deg, ${bg.from}, ${bg.to})` };
  }
  const veil = toneOf(branding) === 'light' ? 'rgba(17,24,39,0.55)' : 'rgba(255,255,255,0.65)';
  return {
    // JSON.stringify quotes the URL, so a stored ')' cannot end url() early.
    backgroundImage: `linear-gradient(${veil}, ${veil}), url(${JSON.stringify(bg.url)})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  };
}
