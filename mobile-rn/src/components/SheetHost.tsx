import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Modal, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardSheet } from '../lib/use-keyboard-sheet';
import { overlayKeyboardPadding } from '../lib/sheet-keyboard';

/**
 * Hosts a bottom sheet that has text fields in it.
 *
 * On Android a Modal is a window of its own, and React Native only hears
 * about the keyboard on the app's main window: inside a Modal the keyboard
 * opened, `keyboardDidShow` never fired, the sheet thought the keyboard was
 * 0 tall and stayed underneath it — whatever padding we gave it. So on
 * Android the sheet is drawn as a layer over the screen, in the main
 * window, where the keyboard is heard. On iOS a Modal works and stays.
 *
 * `children` receives how far to lift the sheet and how tall it may be.
 */
export default function SheetHost({
  onRequestClose,
  children,
}: {
  onRequestClose: () => void;
  children: (layout: { keyboardPadding: number; sheetMaxHeight: number }) => ReactNode;
}) {
  const { keyboardHeight, sheetMaxHeight } = useKeyboardSheet();
  const { height: windowHeight } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [bottomGap, setBottomGap] = useState(0);
  const [layer, setLayer] = useState({ y: 0, height: 0 });
  const insets = useSafeAreaInsets();

  // Android's back button closes the sheet, as it did the Modal.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [onRequestClose]);

  if (Platform.OS !== 'android') {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onRequestClose}>
        {children({ keyboardPadding: keyboardHeight, sheetMaxHeight })}
      </Modal>
    );
  }

  // Inside a tab the layer ends above the tab bar, which the keyboard also
  // covers: lift by what the keyboard covers of the layer, not by its height.
  const keyboardPadding = overlayKeyboardPadding(keyboardHeight, bottomGap);
  // What is left of the layer above the keyboard, less the status bar.
  const room = layer.height ? layer.height - keyboardPadding - Math.max(0, insets.top - layer.y) - 16 : sheetMaxHeight;
  return (
    <View
      ref={ref}
      style={[StyleSheet.absoluteFillObject, styles.layer]}
      onLayout={() =>
        ref.current?.measureInWindow((_x, y, _w, h) => {
          setBottomGap(Math.max(0, windowHeight - (y + h)));
          setLayer({ y, height: h });
        })
      }
    >
      {children({ keyboardPadding, sheetMaxHeight: Math.max(260, room) })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000 },
});
