// -----------------------------------------------------------
//  [*] useCollapsibleHeader — scroll-away title bars
//
//  The header scrolls away WITH the content, as if it were the
//  top of the page: while the finger is down the bar slides up
//  at exactly the content's speed and stays seamlessly glued to
//  the first row ("leave the header behind"), and once it is
//  hidden, any scroll up slides it back down over the feed —
//  it was just waiting above the edge. Release mid-way and it
//  glides to its resting place on a soft spring, onward in the
//  direction the drag was heading (a still release settles to
//  the nearer end). Momentum never FOLDS into the collapse — a
//  flick's huge per-frame deltas would slam the bar shut in a
//  frame or two — but it STEERS: while the list coasts, the
//  travel direction starts the same spring glide (a fast flick
//  can release before a single drag event lands, and the bar
//  must not hang open while the feed flies by). Rubber-banding
//  at either end is inert: deltas are measured on the clamped
//  scroll range.
//
//  Mechanically the bar is a translate-only OVERLAY: it floats
//  over the list and animates nothing but transform, so hiding
//  it never changes layout — no viewport growth, no offset
//  clamp to fight (the flicker class of the in-flow design),
//  and content and bar move at the same speed instead of the
//  list rising twice as fast as the bar shrinks. The list must
//  make room for the bar itself, and HOW decides where a
//  pull-to-refresh spinner lands:
//
//    iOS     — a top contentInset of barHeight (listProps).
//              UIScrollView integrates its refresh control
//              with the inset, so the spinner appears in the
//              gap BELOW the pinned bar, the content rubber-
//              bands away from the bar and holds open under it
//              while refreshing. The scroll offset rests at
//              -barHeight; the handler adds the inset back so
//              the fold math sees 0 at the top like everywhere
//              else. (Padding instead would put the spinner at
//              the frame top, behind the opaque bar.)
//    Android — content padding of barHeight (contentPaddingTop)
//              and progressViewOffset={barHeight} on the
//              RefreshControl, which draws its own circle
//              below the bar.
//
//  Clip the screen area with overflow-hidden so the bar slides
//  behind the brand band, not over it.
//
//    const header = useCollapsibleHeader();
//    <View className="flex-1 overflow-hidden">
//      <Animated.FlatList
//        {...header.listProps}
//        onScroll={header.scrollHandler} scrollEventThrottle={16}
//        contentContainerStyle={{ paddingTop: header.contentPaddingTop, … }}
//        refreshControl={<RefreshControl progressViewOffset={android ? header.barHeight : undefined} … />} … />
//      <Animated.View style={header.barStyle}>
//        <View onLayout={header.onBarLayout}>…the bar that hides…</View>
//      </Animated.View>
//    </View>
//    header.reveal()   — programmatic open (mode switch, scroll-to-top)
//    header.topOffset  — what scrollToOffset needs for "the top"
//                        (-barHeight under the iOS inset, else 0)
//
//  Bar children must keep a stable intrinsic height (see the
//  grow-0 shrink-0 note on the news filter chips) — an elastic
//  child re-measures barHeight mid-motion for nothing.
// -----------------------------------------------------------

import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Platform } from 'react-native';
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';


// Release animation — a soft, critically-damped spring so the
// bar glides to its resting place the way iOS chrome does,
// never a hard snap
const SETTLE = { damping: 24, stiffness: 190, mass: 0.9, overshootClamping: true };

// iOS makes room with a content inset (native refresh control
// integration — see the file header); everything else pads
const USES_INSET = Platform.OS === 'ios';







// -----------------------------------------------------------
// useCollapsibleHeader (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/news.tsx — the news feed header block
// -----------------------------------------------------------

export default function useCollapsibleHeader() {

  // How far the bar is currently hidden, in points, and the
  // most it can hide (the bar's measured height — 0 until the
  // first layout, which disables collapsing rather than
  // guessing a height). `insetTop` is the iOS content inset the
  // handler adds back to contentOffset.y, so the fold math
  // reads 0 at the top on every platform
  const collapsed = useSharedValue(0);
  const maxCollapse = useSharedValue(0);
  const insetTop = useSharedValue(0);
  const lastY = useSharedValue(0);

  // Finger state: folding happens only while dragging, and the
  // last drag direction decides where the release spring heads
  // (+1 down, -1 up, 0 for a still release). `restTarget` is the
  // end the bar is currently headed to, so momentum steering
  // starts each glide once instead of restarting the spring on
  // every scroll frame
  const dragging = useSharedValue(false);
  const lastDir = useSharedValue(0);
  const restTarget = useSharedValue(0);

  // The measured bar height on the React side — the caller pads
  // its list content with this so the overlay covers no rows
  const [barHeight, setBarHeight] = useState(0);


  // The release glide, shared by onEndDrag and onMomentumEnd.
  // Direction wins; a still release settles to the nearer end.
  // Never hide more than the reader has scrolled, so a resting
  // bar always sits seamlessly against the content's top row
  const settle = () => {
    'worklet';
    const max = maxCollapse.value;
    if (max === 0 || collapsed.value <= 0 || collapsed.value >= max) return;

    const closing =
      lastDir.value > 0 ||
      (lastDir.value === 0 && collapsed.value > max / 2);

    const target = closing ? Math.min(max, Math.max(0, lastY.value)) : 0;
    restTarget.value = target;
    if (target !== collapsed.value) {
      collapsed.value = withSpring(target, SETTLE);
    }
  };


  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: () => {
      dragging.value = true;
      lastDir.value = 0;
    },
    onScroll: (event) => {
      // The inset shifts the offset's zero: at the top iOS reports
      // -insetTop, so add it back before any math
      const inset = insetTop.value;
      const rawY = event.contentOffset.y + inset;

      // y is clamped to the actual scrollable range, so rubber-
      // banding at either end contributes no deltas: a short
      // feed can never fold the bar shut, the bottom bounce can
      // never pop it open, and a pull-to-refresh never moves the
      // bar at all — it stays pinned while the content rubber-
      // bands away from it
      const maxY = Math.max(
        0,
        event.contentSize.height - event.layoutMeasurement.height + inset,
      );
      const y = Math.min(Math.max(0, rawY), maxY);
      const dy = y - lastY.value;
      lastY.value = y;

      const max = maxCollapse.value;
      if (max === 0) return;

      // Momentum never FOLDS (a flick's huge deltas would slam
      // the bar shut in a frame) — but it must STEER: a fast
      // flick can release before a single drag event lands, so
      // without this the bar would hang open while the list
      // coasts away. Direction picks the end, the spring plays
      // the same smooth glide, and restTarget keeps it one-shot
      if (!dragging.value) {
        if (dy > 0 && y >= max && restTarget.value !== max) {
          restTarget.value = max;
          collapsed.value = withSpring(max, SETTLE);
        } else if (dy < 0 && restTarget.value !== 0) {
          restTarget.value = 0;
          collapsed.value = withSpring(0, SETTLE);
        }
        return;
      }
      if (dy !== 0) lastDir.value = dy > 0 ? 1 : -1;

      // Fold the delta in, then never hide more than the reader
      // has actually scrolled — that keeps the bar fully open at
      // the top and glued edge-to-edge to the content's first
      // row while both slide up together
      let next = Math.min(max, Math.max(0, collapsed.value + dy));
      if (y < next) next = y;
      restTarget.value = next;
      collapsed.value = next;
    },
    onEndDrag: () => {
      dragging.value = false;
      settle();
    },
    onMomentumEnd: () => {
      // A drag the spring could not finish (caught mid-glide and
      // released into momentum) settles here with the same rules
      settle();
    },
  });


  // The overlay: floats over the list and only ever translates
  // up to hide, so layout never changes mid-scroll
  const barStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    transform: [{ translateY: -collapsed.value }],
  }));


  // Measure once the bar renders; re-measures (chips glide,
  // fonts, orientation) update both the fold limit and the
  // caller's content padding
  const onBarLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const height = Math.round(event.nativeEvent.layout.height);
      if (height > 0 && height !== maxCollapse.value) {
        maxCollapse.value = height;
        if (USES_INSET) insetTop.value = height;
        setBarHeight(height);
      }
    },
    [maxCollapse, insetTop],
  );


  // How the list makes room for the bar (see the file header).
  // Memoised per barHeight: contentOffset is applied whenever
  // its VALUE changes, so a fresh object every render would
  // yank the list back to the top on each re-render
  const listProps = useMemo(
    () =>
      USES_INSET
        ? {
            contentInset: { top: barHeight },
            contentOffset: { x: 0, y: -barHeight },
            automaticallyAdjustContentInsets: false,
            scrollIndicatorInsets: { top: barHeight },
          }
        : {},
    [barHeight],
  );
  const contentPaddingTop = USES_INSET ? 0 : barHeight;

  // "The top" in scrollToOffset terms — under the inset model
  // the resting offset is -barHeight, not 0
  const topOffset = USES_INSET ? -barHeight : 0;


  const reveal = useCallback(() => {
    restTarget.value = 0;
    collapsed.value = withSpring(0, SETTLE);
    lastY.value = 0;
    lastDir.value = 0;
  }, [collapsed, restTarget, lastY, lastDir]);


  return {
    scrollHandler,
    barStyle,
    onBarLayout,
    reveal,
    barHeight,
    listProps,
    contentPaddingTop,
    topOffset,
  };
}
