// -----------------------------------------------------------
//  [*] chatuikit — a11y
//
//  Two tiny hooks. useScreenReaderEnabledRef: whether a screen
//  reader is running, kept in a ref so event handlers and
//  effects can consult it without re-rendering —
//  announceForAccessibility is not free (it interrupts whatever
//  the reader is saying), so the kit only speaks when somebody
//  is listening. useReducedMotionSafe: the OS "reduce motion"
//  preference through Reanimated's hook when the installed
//  version has it (3.4+), false otherwise — a host's older
//  Reanimated or a test mock without the export must not crash
//  every bubble.
//
//  Used by:
//    - chatuikit/list/MessageList.tsx  — new-message announcements
//    - chatuikit/message/MessageBubble.tsx, TypingBubble.tsx — entering animations
// -----------------------------------------------------------

import { useEffect, useRef, type MutableRefObject } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';


export function useScreenReaderEnabledRef(): MutableRefObject<boolean> {

  const enabledRef = useRef(false);


  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (alive) enabledRef.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      enabledRef.current = enabled;
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);


  return enabledRef;
}


export function useReducedMotionSafe(): boolean {
  const hook = (Reanimated as { useReducedMotion?: () => boolean }).useReducedMotion;
  // Constant per environment, so the hook count never changes
  // between renders
  return hook ? hook() : false;
}
