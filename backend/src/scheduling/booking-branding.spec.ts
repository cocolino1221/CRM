import { BadRequestException } from '@nestjs/common';
import { normalizeBookingBranding } from './booking-branding';

/**
 * Whatever is stored here lands in a style attribute on a page strangers open,
 * so anything that is not a plain colour, an http(s) link or bounded text is
 * refused rather than cleaned up.
 */
describe('normalizeBookingBranding', () => {
  it('keeps a full, valid look', () => {
    expect(
      normalizeBookingBranding({
        logoUrl: 'https://cdn.example.com/logo.png',
        accentColor: '#4F46E5',
        background: { kind: 'gradient', from: '#EEF2FF', to: '#FDF2F8' },
        textTone: 'dark',
        title: '  Consultație gratuită ',
        welcome: 'Alege ora care ți se potrivește.',
      }),
    ).toEqual({
      logoUrl: 'https://cdn.example.com/logo.png',
      accentColor: '#4f46e5',
      background: { kind: 'gradient', from: '#eef2ff', to: '#fdf2f8' },
      textTone: 'dark',
      title: 'Consultație gratuită',
      welcome: 'Alege ora care ți se potrivește.',
    });
  });

  it('drops empty fields so the defaults show through', () => {
    expect(normalizeBookingBranding({ logoUrl: '', title: '   ', accentColor: '' })).toEqual({});
    expect(normalizeBookingBranding(null)).toEqual({});
  });

  it.each([
    ['a colour that is really CSS', { accentColor: 'red; background:url(x)' }],
    ['a short hex', { accentColor: '#fff' }],
    ['a javascript: logo', { logoUrl: 'javascript:alert(1)' }],
    ['a data: background', { background: { kind: 'image', url: 'data:text/html,hi' } }],
    ['a raw CSS gradient', { background: { kind: 'gradient', from: 'linear-gradient(red,blue)', to: '#000000' } }],
    ['an unknown background kind', { background: { kind: 'video', url: 'https://x.ro/a.mp4' } }],
    ['a title that is too long', { title: 'x'.repeat(81) }],
  ])('refuses %s', (_label, input) => {
    expect(() => normalizeBookingBranding(input)).toThrow(BadRequestException);
  });

  it('ignores a text tone it does not know', () => {
    expect(normalizeBookingBranding({ textTone: 'neon' })).toEqual({});
  });
});
