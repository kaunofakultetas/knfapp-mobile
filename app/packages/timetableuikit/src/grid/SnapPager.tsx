// -----------------------------------------------------------
//  [*] timetableuikit — SnapPager
//
//  The horizontal carousel that makes cursor paging SCROLL
//  instead of snap — weeks in the week grid, days in the day
//  timeline, any one-step cursor: three full-width pages
//  (previous, current, next) in a paging ScrollView that
//  always rests on the middle one. A completed swipe settles
//  on a side page, the host is told the direction, moves its
//  cursor — the middle page now holds the settled content —
//  and the pager snaps back to center without animation,
//  invisibly, in the same frame. The host owns ALL data
//  movement; this component owns the gesture and recentring.
//
//  Self-measuring: pages take the container's laid-out width,
//  and nothing renders until that width is known — a pager
//  guessing at widths would land between pages.
//
//  Used by:
//    - components/schedule/TimetableView.tsx — around the
//      dated week grid and the dated day timeline
// -----------------------------------------------------------

import { useRef, useState, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';


// The three page slots, left to right
const OFFSETS = [-1, 0, 1] as const;







// -----------------------------------------------------------
// SnapPager (default export)
// -----------------------------------------------------------
//
// Controlled and stateless about content: renderPage(offset)
// draws a page relative to the host's cursor, onSettle
// reports a completed swipe as ±1. The host must move its
// cursor synchronously in onSettle — the snap-back to center
// lands on the next frame and expects the middle page to
// already hold the settled content.
//
// Used by:
//   - components/schedule/TimetableView.tsx — week AND day
//     modes
// -----------------------------------------------------------

export default function SnapPager({
  renderPage,
  onSettle,
  style,
}: {
  renderPage: (offset: -1 | 0 | 1) => ReactNode;
  onSettle: (direction: 1 | -1) => void;
  // Overrides the flex-1 frame — a pager living INSIDE a
  // shared scroll passes its content height instead, since
  // flex has nothing to fill there
  style?: StyleProp<ViewStyle>;
}) {

  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);


  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  // Rest on the middle page — on first layout and after every
  // settle. Never animated: the visible content is already the
  // right week, only the scroll position catches up
  const recenter = () => {
    scrollRef.current?.scrollTo({ x: width, animated: false });
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (page === 1) return;
    onSettle(page > 1 ? 1 : -1);
    recenter();
  };


  return (
    <View style={style ?? { flex: 1 }} onLayout={onLayout} testID="timetableuikit-snappager-frame">
      {width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Android ignores the contentOffset prop — the layout
          // callback recenter covers both platforms
          contentOffset={{ x: width, y: 0 }}
          onLayout={recenter}
          onMomentumScrollEnd={onMomentumEnd}
          testID="timetableuikit-snappager"
        >
          {OFFSETS.map((offset) => (
            <View key={offset} style={{ width }}>
              {renderPage(offset)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
