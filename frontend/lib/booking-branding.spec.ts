import { describe, expect, it } from 'vitest';
import {
  BOOKING_PRESETS,
  DEFAULT_ACCENT,
  accentOf,
  backgroundStyle,
  toneOf,
} from './booking-branding';

describe('accentOf', () => {
  it('uses the stored colour', () => {
    expect(accentOf({ accentColor: '#16a34a' })).toBe('#16a34a');
  });

  it('falls back to the original indigo for nothing or nonsense', () => {
    expect(accentOf(undefined)).toBe(DEFAULT_ACCENT);
    expect(accentOf({ accentColor: 'red' })).toBe(DEFAULT_ACCENT);
  });
});

describe('toneOf', () => {
  it('lets an explicit choice win', () => {
    expect(toneOf({ textTone: 'light', background: { kind: 'color', color: '#ffffff' } })).toBe('light');
  });

  it('reads a light background as needing dark text, and the reverse', () => {
    expect(toneOf({ background: { kind: 'color', color: '#fafafa' } })).toBe('dark');
    expect(toneOf({ background: { kind: 'gradient', from: '#111827', to: '#312e81' } })).toBe('light');
  });

  it('puts light text over a photo', () => {
    expect(toneOf({ background: { kind: 'image', url: 'https://x.ro/a.jpg' } })).toBe('light');
  });

  // A preset must never pair a background with text that cannot be read on it.
  it.each(BOOKING_PRESETS)('$label pairs its background with readable text', (preset) => {
    expect(toneOf({ background: preset.background })).toBe(preset.textTone);
  });
});

describe('backgroundStyle', () => {
  it('paints a plain colour', () => {
    expect(backgroundStyle({ background: { kind: 'color', color: '#fef3c7' } })).toEqual({ backgroundColor: '#fef3c7' });
  });

  it('builds a gradient from two colours', () => {
    expect(backgroundStyle({ background: { kind: 'gradient', from: '#000000', to: '#ffffff' } }).backgroundImage).toBe(
      'linear-gradient(135deg, #000000, #ffffff)',
    );
  });

  it('quotes an image URL and veils it for the text', () => {
    const style = backgroundStyle({ background: { kind: 'image', url: 'https://x.ro/a b).jpg' } });
    expect(style.backgroundImage).toContain('url("https://x.ro/a b).jpg")');
    expect(style.backgroundImage).toContain('rgba(17,24,39,0.55)');
  });

  it('keeps the old grey page when nothing is set', () => {
    expect(backgroundStyle(undefined)).toEqual({ backgroundColor: '#f9fafb' });
  });
});
