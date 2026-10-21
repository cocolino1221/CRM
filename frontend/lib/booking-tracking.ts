/**
 * Where someone on the booking page came from, sent with the booking so the
 * new lead gets a source ("Instagram · bio") and bookings can be counted per
 * channel. The server cleans it again; this only gathers it.
 */
export interface BookingTracking {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  src?: string;
  referrer?: string;
}

const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'src'] as const;

/**
 * The utm_* (or `src=`) on the link, and the page that sent them — unless that
 * page is the booking site itself (a reload or the glued-link repair), which
 * says nothing about where they came from. Undefined when there is nothing.
 */
export function trackingFromPage(search: string, referrer: string, ownHost: string): BookingTracking | undefined {
  const params = new URLSearchParams(search);
  const out: BookingTracking = {};
  for (const key of KEYS) {
    const value = (params.get(key) || '').trim();
    if (value) out[key] = value.slice(0, 200);
  }
  try {
    const host = referrer ? new URL(referrer).hostname : '';
    if (host && host !== ownHost) out.referrer = referrer.slice(0, 200);
  } catch {
    /* not a URL */
  }
  return Object.keys(out).length ? out : undefined;
}
