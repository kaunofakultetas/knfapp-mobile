// -----------------------------------------------------------
//  [*] useKeyboardVisible — is the soft keyboard up?
//
//  One boolean for layouts that pad by the home-indicator
//  inset while the keyboard is down and sit flush on the keys
//  while it is up (the chatuikit Composer carries the same
//  logic inline). iOS answers on the will-events so the pad
//  drops in step with the keyboard animation; Android only
//  has the did-events. Web has no soft keyboard: always false.
//
//    const keyboardUp = useKeyboardVisible();
//    style={{ paddingBottom: keyboardUp ? 12 : insets.bottom + 12 }}
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';







// -----------------------------------------------------------
// useKeyboardVisible (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/new-chat/index.tsx — the pinned bottom section
//   - app/(main)/delete-account/index.tsx — the form padding
// -----------------------------------------------------------

export default function useKeyboardVisible(): boolean {

  const [up, setUp] = useState(false);


  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setUp(true));
    const hide = Keyboard.addListener(hideEvent, () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);


  return up;
}
