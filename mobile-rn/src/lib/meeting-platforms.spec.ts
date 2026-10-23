import { describe, expect, it } from 'vitest';
import { PLATFORM_OPTIONS, orderedPlatforms } from './meeting-platforms';

// Same rule as the web's frontend/lib/meeting-providers.ts: whatever a closer
// picked should be the first platform they see, instead of Google Meet always
// sitting at the front because the list was a hand-written array.
describe('orderedPlatforms', () => {
  it('puts the chosen platform first', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: 'zoom' })).toEqual([
      'zoom',
      'google_meet',
    ]);
  });

  it('offers what is connected before what is not, when nothing is chosen', () => {
    expect(orderedPlatforms({ google_meet: false, zoom: true, preference: null })).toEqual([
      'zoom',
      'google_meet',
    ]);
  });

  it('keeps Meet first when both are connected and nothing is chosen', () => {
    expect(orderedPlatforms({ google_meet: true, zoom: true, preference: null })).toEqual([
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

  it('still answers before the platforms have loaded', () => {
    expect(orderedPlatforms(null)).toEqual(['google_meet', 'zoom']);
  });
});

describe('PLATFORM_OPTIONS', () => {
  it('keeps Automat first and Fără link last, with the platforms between them', () => {
    const values = PLATFORM_OPTIONS({ google_meet: true, zoom: true, preference: 'zoom' }).map((o) => o.value);

    expect(values).toEqual(['', 'zoom', 'google_meet', 'none']);
  });

  it('labels each platform correctly after reordering', () => {
    const options = PLATFORM_OPTIONS({ google_meet: true, zoom: true, preference: 'zoom' });

    expect(options[1]).toEqual({ value: 'zoom', label: 'Zoom' });
    expect(options[2]).toEqual({ value: 'google_meet', label: 'Google Meet' });
  });
});
