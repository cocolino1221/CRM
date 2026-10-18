import { describe, expect, it } from 'vitest';
import { parseMoney } from './money';

/**
 * The review found "1.500" being read as 1.5: the old parser replaced the
 * first comma with a dot and handed the rest to Number(). A caller closing a
 * sale of 1.500 lei recorded one leu fifty, and the guard `value > 0` let it
 * through — the error copy promised protection against zero, not against
 * three orders of magnitude.
 */
describe('parseMoney', () => {
  it('reads a plain number', () => {
    expect(parseMoney('1500')).toBe(1500);
    expect(parseMoney('1500.50')).toBe(1500.5);
  });

  it('reads the Romanian decimal comma', () => {
    expect(parseMoney('1250,50')).toBe(1250.5);
    expect(parseMoney('0,99')).toBe(0.99);
  });

  // The defect.
  it('reads a dot used as a thousands separator', () => {
    expect(parseMoney('1.500')).toBe(1500);
    expect(parseMoney('12.000')).toBe(12000);
    expect(parseMoney('1.500.000')).toBe(1500000);
  });

  it('reads both separators together, Romanian style', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('12.000,00')).toBe(12000);
  });

  it('reads the English style too, since a keyboard offers both', () => {
    expect(parseMoney('1,234.56')).toBe(1234.56);
  });

  it('ignores spaces people type between groups', () => {
    expect(parseMoney('1 500')).toBe(1500);
    expect(parseMoney(' 1500 ')).toBe(1500);
  });

  it('refuses anything that is not a positive amount', () => {
    for (const bad of ['', '   ', '0', '-50', 'abc', undefined, null]) {
      expect(parseMoney(bad as any)).toBeNull();
    }
  });

  // Number() accepts these and they are never what a caller meant to type.
  it('refuses notations a sales screen should not accept', () => {
    expect(parseMoney('2e3')).toBeNull();
    expect(parseMoney('0x64')).toBeNull();
    expect(parseMoney('Infinity')).toBeNull();
  });

  it('refuses an amount with more than two decimals, which is a typo', () => {
    expect(parseMoney('1,5555')).toBeNull();
  });
});
