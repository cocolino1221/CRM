/**
 * Digits for a wa.me link.
 *
 * Ported from frontend/lib/queue-rows.ts with its spec. The screens here used
 * to strip non-digits and send that, which turns a Romanian "07…" number into
 * one WhatsApp does not know, and opens an empty chat.
 */

/**
 * Digits for a wa.me link, mirroring the backend's normalizePhoneE164
 * (common/utils/phone.util.ts) so a contact reached from the queue and the
 * same contact reached from the backend land on the same WhatsApp thread.
 * Romanian local numbers ("07...") are the common case here.
 */
export function whatsappDigits(
  value?: string | null,
  defaultCountryCode = '40',
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let normalized: string;
  if (trimmed.startsWith('+')) normalized = digits;
  else if (digits.startsWith('00') && digits.length > 2) normalized = digits.slice(2);
  else if (digits.startsWith(defaultCountryCode)) normalized = digits;
  else if (digits.startsWith('0')) normalized = `${defaultCountryCode}${digits.slice(1)}`;
  else normalized = digits;

  // "0", "(0)" and "0 7 2 1" used to come out as "40", "40" and "40721" —
  // plausible-looking links that open an empty chat. This workspace is full
  // of junk numbers, so the short ones are refused rather than dressed up.
  if (normalized.length < 8 || normalized.length > 15) return null;
  return normalized;
}

/** The sources the calling queues work. '' means all of them. */
export const QUEUE_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Toate sursele' },
  { value: 'typeform', label: 'Typeform' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'manual', label: 'Manual' },
];

const SOURCE_LABELS: Record<string, string> = {
  typeform: 'Typeform',
  woocommerce: 'WooCommerce',
  manual: 'Manual',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

export function queueSourceLabel(source?: string | null): string | null {
  if (!source) return null;
  return SOURCE_LABELS[source] ?? source;
}
