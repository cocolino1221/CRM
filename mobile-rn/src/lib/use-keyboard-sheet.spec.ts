import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Keyboard: {}, Platform: { OS: 'android' }, useWindowDimensions: () => ({}) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));

import { sheetMaxHeightFor } from './use-keyboard-sheet';

describe('sheetMaxHeightFor', () => {
  it('fills the screen less the status bar when the keyboard is closed', () => {
    expect(sheetMaxHeightFor(800, 0, 24)).toBe(760);
  });

  it('shrinks to what is left above the keyboard, so Salvează stays visible', () => {
    expect(sheetMaxHeightFor(800, 320, 24)).toBe(440);
  });

  it('never collapses below a usable height on a small phone', () => {
    expect(sheetMaxHeightFor(500, 400, 24)).toBe(260);
  });
});
