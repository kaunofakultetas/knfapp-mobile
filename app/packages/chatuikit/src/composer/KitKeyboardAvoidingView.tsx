// -----------------------------------------------------------
//  [*] chatuikit — KitKeyboardAvoidingView
//
//  The one keyboard wrapper a chat screen needs, carrying the
//  rules the kit learned the hard way so no screen re-derives
//  them:
//
//    - it should be the SCREEN ROOT. React Native's avoiding view
//      measures its own layout frame against the keyboard; nested
//      one level down (inside a SafeAreaView, say) that frame
//      comes up short by the header and the home indicator and
//      the composer ends up behind the keys. A screen that cannot
//      be the root passes the shortfall as keyboardVerticalOffset
//      (a stack header: its height);
//    - iOS pads by the bare keyboard height plus that offset;
//    - Android: with adjustResize the window itself shrinks and
//      any behaviour on top double-lifts — so the view stays
//      inert. Under EDGE-TO-EDGE (the platform default from
//      Android 15 / API 35, and Expo's default since SDK 53) the
//      window does NOT resize, and the keyboard covers the
//      composer. The view detects that case at keyboardDidShow —
//      the window kept its height while a keyboard appeared — and
//      pads by the keyboard height itself. Detected per event, so
//      a device that resizes and one that does not both work.
//
//  Apply the bottom safe-area inset INSIDE (the Composer already
//  does: only while the keyboard is down).
//
//  Used by:
//    - the host's conversation screen
// -----------------------------------------------------------

import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Platform, View, type KeyboardAvoidingViewProps, type ViewProps } from 'react-native';


export default function KitKeyboardAvoidingView({
  children,
  style,
  keyboardVerticalOffset = 0,
  behavior,
  ...rest
}: ViewProps & {
  children: ReactNode;
  // What sits between the window bottom and this view's frame
  // when it is not the screen root (a header's height)
  keyboardVerticalOffset?: number;
  // iOS behaviour override; default 'padding'
  behavior?: KeyboardAvoidingViewProps['behavior'];
}) {

  // Android edge-to-edge: the bottom padding that stands in for
  // the window resize the platform no longer does
  const [androidPad, setAndroidPad] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const windowBefore = { height: Dimensions.get('window').height };
    const dims = Dimensions.addEventListener('change', ({ window }) => {
      // Track the keyboard-less height: only update while no pad
      // is applied (a resize with the keyboard up is the platform
      // doing the lifting — then no pad is wanted)
      windowBefore.height = window.height;
    });
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboard = e.endCoordinates?.height ?? 0;
      const now = Dimensions.get('window').height;
      // adjustResize shrank the window by about the keyboard —
      // nothing to do; edge-to-edge left it whole — pad
      const resized = windowBefore.height - now > keyboard * 0.5;
      setAndroidPad(resized ? 0 : Math.max(0, keyboard - keyboardVerticalOffset));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setAndroidPad(0));
    return () => {
      dims.remove();
      show.remove();
      hide.remove();
    };
  }, [keyboardVerticalOffset]);

  if (Platform.OS === 'android') {
    return (
      <View style={[{ flex: 1 }, style, androidPad > 0 ? { paddingBottom: androidPad } : null]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? (behavior ?? 'padding') : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
