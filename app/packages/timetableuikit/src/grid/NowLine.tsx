// -----------------------------------------------------------
//  [*] timetableuikit — NowLine
//
//  The current minute across a day column: a dot and a
//  hairline. GATED — it renders only while "now" falls inside
//  the visible window, so an evening glance at the grid never
//  shows a line floating past the last hour.
//
//  Used by:
//    - grid/DayColumn.tsx — today's column only
// -----------------------------------------------------------

import { View } from 'react-native';

import type { TimeWindow } from '../core/types';
import { useTimetableEnv } from '../provider';


export default function NowLine({
  window,
  nowMin,
  height,
}: {
  window: TimeWindow;
  nowMin: number;
  // The column's full pixel height
  height: number;
}) {

  const { theme, labels } = useTimetableEnv();

  if (nowMin < window.startMin || nowMin > window.endMin) return null;

  const span = Math.max(1, window.endMin - window.startMin);
  const top = ((nowMin - window.startMin) / span) * height;

  return (
    <View
      testID="timetableuikit-nowline"
      accessibilityLabel={labels.nowLine}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: top - 1, flexDirection: 'row', alignItems: 'center', zIndex: 3 }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.nowLine, marginLeft: -3 }} />
      <View style={{ flex: 1, height: 2, backgroundColor: theme.colors.nowLine }} />
    </View>
  );
}
