// -----------------------------------------------------------
//  [*] chatuikit — KitKeyboardAvoidingView
//
//  The one keyboard wrapper a chat screen needs, carrying the
//  rules the kit learned the hard way so no screen re-derives
//  them:
//
//    - it must be the SCREEN ROOT. React Native's avoiding view
//      measures its own layout frame against the keyboard; nested
//      one level down (inside a SafeAreaView, say) that frame
//      comes up short by the header and the home indicator and
//      the composer ends up behind the keys;
//    - iOS pads by the bare keyboard height — no header offset.
//      A root-level frame reaches the window bottom, so the
//      classic useHeaderHeight() offset floats the composer one
//      header height above the keys;
//    - Android stays inert: the window's own adjustResize does
//      the lifting, and stacking a behaviour on top double-lifts.
//
//  Apply the bottom safe-area inset INSIDE (the Composer already
//  does: only while the keyboard is down).
//
//  Used by:
//    - the host's conversation screen
// -----------------------------------------------------------

import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type ViewProps } from 'react-native';


export default function KitKeyboardAvoidingView({ children, style, ...rest }: ViewProps & { children: ReactNode }) {

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
