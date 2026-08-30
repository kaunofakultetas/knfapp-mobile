// -----------------------------------------------------------
//  [*] chatkit — a11y
//
//  One tiny hook: whether a screen reader is running, kept in
//  a ref so event handlers and effects can consult it without
//  re-rendering. announceForAccessibility is not free (it
//  interrupts whatever the reader is saying), so the kit only
//  speaks when somebody is listening.
//
//  Used by:
//    - chatkit/MessageList.tsx  — new-message announcements
// -----------------------------------------------------------

import { useEffect, useRef, type MutableRefObject } from 'react';
import { AccessibilityInfo } from 'react-native';


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
