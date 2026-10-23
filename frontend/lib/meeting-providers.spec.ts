import { describe, expect, it } from 'vitest';
import { orderedPlatforms, outcomeSummary, providerOptions } from './meeting-providers';

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

// The complaint this answers: whatever you pick, Google Meet stays the first
// platform in the list, because the list was a hand-written array.
describe('orderedPlatforms', () => {
  it('puts the chosen platform first', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: 'zoom' })).toEqual([
      'zoom',
      'google_meet',
    ]);
  });

  it('leaves Meet first when Meet is the one chosen', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: 'google_meet' })).toEqual([
      'google_meet',
      'zoom',
    ]);
  });

  it('offers what is connected before what is not, when nothing is chosen', () => {
    expect(orderedPlatforms({ google_meet: false, zoom: true, preference: null })).toEqual([
      'zoom',
      'google_meet',
    ]);
  });

  // Same tie-break the backend's "Automat" uses, so the list matches what a
  // booking would actually get.
  it('keeps Meet first when both are connected and nothing is chosen', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: null })).toEqual([
      'google_meet',
      'zoom',
    ]);
  });

  it('keeps Meet first when neither is connected', () => {
    expect(orderedPlatforms({ google_meet: false, zoom: false, preference: null })).toEqual([
      'google_meet',
      'zoom',
    ]);
  });

  it('is not thrown off by a preference that is not a platform', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: 'none' })).toEqual([
      'google_meet',
      'zoom',
    ]);
  });

  it('still answers before the info has loaded', () => {
    expect(orderedPlatforms(null)).toEqual(['google_meet', 'zoom']);
  });

  it('prefers the chosen platform even when it is the unconnected one', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: false, preference: 'zoom' })).toEqual([
      'zoom',
      'google_meet',
    ]);
  });
});

describe('providerOptions', () => {
  it('lists the chosen platform first, between Automat and Fără link', () => {
    const values = providerOptions({ google_meet: true, zoom: true, preference: 'zoom' }).map((o) => o.value);

    expect(values).toEqual(['', 'zoom', 'google_meet', 'none']);
  });

  it('keeps the labels attached to the right platform after reordering', () => {
    const opts = providerOptions({ google_meet: false, zoom: true, preference: 'zoom' });

    expect(opts[1]).toMatchObject({ value: 'zoom', label: 'Zoom', disabled: false });
    expect(opts[2]).toMatchObject({ value: 'google_meet', label: 'Google Meet (neconectat)', disabled: true });
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
