import { describe, expect, it } from 'vitest';
import { overlayKeyboardPadding } from './sheet-keyboard';

describe('overlayKeyboardPadding', () => {
  it('lifts by the whole keyboard when the layer reaches the bottom of the screen', () => {
    expect(overlayKeyboardPadding(300, 0)).toBe(300);
  });

  it('lifts only by what reaches into a layer that ends above a tab bar', () => {
    expect(overlayKeyboardPadding(300, 60)).toBe(240);
  });

  it('does not lift with no keyboard, or one shorter than the gap', () => {
    expect(overlayKeyboardPadding(0, 60)).toBe(0);
    expect(overlayKeyboardPadding(40, 60)).toBe(0);
    expect(overlayKeyboardPadding(300, -10)).toBe(300);
  });
});
