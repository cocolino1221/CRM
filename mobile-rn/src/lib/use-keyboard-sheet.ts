import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Keeps a bottom sheet above the keyboard.
 *
 * Android does not resize a Modal's content when the keyboard opens, so a
 * sheet pinned to the bottom of the screen hid its own text fields and its
 * Salvează button behind the keyboard. Give the backdrop `paddingBottom:
 * keyboardHeight` and the sheet `maxHeight: sheetMaxHeight`.
 */
export function sheetMaxHeightFor(windowHeight: number, keyboardHeight: number, topInset: number): number {
  return Math.max(260, windowHeight - keyboardHeight - topInset - 16);
}

export function useKeyboardSheet(): { keyboardHeight: number; sheetMaxHeight: number } {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // iOS reports the keyboard before it animates in, Android only after.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { keyboardHeight, sheetMaxHeight: sheetMaxHeightFor(windowHeight, keyboardHeight, insets.top) };
}
