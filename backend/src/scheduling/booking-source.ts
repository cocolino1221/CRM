import { ContactSource } from '../database/entities/contact.entity';

/**
 * Where someone who booked came from: the utm_* (or a short `src=`) on the
 * link they opened, and the page that sent them there. Kept on the booking
 * and on a new lead, so the reports can say how many bookings each place
 * brings.
 */
export interface BookingTracking {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  src?: string;
  referrer?: string;
}

const KEYS: Array<keyof BookingTracking> = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'src', 'referrer'];

/** Strings only, trimmed and capped; nothing else from the request is kept. Null when empty. */
export function cleanTracking(raw: unknown): BookingTracking | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: BookingTracking = {};
  for (const key of KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    const text = value.trim().slice(0, 200);
    // An unfilled placeholder ({{x}}, {x}, xxxxx) says nothing about the source.
    if (!text || /^(\{+[^{}]*\}+|x{3,})$/i.test(text)) continue;
    out[key] = text;
  }
  return Object.keys(out).length ? out : null;
}

const RULES: Array<{ match: RegExp; source: ContactSource; label: string }> = [
  { match: /instagram|^ig$|^insta/, source: ContactSource.INSTAGRAM, label: 'Instagram' },
  { match: /facebook|^fb$|^meta$|fb\.com|fb\.me/, source: ContactSource.FACEBOOK, label: 'Facebook' },
  { match: /whatsapp|^wa$|wa\.me/, source: ContactSource.WHATSAPP, label: 'WhatsApp' },
  { match: /tiktok/, source: ContactSource.SOCIAL_MEDIA, label: 'TikTok' },
  { match: /youtube|youtu\.be/, source: ContactSource.SOCIAL_MEDIA, label: 'YouTube' },
  { match: /linkedin|lnkd\.in/, source: ContactSource.LINKEDIN, label: 'LinkedIn' },
  { match: /typeform/, source: ContactSource.TYPEFORM, label: 'Typeform' },
  { match: /manychat/, source: ContactSource.MANYCHAT, label: 'ManyChat' },
  { match: /google/, source: ContactSource.GOOGLE_ADS, label: 'Google' },
  { match: /mail|newsletter/, source: ContactSource.EMAIL_CAMPAIGN, label: 'Email' },
];

/** The host of a referrer URL, or the text as given. */
function hostOf(referrer: string): string {
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return referrer;
  }
}

/**
 * The lead source and a readable label: "Instagram · bio", "Facebook",
 * "teamra2.ro". The utm wins over the referrer — it is what the team chose
 * to put on the link. No tracking at all is a plain website visit.
 */
export function sourceFromTracking(tracking: BookingTracking | null): { source: ContactSource; label: string } {
  const named = (tracking?.utm_source || tracking?.src || '').toLowerCase();
  const host = tracking?.referrer ? hostOf(tracking.referrer).toLowerCase() : '';
  const campaign = tracking?.utm_campaign || tracking?.utm_content || tracking?.utm_medium || '';

  for (const probe of [named, host]) {
    if (!probe) continue;
    const rule = RULES.find((r) => r.match.test(probe));
    if (rule) {
      const google = rule.source === ContactSource.GOOGLE_ADS && !/cpc|ads|paid/i.test(tracking?.utm_medium || '') && probe === host;
      return {
        source: google ? ContactSource.WEBSITE : rule.source,
        label: [google ? 'Google (căutare)' : rule.label, campaign].filter(Boolean).join(' · '),
      };
    }
  }
  const label = [tracking?.utm_source || tracking?.src || host, campaign].filter(Boolean).join(' · ');
  return { source: ContactSource.WEBSITE, label: label || 'Link direct' };
}
