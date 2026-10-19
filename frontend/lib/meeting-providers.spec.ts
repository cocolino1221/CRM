import { describe, expect, it } from 'vitest';
import { outcomeSummary, providerOptions } from './meeting-providers';

describe('providerOptions', () => {
  it('disables platforms that are not connected', () => {
    const opts = providerOptions({ google_meet: true, zoom: false, preference: null });
    expect(opts.find((o) => o.value === 'zoom')).toMatchObject({ disabled: true, label: 'Zoom (neconectat)' });
    expect(opts.find((o) => o.value === 'google_meet')?.disabled).toBe(false);
  });

  it('names the closer preference in the automatic option', () => {
    expect(providerOptions({ google_meet: true, zoom: true, preference: 'zoom' })[0].label).toBe('Automat (Zoom)');
  });

  it('still renders before the info has loaded', () => {
    expect(providerOptions(null).map((o) => o.value)).toEqual(['', 'google_meet', 'zoom', 'none']);
  });
});

describe('outcomeSummary', () => {
  it('says who received the link', () => {
    expect(
      outcomeSummary({ provider: 'google_meet', link: 'x', emailed: { lead: true, host: true } }),
    ).toBe('Link Google Meet creat și trimis pe email la lead și closer.');
  });

  it('tells the setter to send it by WhatsApp when the lead has no email', () => {
    expect(outcomeSummary({ provider: 'zoom', link: 'x', emailed: { lead: false, host: true } })).toContain('WhatsApp');
  });

  it('shows the backend warning when there is no link', () => {
    expect(outcomeSummary({ provider: 'none', emailed: { lead: false, host: false }, warning: 'Reconectează Google' })).toBe('Reconectează Google');
  });
});
