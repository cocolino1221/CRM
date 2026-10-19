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

/**
 * Add the next page to what is already on screen. The queue shifts while a
 * caller works it (someone booked drops out), so an offset page can repeat a
 * row that was already shown — keep the first copy.
 */
export function appendUnique<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...next.filter((r) => !seen.has(r.id))];
}

/** Whether another page is worth asking for. */
export function hasMorePages(loaded: number, total: number, lastPageSize: number, pageSize: number): boolean {
  return loaded < total && lastPageSize >= pageSize;
}
