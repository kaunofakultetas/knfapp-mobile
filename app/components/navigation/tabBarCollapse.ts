// -----------------------------------------------------------
//  [*] Navigation — the tab bar's collapse signal
//
//  One module-level store for the floating tab chip's two
//  states: EXPANDED (the full row) and COLLAPSED (the round
//  faculty badge). Screens feed it scroll direction through
//  useTabBarScroll — scrolling down folds the chip away,
//  scrolling up (or landing near the top) brings it back —
//  and the bar itself reads both faces of the same state: the
//  reanimated shared value drives the morph on the UI thread,
//  the plain boolean mirror drives pointer events and
//  accessibility on the JS side. Every transition goes through
//  setTabBarCollapsed, so the two can never disagree.
//
//  Module-level on purpose (no provider): the bar and the
//  screens live in different subtrees of the tab navigator,
//  and there is exactly one bar per app. Being global, the
//  state survives navigation — so the bar re-expands itself
//  whenever its focused route changes (a tab press, a drawer
//  jump, a notification tap, a deep link alike), and the
//  drawer expands it before every jump it makes.
//
//  The hold is the one latch with an owner question: the
//  collapsed badge's press sets it (holdTabBarExpanded), and
//  NOBODY else needs to release it — the next finger-down on
//  any scrolling screen does (useTabBarScroll's
//  onScrollBeginDrag). Until then the scroll's votes are
//  muted, never the bar.
//
//  Split into:
//
//    TAB_BAR_CLEARANCE  — content padding under the chip
//    tabBarCollapse     — the shared value (0..1)
//    isTabBarCollapsed  — the plain read
//    setTabBarCollapsed — the one writer
//    holdTabBarExpanded — the button-press override
//    releaseTabBarHold  — its release, on a new gesture
//    subscribe          — useSyncExternalStore's subscriber
//    snapshot           — useSyncExternalStore's reader
//    useTabBarCollapsed — the boolean mirror, subscribed
//    useTabBarScroll    — a screen's scroll feeders
// -----------------------------------------------------------

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { makeMutable, withSpring, type SharedValue } from 'react-native-reanimated';


// Same critically-damped family as the bar's own springs — the
// chip glides between its two shapes, never bounces
const COLLAPSE_SPRING = { damping: 22, stiffness: 220, mass: 0.9, overshootClamping: true };

// Scroll grammar, part one: this close to the top (points) the
// chip is ALWAYS expanded
const TOP_SLACK = 32;

// Scroll grammar, part two: past TOP_SLACK, this much
// accumulated same-direction travel (points) flips the state —
// hysteresis, so a finger's jitter never flaps it
const FLIP_AFTER = 14;

// The jest reanimated mock's makeMutable is the identity — a
// primitive cannot carry `.value`, so tests get a plain box
// with the same shape (see tabBarCollapse below)
const created: unknown = makeMutable(0);

// Every useTabBarCollapsed subscription's notify callback —
// setTabBarCollapsed pings each one after a real flip
const listeners = new Set<() => void>();

// The JS-side truth the boolean mirror reads; only
// setTabBarCollapsed writes it
let collapsedNow = false;

// The button-press hold (see holdTabBarExpanded): while set,
// scroll events track offsets but vote nothing
let heldExpanded = false;







// -----------------------------------------------------------
// TAB_BAR_CLEARANCE
// -----------------------------------------------------------
//
// What the wired screens pad their content bottoms with (in
// points) so the last row can scroll clear of the floating
// chip.
//
// Used by:
//   - app/(main)/tabs/messages.tsx, schedule.tsx, settings.tsx,
//     id.tsx, assistant.tsx — list / scroll content padding
// -----------------------------------------------------------

export const TAB_BAR_CLEARANCE = 96;







// -----------------------------------------------------------
// tabBarCollapse
// -----------------------------------------------------------
//
// The UI-thread face of the state: 0 = expanded, 1 = collapsed,
// springing between them. Read-only for everyone but
// setTabBarCollapsed — a write elsewhere would desync it from
// the boolean mirror.
//
// Used by:
//   - components/navigation/TabBar.tsx — the chip's width,
//     height, radius and the two faces' cross-fade
//   - setTabBarCollapsed (below) — the one writer
// -----------------------------------------------------------

export const tabBarCollapse: SharedValue<number> =
  (created !== null && typeof created === 'object' ? created : { value: 0 }) as SharedValue<number>;







// -----------------------------------------------------------
// isTabBarCollapsed
// -----------------------------------------------------------
//
// The plain read for non-React callers (and the tests, which
// must not route state reads through a second React root).
//
// Used by:
//   - nothing in the app at the moment — __tests__/tabBar.test.tsx
//     and __tests__/sidebar.test.tsx read the state through it
// -----------------------------------------------------------

export function isTabBarCollapsed(): boolean {
  return collapsedNow;
}







// -----------------------------------------------------------
// setTabBarCollapsed
// -----------------------------------------------------------
//
// The ONE writer: flips the boolean, springs the shared value
// and pings every subscribed mirror — a no-op when the state
// already matches, so repeated calls cost nothing.
//
// Used by:
//   - components/navigation/TabBar.tsx — tab press and every
//     change of the focused route
//   - components/Sidebar.tsx — before every drawer jump
//   - holdTabBarExpanded, useTabBarScroll (below)
// -----------------------------------------------------------

export function setTabBarCollapsed(next: boolean): void {
  if (collapsedNow === next) return;
  collapsedNow = next;
  tabBarCollapse.value = withSpring(next ? 1 : 0, COLLAPSE_SPRING);
  listeners.forEach((notify) => notify());
}







// -----------------------------------------------------------
// holdTabBarExpanded
// -----------------------------------------------------------
//
// The button-press OVERRIDE: while a fling's momentum is still
// running, its downward move events keep voting "collapse" —
// so a tap that just expanded the chip would be overruled a
// frame later. The hold pins the chip expanded and takes the
// scroll's vote away until that scroll is over: the next
// finger-down (onScrollBeginDrag) is a NEW gesture and gets
// its say back. Momentum that simply peters out ends the
// story by itself — no events, nothing to suppress. The caller
// never releases it; useTabBarScroll does.
//
// Used by:
//   - components/navigation/TabBar.tsx — the collapsed badge's
//     press
// -----------------------------------------------------------

export function holdTabBarExpanded(): void {
  heldExpanded = true;
  setTabBarCollapsed(false);
}







// -----------------------------------------------------------
// releaseTabBarHold
// -----------------------------------------------------------
//
// Lifts the hold — a new gesture speaks for itself again.
// Leaves the collapsed state exactly as it is.
//
// Used by:
//   - useTabBarScroll (below) — onScrollBeginDrag, every new
//     gesture
//   - __tests__/tabBar.test.tsx, __tests__/sidebar.test.tsx —
//     the reset between cases
// -----------------------------------------------------------

export function releaseTabBarHold(): void {
  heldExpanded = false;
}







// -----------------------------------------------------------
// subscribe
// -----------------------------------------------------------
//
// useSyncExternalStore's subscriber: registers one mirror's
// notify callback and hands back its removal.
//
// Used by:
//   - useTabBarCollapsed (below)
// -----------------------------------------------------------

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};







// -----------------------------------------------------------
// snapshot
// -----------------------------------------------------------
//
// useSyncExternalStore's reader — the current boolean, a
// primitive, so React's snapshot comparison is exact.
//
// Used by:
//   - useTabBarCollapsed (below) — client and server snapshot
// -----------------------------------------------------------

const snapshot = () => collapsedNow;







// -----------------------------------------------------------
// useTabBarCollapsed
// -----------------------------------------------------------
//
//   const collapsed = useTabBarCollapsed()   — re-renders on
//                                              every flip
//
// The subscribed boolean mirror of the shared value: the JS
// side's answer for pointer events and accessibility, which
// the UI-thread value cannot drive.
//
// Used by:
//   - components/navigation/TabBar.tsx — pointer events,
//     accessibility, the collapsed button's visibility
// -----------------------------------------------------------

export function useTabBarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}







// -----------------------------------------------------------
// useTabBarScroll
// -----------------------------------------------------------
//
//   const tabBarScroll = useTabBarScroll();
//   <FlatList onScroll={tabBarScroll.onScroll}
//             onScrollBeginDrag={tabBarScroll.onScrollBeginDrag}
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
//   - app/(main)/tabs/news.tsx, messages.tsx, schedule.tsx,
//     settings.tsx, id.tsx — each screen's scroll handlers
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
