import { createHmac, timingSafeEqual } from 'crypto';

/**
 * A short-lived pass from a form the CRM itself served to its booking page:
 * "the person who just submitted is contact X". The booking page trades it for
 * that contact's name, email and phone, so nothing personal travels in the URL.
 *
 * Signed with the server's secret; it names one contact in one workspace and
 * expires after a day.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function sign(payload: string, secret: string): string {
  return createHmac('sha256', `booking-link:${secret}`).update(payload).digest('base64url');
}

export function createBookingLinkToken(
  contactId: string,
  workspaceId: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = b64(JSON.stringify({ c: contactId, w: workspaceId, e: now + TTL_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

export function readBookingLinkToken(
  token: string,
  secret: string,
  now = Date.now(),
): { contactId: string; workspaceId: string } | null {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !secret) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data?.c !== 'string' || typeof data?.w !== 'string' || !(Number(data?.e) > now)) return null;
    return { contactId: data.c, workspaceId: data.w };
  } catch {
    return null;
  }
}

/** Adds the pass to a redirect that leads to a booking page; leaves any other URL alone. */
export function withBookingLinkToken(url: string | undefined, token: string): string | undefined {
  if (!url || !/\/book\/[^/?#]+/.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('t', token);
    return parsed.toString();
  } catch {
    return url;
  }
}
