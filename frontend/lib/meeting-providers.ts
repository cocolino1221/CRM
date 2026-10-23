/**
 * The meeting platforms a booking can get a link on. The backend decides what
 * "automatic" means (the closer's preference, else whatever is connected);
 * the browser only offers what exists and explains what happened.
 */

export type MeetingProvider = 'google_meet' | 'zoom' | 'none';

export interface MeetingProvidersInfo {
  google_meet: boolean;
  zoom: boolean;
  preference: MeetingProvider | null;
}

export interface MeetingOutcome {
  provider: MeetingProvider;
  link?: string;
  emailed: { lead: boolean; host: boolean };
  warning?: string;
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  none: 'Fără link',
};

/**
 * The two platforms in the order to offer them: the one already chosen first,
 * then whatever is connected, then Meet before Zoom — the same tie-break the
 * backend's "Automat" applies, so the list matches what a booking would get.
 *
 * Ordered from the SAVED preference, not from whatever was just clicked, so the
 * buttons do not jump out from under the cursor mid-choice; the new order shows
 * the next time the page opens.
 */
export function orderedPlatforms(info: MeetingProvidersInfo | null): Array<'google_meet' | 'zoom'> {
  // Sort is stable, so equal ranks keep this order: Meet, then Zoom.
  const rank = (platform: 'google_meet' | 'zoom') => {
    if (info?.preference === platform) return 0;
    return info?.[platform] ? 1 : 2;
  };
  return (['google_meet', 'zoom'] as const).slice().sort((a, b) => rank(a) - rank(b));
}

export function providerOptions(info: MeetingProvidersInfo | null): Array<{
  value: '' | MeetingProvider;
  label: string;
  disabled?: boolean;
}> {
  const connected = (key: 'google_meet' | 'zoom') => !!info?.[key];
  const auto = info?.preference ? `Automat (${PROVIDER_LABELS[info.preference]})` : 'Automat';
  return [
    { value: '', label: auto },
    ...orderedPlatforms(info).map((platform) => ({
      value: platform,
      label: connected(platform) ? PROVIDER_LABELS[platform] : `${PROVIDER_LABELS[platform]} (neconectat)`,
      disabled: !connected(platform),
    })),
    { value: 'none', label: 'Fără link' },
  ];
}

/** One line for the setter after booking: who got the link. */
export function outcomeSummary(outcome?: MeetingOutcome | null): string {
  if (!outcome || !outcome.link) return outcome?.warning || 'Programarea e salvată, fără link de întâlnire.';
  const who = [outcome.emailed.lead && 'lead', outcome.emailed.host && 'closer'].filter(Boolean);
  const platform = PROVIDER_LABELS[outcome.provider] || 'întâlnire';
  if (!who.length) return `Link ${platform} creat, dar emailul nu a putut fi trimis.`;
  const missingLead = !outcome.emailed.lead ? ' Lead-ul nu are email valid, trimite-i linkul pe WhatsApp.' : '';
  return `Link ${platform} creat și trimis pe email la ${who.join(' și ')}.${missingLead}`;
}

/**
 * The platform buttons to offer for ONE TEAMMATE, as an admin or manager sets
 * them up from Team — so the order and the selection follow that person's own
 * choice, not the admin's. Saved on their `preferences.meetingProvider`, the
 * same field they would set themselves.
 *
 * "Automat" is spelled out plainly here: the person being configured is not the
 * one reading the screen, so naming their current platform in the label would
 * only be confusing.
 */
export function teammatePlatformOptions(
  connected: { google_meet: boolean; zoom: boolean } | null,
  theirs?: MeetingProvider | null,
): Array<{ value: '' | MeetingProvider; label: string; disabled: boolean }> {
  // null means "not known yet" — a pending or failed lookup must not leave an
  // admin unable to set anyone's platform — while an explicit false means the
  // workspace really has not connected that one.
  const info: MeetingProvidersInfo = {
    google_meet: connected ? !!connected.google_meet : true,
    zoom: connected ? !!connected.zoom : true,
    preference: theirs ?? null,
  };

  return [
    { value: '', label: 'Automat', disabled: false },
    ...orderedPlatforms(info).map((platform) => ({
      value: platform,
      label: info[platform] ? PROVIDER_LABELS[platform] : `${PROVIDER_LABELS[platform]} (neconectat)`,
      disabled: !info[platform],
    })),
    { value: 'none', label: 'Fără link', disabled: false },
  ];
}
