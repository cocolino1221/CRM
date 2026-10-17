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
