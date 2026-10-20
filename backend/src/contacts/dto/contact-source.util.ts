import { ContactSource } from '../../database/entities/contact.entity';

/**
 * Accept a source as a person would type or pick it.
 *
 * The app's New Lead form sent its chip labels — "Social Media", "Cold Call"
 * — and the API rejected every lead added with a source chosen. Builds of the
 * app already on phones keep sending those labels, so they are mapped here
 * rather than only fixed in the app. Anything unknown is passed through
 * untouched for @IsEnum to reject.
 */
const ALIASES: Record<string, ContactSource> = {
  'cold call': ContactSource.COLD_OUTREACH,
  'cold_call': ContactSource.COLD_OUTREACH,
  'cold outreach': ContactSource.COLD_OUTREACH,
  'social media': ContactSource.SOCIAL_MEDIA,
  'social': ContactSource.SOCIAL_MEDIA,
  'google ads': ContactSource.GOOGLE_ADS,
  'google_ads': ContactSource.GOOGLE_ADS,
  'landing page': ContactSource.LANDING_PAGE,
  'email campaign': ContactSource.EMAIL_CAMPAIGN,
  'site': ContactSource.WEBSITE,
};

const VALUES = new Set<string>(Object.values(ContactSource));

export function normalizeContactSource(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (VALUES.has(trimmed)) return trimmed;
  const key = trimmed.toLowerCase();
  if (VALUES.has(key)) return key;
  return ALIASES[key] ?? trimmed;
}
