// -----------------------------------------------------------
//  [*] timetableuikit — HourAxis
//
//  The hour labels down the left edge. Integer hours only,
//  positioned by the SAME fraction math the cells use — never
//  by iterating dates — so a label and a lesson starting on
//  the hour always agree to the pixel.
//
//  Used by:
//    - WeekGrid.tsx / DayTimeline.tsx — the left gutter
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import type { TimeWindow } from '../core/types';
import { useTimetableEnv } from '../provider';







// -----------------------------------------------------------
// AXIS_WIDTH
// -----------------------------------------------------------
//
// The gutter's default pixel width — one number the whole
// grid agrees on.
//
// Used by:
//   - HourAxis (below) — the default width
//   - WeekGrid.tsx / DayTimeline.tsx — header padding and the
//     column-width math
// -----------------------------------------------------------

export const AXIS_WIDTH = 44;







// -----------------------------------------------------------
// HourAxis (default export)
// -----------------------------------------------------------
//
// Labels sit 7px above their exact hour line and run
// through the env's formatTime, so a custom formatter
// restyles the axis and the cells together.
//
// Used by:
//   - WeekGrid.tsx / DayTimeline.tsx — the left gutter
// -----------------------------------------------------------

export default function HourAxis({
  window,
  height,
  width = AXIS_WIDTH,
}: {
  window: TimeWindow;
  // The grid's full pixel height
  height: number;
  width?: number;
}) {

  const { theme, formatTime } = useTimetableEnv();
  const span = Math.max(1, window.endMin - window.startMin);

  const hours: number[] = [];
  for (let h = Math.ceil(window.startMin / 60); h * 60 <= window.endMin; h++) hours.push(h);

  return (
    <View style={{ width, height }} pointerEvents="none">
      {hours.map((h) => (
        <Text
          key={h}
          testID={`timetableuikit-axis-${h}`}
          style={[
            theme.text.axis,
            {
              position: 'absolute',
              top: ((h * 60 - window.startMin) / span) * height - 7,
              right: 8,
              color: theme.colors.inkFaint,
            },
          ]}
        >
          {formatTime(h * 60)}
        </Text>
      ))}
    </View>
  );
}
