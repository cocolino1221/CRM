/**
 * How far to lift a sheet drawn as a layer whose bottom edge sits `bottomGap`
 * above the bottom of the screen (a tab bar under it), when the keyboard is
 * `keyboardHeight` tall: only the part of the keyboard that reaches into the
 * layer. Never negative.
 */
export function overlayKeyboardPadding(keyboardHeight: number, bottomGap: number): number {
  if (!keyboardHeight || keyboardHeight <= 0) return 0;
  return Math.max(0, Math.round(keyboardHeight - Math.max(0, bottomGap)));
}
