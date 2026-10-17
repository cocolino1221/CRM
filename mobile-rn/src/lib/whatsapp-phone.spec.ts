import { describe, expect, it } from 'vitest';
import { whatsappDigits } from './whatsapp-phone';

describe('whatsappDigits', () => {
  // The list is mostly Romanian handsets typed in local form.
  it('gives a local 07 number its country code', () => {
    expect(whatsappDigits('0722000111')).toBe('40722000111');
    expect(whatsappDigits('0722 000 111')).toBe('40722000111');
  });

  it('keeps a number that already carries its country code', () => {
    expect(whatsappDigits('+40722000111')).toBe('40722000111');
    expect(whatsappDigits('40722000111')).toBe('40722000111');
  });

  it('turns a 00 prefix into the country code', () => {
    expect(whatsappDigits('0040722000111')).toBe('40722000111');
  });

  // A foreign number must not be given +40 on its way to WhatsApp.
  it('leaves an international number alone', () => {
    expect(whatsappDigits('+34612345678')).toBe('34612345678');
  });

  it('returns null when there is nothing to dial', () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits('')).toBeNull();
    expect(whatsappDigits('   ')).toBeNull();
    expect(whatsappDigits('n/a')).toBeNull();
  });
});
