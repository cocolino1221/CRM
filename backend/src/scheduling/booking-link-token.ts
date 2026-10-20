import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * A short-lived pass from a form the CRM itself served to its booking page,
 * carrying what the person *typed into that form* — name, email, phone — so
 * the booking page can fill them in without them sitting readable in the URL.
 *
 * It holds the submitted values themselves, encrypted, rather than a contact
 * id: a submission is matched to an existing contact by email or phone, so a
 * pass naming the contact would hand anyone who typed someone else's email
 * that person's name and number. This way the page can only ever show back
 * what the visitor entered. Bound to one workspace; expires in two hours.
 */
const TTL_MS = 2 * 60 * 60 * 1000;

export interface BookingLinkPrefill {
  name: string;
  email: string;
  phone: string;
}

const keyFor = (secret: string) => createHash('sha256').update(`booking-link:${secret}`).digest();

export function createBookingLinkToken(
  prefill: BookingLinkPrefill,
  workspaceId: string,
  secret: string,
  now = Date.now(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ w: workspaceId, e: now + TTL_MS, p: prefill }), 'utf8'),
    cipher.final(),
  ]);
  return [iv, body, cipher.getAuthTag()].map((b) => b.toString('base64url')).join('.');
}

export function readBookingLinkToken(
  token: string,
  secret: string,
  now = Date.now(),
): { workspaceId: string; prefill: BookingLinkPrefill } | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !secret) return null;
  try {
    const [iv, body, tag] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8'));
    if (typeof data?.w !== 'string' || !(Number(data?.e) > now)) return null;
    const p = data.p ?? {};
    return {
      workspaceId: data.w,
      prefill: { name: String(p.name ?? ''), email: String(p.email ?? ''), phone: String(p.phone ?? '') },
    };
  } catch {
    return null;
  }
}

/**
 * Of the contact's name, email and phone, only those the visitor actually
 * typed into this submission — never what the CRM already knew about a
 * matching contact.
 */
export function submittedOnly(
  contact: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null },
  submitted: Record<string, unknown> | null | undefined,
): BookingLinkPrefill {
  const values = Object.values(submitted ?? {})
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim());
  const lower = values.map((v) => v.toLowerCase());
  const digits = values.map((v) => v.replace(/\D/g, '')).filter((d) => d.length >= 9);

  const email = String(contact.email || '').trim().toLowerCase();
  const phoneDigits = String(contact.phone || '').replace(/\D/g, '');
  const first = String(contact.firstName || '').trim();
  const last = String(contact.lastName && contact.lastName !== '-' ? contact.lastName : '').trim();
  const full = `${first} ${last}`.trim();
  // Whole words of a non-email answer: "Ana" inside "ana@x.ro" is not a typed name.
  const words = new Set(
    lower.filter((v) => !v.includes('@')).flatMap((v) => v.split(/[\s,;]+/)).filter(Boolean),
  );
  const typed = (part: string) =>
    !!part && part.toLowerCase().split(/\s+/).every((w) => words.has(w));

  return {
    email: email && !email.endsWith('.invalid') && lower.includes(email) ? email : '',
    phone:
      phoneDigits.length >= 9 && digits.some((d) => d.slice(-9) === phoneDigits.slice(-9))
        ? String(contact.phone)
        : '',
    name: typed(full) ? full : typed(first) ? [first, typed(last) ? last : ''].filter(Boolean).join(' ') : '',
  };
}

/**
 * Adds the pass to a redirect that leads to this CRM's own booking page;
 * leaves any other URL alone — a third-party site never receives it.
 */
export function withBookingLinkToken(
  url: string | undefined,
  token: string,
  crmOrigin: string | undefined,
): string | undefined {
  if (!url || !crmOrigin) return url;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(crmOrigin).origin || !/^\/book\/[^/]+\/?$/.test(parsed.pathname)) return url;
    parsed.searchParams.set('t', token);
    return parsed.toString();
  } catch {
    return url;
  }
}
