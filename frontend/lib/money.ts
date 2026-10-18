/**
 * Reading an amount a caller typed on a phone.
 *
 * The parser this replaces did `raw.replace(',', '.')` and handed the result
 * to Number(), so "1.500" — a perfectly ordinary way to write one and a half
 * thousand lei — became 1.5. The sale was recorded as one leu fifty and
 * nothing complained, because the only guard was `value > 0`.
 *
 * Both separators are in use on the same keypad, so which one is the decimal
 * is decided by position rather than assumed.
 */

const MAX_DECIMALS = 2;

export function parseMoney(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;

  // Spaces are a thousands separator people actually type.
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return null;

  // Only digits and the two separators. This is what keeps "2e3", "0x64" and
  // "Infinity" out — Number() happily accepts all three.
  if (!/^[0-9.,]+$/.test(trimmed)) return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');

  let decimalSeparator: string | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever comes last is the decimal one: "1.234,56" and "1,234.56".
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    // A lone comma is decimal unless it groups three digits at the end.
    decimalSeparator = trimmed.length - lastComma - 1 === 3 ? null : ',';
  } else if (lastDot >= 0) {
    decimalSeparator = trimmed.length - lastDot - 1 === 3 ? null : '.';
  }

  let whole = trimmed;
  let fraction = '';
  if (decimalSeparator) {
    const at = trimmed.lastIndexOf(decimalSeparator);
    whole = trimmed.slice(0, at);
    fraction = trimmed.slice(at + 1);
    // More than two decimals is a typo, not an amount.
    if (fraction.length > MAX_DECIMALS || !/^[0-9]*$/.test(fraction)) return null;
  }

  // Everything left in the whole part is grouping.
  const digits = whole.replace(/[.,]/g, '');
  if (!/^[0-9]+$/.test(digits)) return null;

  const value = Number(`${digits}.${fraction || '0'}`);
  return Number.isFinite(value) && value > 0 ? value : null;
}
