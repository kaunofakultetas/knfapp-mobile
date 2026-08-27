// -----------------------------------------------------------
//  [*] useCollapsibleHeader — scroll-away title bars
//
//  The pattern feed readers expect: scrolling down slides the
//  title bar away to give the content the room, any scroll up
//  brings it straight back, and letting go mid-way glides to
//  whichever end is nearer on a soft spring. At the very top the bar is always
//  fully open, and the rubber-band bounce never moves it.
//
//  Everything animates on the UI thread through Reanimated
//  shared values: the scroll handler folds each scroll delta
//  into a `collapsed` distance clamped to the bar's measured
//  height, and the returned style collapses the bar IN LAYOUT
//  FLOW (height shrinks while the content slides up under an
//  overflow:hidden clip). Staying in flow is the point — the
//  list below simply grows, so pull-to-refresh, loading and
//  error states need no absolute-position offset arithmetic.
//
//    const header = useCollapsibleHeader();
//    <Animated.View style={header.barStyle}>
//      <Animated.View onLayout={header.onBarLayout} style={header.barContentStyle}>
//        …the bar that hides…
//      </Animated.View>
//    </Animated.View>
//    <Animated.FlatList onScroll={header.scrollHandler} scrollEventThrottle={16} … />
//    header.reveal()   — programmatic open (mode switch, scroll-to-top)
// -----------------------------------------------------------

import { useCallback } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';


// Settle animation — a soft, critically-damped spring so the
// bar glides to its resting place the way iOS chrome does,
// never a hard snap
const SETTLE = { damping: 24, stiffness: 190, mass: 0.9, overshootClamping: true };







// -----------------------------------------------------------
// useCollapsibleHeader (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/news.tsx — the news feed title bar
// -----------------------------------------------------------

export default function useCollapsibleHeader() {

  // How far the bar is currently hidden, in points, and the
  // most it can hide (the bar's measured height — 0 until the
  // first layout, which disables collapsing rather than
  // guessing a height)
  const collapsed = useSharedValue(0);
  const maxCollapse = useSharedValue(0);
  const lastY = useSharedValue(0);


  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = Math.max(0, event.contentOffset.y);
      const dy = y - lastY.value;
      lastY.value = y;

      const max = maxCollapse.value;
      if (max === 0) return;

      // Fold the delta in, then never hide more than the reader
      // has actually scrolled — that keeps the bar fully open at
      // the top and immune to the bounce region
      let next = Math.min(max, Math.max(0, collapsed.value + dy));
      if (y < next) next = y;
      collapsed.value = next;
    },
    onEndDrag: () => {
      const max = maxCollapse.value;
      if (collapsed.value > 0 && collapsed.value < max) {
        collapsed.value = withSpring(collapsed.value > max / 2 ? max : 0, SETTLE);
      }
    },
    onMomentumEnd: () => {
      const max = maxCollapse.value;
      if (collapsed.value > 0 && collapsed.value < max) {
        collapsed.value = withSpring(collapsed.value > max / 2 ? max : 0, SETTLE);
      }
    },
  });


  // The clip: its height is what the layout below sees
  const barStyle = useAnimatedStyle(() => ({
    height: maxCollapse.value === 0 ? undefined : maxCollapse.value - collapsed.value,
    overflow: 'hidden' as const,
  }));


  // The bar itself slides up under the clip and fades slightly
  // so the motion reads as "tucking away", not "shrinking"
  const barContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -collapsed.value }],
    opacity: maxCollapse.value === 0 ? 1 : 1 - (collapsed.value / maxCollapse.value) * 0.4,
  }));


  // Measure once the bar renders at full size; re-measure on
  // font/orientation changes is harmless (same clamp)
  const onBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.round(event.nativeEvent.layout.height);
      if (height > 0 && height !== maxCollapse.value) maxCollapse.value = height;
    },
    [maxCollapse],
  );


  const reveal = useCallback(() => {
    collapsed.value = withSpring(0, SETTLE);
    lastY.value = 0;
  }, [collapsed, lastY]);


  return { scrollHandler, barStyle, barContentStyle, onBarLayout, reveal };
}
