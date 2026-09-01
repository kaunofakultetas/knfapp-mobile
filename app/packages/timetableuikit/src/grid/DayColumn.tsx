// -----------------------------------------------------------
//  [*] timetableuikit — DayColumn
//
//  One day's pixels: hour hairlines behind, background blocks
//  next, lessons on top, the now line above everything when
//  this column is today. All geometry is the engine's
//  fractions multiplied by this column's width and height —
//  the column never re-derives anything.
//
//  Used by:
//    - WeekGrid.tsx — one per visible day
//    - DayTimeline.tsx — the single column
// -----------------------------------------------------------

import { type ReactNode } from 'react';

import { View } from 'react-native';

import type { LessonFrame, PlacedLesson, TimeWindow, TimetableLesson } from '../core/types';
import { useTimetableTheme } from '../provider';
import LessonCell from './LessonCell';
import NowLine from './NowLine';

// Air between neighbouring cells, horizontal and vertical
const CELL_GAP = 2;


export default function DayColumn({
  day,
  placed,
  window,
  width,
  height,
  nowMin = null,
  onPressLesson,
  renderLesson,
}: {
  day: number;
  placed: readonly PlacedLesson[];
  window: TimeWindow;
  width: number;
  height: number;
  // Non-null ONLY for today's column
  nowMin?: number | null;
  onPressLesson?: (lesson: TimetableLesson) => void;
  // Swaps the whole cell; the kit still computes the frame
  renderLesson?: (placed: PlacedLesson, frame: LessonFrame) => ReactNode;
}) {

  const theme = useTimetableTheme();

  const hours: number[] = [];
  for (let h = Math.ceil(window.startMin / 60); h * 60 <= window.endMin; h++) hours.push(h);
  const span = Math.max(1, window.endMin - window.startMin);

  const frameOf = (p: PlacedLesson): LessonFrame => ({
    top: Math.round(p.layout.topFrac * height),
    left: Math.round(p.layout.leftFrac * width),
    width: p.entry.isBlock
      ? width
      : Math.max(0, Math.round(p.layout.widthFrac * width) - CELL_GAP),
    height: Math.max(0, Math.round(p.layout.heightFrac * height) - (p.entry.isBlock ? 0 : CELL_GAP)),
  });

  const blocks = placed.filter((p) => p.entry.isBlock);
  const lessons = placed.filter((p) => !p.entry.isBlock);

  const cell = (p: PlacedLesson) => {
    const frame = frameOf(p);
    // A custom cell gets the SAME absolute placement the
    // default cell gives itself — the renderer fills the
    // frame, it never has to re-apply the geometry
    if (renderLesson) {
      return (
        <View
          key={p.entry.id}
          style={{ position: 'absolute', top: frame.top, left: frame.left, width: frame.width, height: frame.height }}
        >
          {renderLesson(p, frame)}
        </View>
      );
    }
    return <LessonCell key={p.entry.id} placed={p} frame={frame} onPress={onPressLesson} />;
  };

  return (
    <View testID={`timetableuikit-day-${day}`} style={{ width, height }}>

      {hours.map((h) => (
        <View
          key={h}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: ((h * 60 - window.startMin) / span) * height,
            height: 1,
            backgroundColor: theme.colors.line,
          }}
        />
      ))}

      {blocks.map(cell)}
      {lessons.map(cell)}

      {nowMin !== null ? <NowLine window={window} nowMin={nowMin} height={height} /> : null}

    </View>
  );
}
