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

export function providerOptions(info: MeetingProvidersInfo | null): Array<{
  value: '' | MeetingProvider;
  label: string;
  disabled?: boolean;
}> {
  const connected = (key: 'google_meet' | 'zoom') => !!info?.[key];
  const auto = info?.preference ? `Automat (${PROVIDER_LABELS[info.preference]})` : 'Automat';
  return [
    { value: '', label: auto },
    {
      value: 'google_meet',
      label: connected('google_meet') ? 'Google Meet' : 'Google Meet (neconectat)',
      disabled: !connected('google_meet'),
    },
    { value: 'zoom', label: connected('zoom') ? 'Zoom' : 'Zoom (neconectat)', disabled: !connected('zoom') },
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
