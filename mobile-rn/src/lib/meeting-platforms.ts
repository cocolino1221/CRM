/**
 * Which meeting platform a closer's bookings get by default, as the Settings
 * screen offers it.
 *
 * The same rule as the web's frontend/lib/meeting-providers.ts — the two live
 * apart because the app cannot import from the Next.js app, the way
 * src/lib/tags.ts mirrors frontend/lib/tags.ts.
 */

export type Provider = 'google_meet' | 'zoom' | 'none';

export interface ProvidersInfo {
  google_meet: boolean;
  zoom: boolean;
  preference: Provider | null;
}

const LABELS: Record<'google_meet' | 'zoom', string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
};

/**
 * The two platforms in the order to show them: the one already chosen first,
 * then whatever is connected, then Meet before Zoom — the same tie-break the
 * backend's "Automat" applies, so the list matches what a booking would get.
 *
 * Ordered from the SAVED preference, not from whatever was just tapped, so the
 * buttons do not jump under the finger mid-choice; the new order shows the next
 * time the screen opens.
 */
export function orderedPlatforms(info: ProvidersInfo | null): Array<'google_meet' | 'zoom'> {
  // Sort is stable, so equal ranks keep this order: Meet, then Zoom.
  const rank = (platform: 'google_meet' | 'zoom') => {
    if (info?.preference === platform) return 0;
    return info?.[platform] ? 1 : 2;
  };
  return (['google_meet', 'zoom'] as const).slice().sort((a, b) => rank(a) - rank(b));
}

/** Every button the setting shows, in order. */
export function PLATFORM_OPTIONS(
  info: ProvidersInfo | null,
): Array<{ value: Provider | ''; label: string }> {
  return [
    { value: '', label: 'Automat' },
    ...orderedPlatforms(info).map((platform) => ({ value: platform, label: LABELS[platform] })),
    { value: 'none', label: 'Fără link' },
  ];
}
