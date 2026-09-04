// -----------------------------------------------------------
//  [*] timetableuikit — usePagePan
//
//  Horizontal week/day paging on the raw responder system —
//  no gesture library. The container watches the touch in the
//  CAPTURE phase, claims it only once the drag is decisively
//  horizontal (so cell taps and the vertical scroll keep
//  working), commits ONE page turn the moment the drag crosses
//  the threshold, and latches until the finger lifts — a long
//  drag is one page, never three. A SECOND finger abandons the
//  gesture (a pinch is not a page turn, and its coordinates
//  would corrupt the start point), and `enabled` is re-read on
//  every move — flipping it false mid-drag cancels the commit.
//
//  Used by:
//    - WeekGrid.tsx / DayTimeline.tsx — spread onto the root
// -----------------------------------------------------------

import { useEffect, useMemo, useRef } from 'react';

import type { GestureResponderEvent } from 'react-native';

export interface PagePanOptions {
  // Horizontal distance before the container claims the touch
  claimDx?: number;
  // Drag distance that turns the page
  commitDx?: number;
  enabled?: boolean;
}

export interface PagePanHandlers {
  onStartShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
  onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => boolean;
  onResponderMove: (event: GestureResponderEvent) => void;
  onResponderRelease: (event: GestureResponderEvent) => void;
  onResponderTerminate: (event: GestureResponderEvent) => void;
  onResponderTerminationRequest: () => boolean;
}


// +1 = forward (swipe left), -1 = back (swipe right)
export function usePagePan(onPage: (direction: 1 | -1) => void, options: PagePanOptions = {}): PagePanHandlers {
  const { claimDx = 12, commitDx = 50, enabled = true } = options;

  const start = useRef<{ x: number; y: number } | null>(null);
  // One page per gesture, however far the finger travels
  const handled = useRef(false);
  const onPageRef = useRef(onPage);
  // Read through a ref so a mid-gesture flip reaches handlers
  // the responder system captured BEFORE the flip re-rendered
  const enabledRef = useRef(enabled);
  useEffect(() => {
    onPageRef.current = onPage;
    enabledRef.current = enabled;
  }, [onPage, enabled]);

  return useMemo<PagePanHandlers>(() => {
    const reset = () => {
      start.current = null;
      handled.current = false;
    };

    // More than one finger down = not a page swipe; drop the
    // start point so nothing claims or commits until every
    // finger lifts and a fresh single-touch gesture begins
    const multiTouch = (event: GestureResponderEvent) => (event.nativeEvent.touches ?? []).length > 1;

    const commitIfCrossed = (event: GestureResponderEvent) => {
      if (!enabledRef.current || !start.current || handled.current) return;
      const dx = event.nativeEvent.pageX - start.current.x;
      if (Math.abs(dx) < commitDx) return;
      handled.current = true;
      onPageRef.current(dx < 0 ? 1 : -1);
    };

    return {
      // Watch, never claim, on touch DOWN — children get taps
      onStartShouldSetResponderCapture: (event) => {
        if (!enabledRef.current || multiTouch(event)) {
          start.current = null;
          return false;
        }
        start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        handled.current = false;
        return false;
      },
      // Claim once the drag is decisively horizontal
      onMoveShouldSetResponderCapture: (event) => {
        if (!enabledRef.current || !start.current) return false;
        if (multiTouch(event)) {
          start.current = null;
          return false;
        }
        const dx = event.nativeEvent.pageX - start.current.x;
        const dy = event.nativeEvent.pageY - start.current.y;
        return Math.abs(dx) > claimDx && Math.abs(dx) > Math.abs(dy);
      },
      onResponderMove: (event) => {
        if (multiTouch(event)) {
          start.current = null;
          return;
        }
        commitIfCrossed(event);
      },
      onResponderRelease: (event) => {
        commitIfCrossed(event);
        reset();
      },
      onResponderTerminate: reset,
      // Holding a page turn: nothing steals mid-drag
      onResponderTerminationRequest: () => false,
    };
  }, [claimDx, commitDx]);
}
