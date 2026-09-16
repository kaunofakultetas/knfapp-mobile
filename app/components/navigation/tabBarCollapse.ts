// -----------------------------------------------------------
//  [*] Navigation — the tab bar's collapse signal
//
//  One module-level store for the floating tab chip's two
//  states: EXPANDED (the full row) and COLLAPSED (the round
//  active-tab button). Screens feed it scroll direction
//  through useTabBarScroll — scrolling down folds the chip
//  away, scrolling up (or landing near the top) brings it
//  back — and the bar itself reads both faces of the same
//  state: the reanimated shared value drives the morph on
//  the UI thread, the plain boolean mirror drives pointer
//  events and accessibility on the JS side. Every
//  transition goes through setTabBarCollapsed, so the two
//  can never disagree.
//
//  Module-level on purpose (no provider): the bar and the
//  screens live in different subtrees of the tab navigator,
//  and there is exactly one bar per app.
//
//  Split into:
//
//    tabBarCollapse        — the shared value (0..1)
//    setTabBarCollapsed    — the one writer
//    holdTabBarExpanded    — the button-press override
//    useTabBarCollapsed    — the boolean mirror, subscribed
//    useTabBarScroll       — a screen's scroll feeders
//    TAB_BAR_CLEARANCE     — content padding under the chip
// -----------------------------------------------------------

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { makeMutable, withSpring, type SharedValue } from 'react-native-reanimated';


// What the wired screens pad their content bottoms with so the
// last row can scroll clear of the floating chip
export const TAB_BAR_CLEARANCE = 96;

// Same critically-damped family as the bar's own springs — the
// chip glides between its two shapes, never bounces
const COLLAPSE_SPRING = { damping: 22, stiffness: 220, mass: 0.9, overshootClamping: true };

// Scroll grammar: this close to the top the chip is ALWAYS
// expanded; past it, this much accumulated same-direction
// travel flips the state (hysteresis — jitter never flaps it)
const TOP_SLACK = 32;
const FLIP_AFTER = 14;


// The jest reanimated mock's makeMutable is the identity — a
// primitive cannot carry `.value`, so tests get a plain box
// with the same shape
const created: unknown = makeMutable(0);
export const tabBarCollapse: SharedValue<number> =
  (created !== null && typeof created === 'object' ? created : { value: 0 }) as SharedValue<number>;


let collapsedNow = false;
const listeners = new Set<() => void>();


// The plain read for non-React callers (and the tests, which
// must not route state reads through a second React root)
export function isTabBarCollapsed(): boolean {
  return collapsedNow;
}


// The button-press OVERRIDE: while a fling's momentum is still
// running, its downward move events keep voting "collapse" —
// so a tap that just expanded the chip would be overruled a
// frame later. The hold pins the chip expanded and takes the
// scroll's vote away until that scroll is over: the next
// finger-down (onScrollBeginDrag) is a NEW gesture and gets
// its say back. Momentum that simply peters out ends the
// story by itself — no events, nothing to suppress.
let heldExpanded = false;

export function holdTabBarExpanded(): void {
  heldExpanded = true;
  setTabBarCollapsed(false);
}

// The counterpart — onScrollBeginDrag calls it for every new
// gesture; exported so the tests can reset between cases
export function releaseTabBarHold(): void {
  heldExpanded = false;
}


export function setTabBarCollapsed(next: boolean): void {
  if (collapsedNow === next) return;
  collapsedNow = next;
  tabBarCollapse.value = withSpring(next ? 1 : 0, COLLAPSE_SPRING);
  listeners.forEach((notify) => notify());
}


// -----------------------------------------------------------
// useTabBarCollapsed — the subscribed boolean mirror
// -----------------------------------------------------------
//
// Used by:
//   - TabBar — pointer events, accessibility, the collapsed
//     button's visibility semantics
// -----------------------------------------------------------

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
const snapshot = () => collapsedNow;

export function useTabBarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}


// -----------------------------------------------------------
// useTabBarScroll — the feeder a scrolling screen attaches
// -----------------------------------------------------------
//
//   const tabBarScroll = useTabBarScroll();
//   <FlatList onScroll={tabBarScroll.onScroll}
//             onScrollEndDrag={tabBarScroll.onScrollEndDrag}
//             scrollEventThrottle={tabBarScroll.scrollEventThrottle} />
//
// Direction with hysteresis: near the top always expands;
// deeper, FLIP_AFTER points of accumulated travel in one
// direction flip the chip, and a direction change resets the
// accumulator so a finger wobble never flaps it. Overscroll
// bounce (negative offsets) is ignored outright.
//
// onScrollEndDrag COMMITS the direction at finger release:
// an inertial fling keeps travelling that way while move
// events can go sparse or silent, so a released upward fling
// must expand the chip immediately, never "once the
// momentum happens to report enough travel".
//
// onScrollBeginDrag opens every gesture: it releases the
// button-press hold (a NEW touch means the person is scrolling
// again on purpose — the old fling's override is over) and
// zeroes the accumulator so the fresh gesture speaks for
// itself.
//
// Used by:
//   - the scrolling tab screens (news, messages, schedule,
//     settings, id)
// -----------------------------------------------------------

export function useTabBarScroll(): {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
} {
  const lastY = useRef(0);
  const travelled = useRef(0);
  const lastDelta = useRef(0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    if (y < 0) return;
    if (y <= TOP_SLACK) {
      lastY.current = y;
      travelled.current = 0;
      lastDelta.current = 0;
      setTabBarCollapsed(false);
      return;
    }

    const delta = y - lastY.current;
    lastY.current = y;
    if (delta === 0) return;
    lastDelta.current = delta;
    if ((delta > 0) !== (travelled.current > 0)) travelled.current = 0;
    travelled.current += delta;

    // A held chip took this scroll's vote away — track the
    // offsets (the NEXT gesture needs true deltas) but decide
    // nothing
    if (heldExpanded) return;

    if (travelled.current > FLIP_AFTER) setTabBarCollapsed(true);
    else if (travelled.current < -FLIP_AFTER) setTabBarCollapsed(false);
  }, []);

  const onScrollBeginDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A fresh finger-down: the old fling's override is over,
    // and the new gesture starts with a clean accumulator
    releaseTabBarHold();
    lastY.current = event.nativeEvent.contentOffset.y;
    travelled.current = 0;
    lastDelta.current = 0;
  }, []);

  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (heldExpanded) return;
    const y = event.nativeEvent.contentOffset.y;
    if (y <= TOP_SLACK) {
      setTabBarCollapsed(false);
      return;
    }
    // The last move before release names the fling's direction
    if (lastDelta.current < -2) setTabBarCollapsed(false);
    else if (lastDelta.current > 2) setTabBarCollapsed(true);
  }, []);

  return { onScroll, onScrollBeginDrag, onScrollEndDrag, scrollEventThrottle: 16 };
}
