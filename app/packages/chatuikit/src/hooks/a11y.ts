// -----------------------------------------------------------
//  [*] chatuikit — a11y
//
//  Three tiny hooks. useScreenReaderEnabledRef: whether a screen
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

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
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


// The STATE twin of the ref hook, for the one place a change
// must re-render: MessageList flips to the upright orientation
// while a screen reader runs (an inverted list's scaleY
// transform breaks TalkBack's swipe order)
export function useScreenReaderEnabled(): boolean {

  const [enabled, setEnabled] = useState(false);


  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((current) => {
      if (alive) setEnabled(!!current);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (current) => setEnabled(!!current));
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);


  return enabled;
}


export function useReducedMotionSafe(): boolean {
  const hook = (Reanimated as { useReducedMotion?: () => boolean }).useReducedMotion;
  // Constant per environment, so the hook count never changes
  // between renders
  return hook ? hook() : false;
}


// -----------------------------------------------------------
// composeAccessibilityLabel
// -----------------------------------------------------------
//
// One label from parts, empties dropped, joined the way screen
// readers pause — instead of ad-hoc template strings that leak
// "undefined" or a trailing comma when a part is missing.
//
// Used by:
//   - message/MessageBubble.tsx
// -----------------------------------------------------------

export function composeAccessibilityLabel(parts: readonly (string | number | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== false && String(part).trim() !== '')
    .map((part) => String(part).trim())
    .join(', ');
}
