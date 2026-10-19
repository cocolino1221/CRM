import { BadRequestException } from '@nestjs/common';

/**
 * How a workspace's public booking page looks.
 *
 * Every value ends up in a style attribute or an <img> on a page strangers
 * open, so nothing is stored as free CSS: colours must be #rrggbb, images
 * must be http(s), and a gradient is two colours rather than a CSS string.
 */
export type BookingBackground =
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'image'; url: string };

export interface BookingBranding {
  logoUrl?: string;
  accentColor?: string;
  background?: BookingBackground;
  /** Colour of the title and texts that sit directly on the background. */
  textTone?: 'dark' | 'light';
  title?: string;
  welcome?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const TITLE_MAX = 80;
const WELCOME_MAX = 300;

function hex(value: unknown, field: string): string {
  const v = String(value ?? '').trim();
  if (!HEX.test(v)) throw new BadRequestException(`${field} trebuie să fie o culoare de forma #RRGGBB.`);
  return v.toLowerCase();
}

function url(value: unknown, field: string): string {
  const v = String(value ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new BadRequestException(`${field} nu este un link valid.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(`${field} trebuie să înceapă cu http(s)://.`);
  }
  return parsed.toString();
}

function text(value: unknown, max: number, field: string): string | undefined {
  const v = String(value ?? '').trim();
  if (!v) return undefined;
  if (v.length > max) throw new BadRequestException(`${field} poate avea cel mult ${max} de caractere.`);
  return v;
}

/** The stored form of whatever the editor sent; empty fields are dropped. */
export function normalizeBookingBranding(input: any): BookingBranding {
  const out: BookingBranding = {};
  if (!input || typeof input !== 'object') return out;

  if (input.logoUrl) out.logoUrl = url(input.logoUrl, 'Logo');
  if (input.accentColor) out.accentColor = hex(input.accentColor, 'Culoarea principală');
  if (input.textTone === 'dark' || input.textTone === 'light') out.textTone = input.textTone;

  const bg = input.background;
  if (bg && typeof bg === 'object') {
    if (bg.kind === 'color') out.background = { kind: 'color', color: hex(bg.color, 'Fundalul') };
    else if (bg.kind === 'gradient') {
      out.background = { kind: 'gradient', from: hex(bg.from, 'Gradientul'), to: hex(bg.to, 'Gradientul') };
    } else if (bg.kind === 'image') out.background = { kind: 'image', url: url(bg.url, 'Imaginea de fundal') };
    else throw new BadRequestException('Tip de fundal necunoscut.');
  }

  const title = text(input.title, TITLE_MAX, 'Titlul');
  if (title) out.title = title;
  const welcome = text(input.welcome, WELCOME_MAX, 'Mesajul');
  if (welcome) out.welcome = welcome;
  return out;
}
