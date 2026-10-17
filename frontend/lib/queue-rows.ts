/**
 * Shaping for the two call queues.
 *
 * Both helpers exist because their failure modes are invisible until a caller
 * is looking at a wrong row: a lead with no name rendering as "undefined
 * undefined", and a booking rendering in the browser's timezone instead of
 * the workspace's.
 */

export interface NameParts {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** Most Meta leads arrive with no name, so every fallback here is load-bearing. */
/** The slice of a contact a queue row carries: enough to open the detail popup. */
export interface QueueContactRef extends NameParts {
  id: string;
}

export function contactDisplayName(contact: NameParts | null | undefined): string {
  if (!contact) return 'Contact';
  const full = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  if (full) return full;
  if (contact.phone?.trim()) return contact.phone.trim();
  if (contact.email?.trim()) return contact.email.trim();
  return 'Contact';
}

/**
 * The workspace's clock, not the viewer's — a caller in another timezone must
 * still see the hour the contact agreed to.
 */
export function formatQueueTime(
  value: string | Date | null | undefined,
  timeZone: string,
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('ro-RO', {
      timeZone,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    // An unknown timezone must not blank the row; fall back to the viewer's.
    return new Intl.DateTimeFormat('ro-RO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
}

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

  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00') && digits.length > 2) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
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
