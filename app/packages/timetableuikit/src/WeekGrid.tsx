// -----------------------------------------------------------
//  [*] timetableuikit — WeekGrid
//
//  The whole week at a glance: a Monday-first header, the hour
//  axis, one DayColumn per visible day, and a horizontal swipe
//  that turns the week. FULLY CONTROLLED — the grid owns no
//  week state; a swipe only reports a direction and the host
//  hands back new buckets, so deep-linking, persistence and
//  the host's own pager all stay possible.
//
//  Day columns take an INTEGER pixel width measured through
//  onLayout — fraction geometry over a fractional column width
//  yields shimmering 1px seams between days; integers do not.
//  DOTTED hairlines stand between the columns, painted before
//  them so cells cover the dots: without a visible boundary a
//  sparse week reads as one confusing day, and dotted-vs-solid
//  keeps day edges apart from the hour lines at a glance. The
//  1px-wide full-border trick is deliberate — a single-side
//  dashed border silently paints nothing on Android.
//
//  Used by:
//    - the host's timetable screen
// -----------------------------------------------------------

import { useState, type ReactNode } from 'react';

import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import type { LessonFrame, PlacedLesson, TimeWindow, TimetableLesson } from './core/types';
import DayColumn from './grid/DayColumn';
import HourAxis, { AXIS_WIDTH } from './grid/HourAxis';
import { useNow, type NowPoint } from './hooks/useNow';
import { usePagePan } from './hooks/usePagePan';
import { useTimetableEnv } from './provider';

// Monday–Friday — the column set when the host passes none
const WEEKDAYS = [0, 1, 2, 3, 4];







// -----------------------------------------------------------
// DEFAULT_HOUR_HEIGHT
// -----------------------------------------------------------
//
// Pixels per hour — tighter than the day view, five columns
// must share the width. Exported so a host embedding
// headerless grids in one shared scroll can size the pager
// to the exact body height the grid will draw.
//
// Used by:
//   - WeekGrid (below) — the hourHeight default
//   - components/schedule/TimetableView.tsx — the shared-
//     scroll pager's height
// -----------------------------------------------------------

export const DEFAULT_HOUR_HEIGHT = 56;







// -----------------------------------------------------------
// WeekGridProps
// -----------------------------------------------------------
//
// Seven pre-placed day buckets and one shared window — the
// grid computes no geometry, it only multiplies fractions by
// pixels.
//
// Used by:
//   - WeekGrid (below)
//   - components/schedule/TimetableView.tsx — week mode's props
// -----------------------------------------------------------

export interface WeekGridProps {
  // Seven pre-placed day buckets, Monday first
  days: readonly (readonly PlacedLesson[])[];
  window: TimeWindow;
  // Which day indexes get a column (default Mon–Fri)
  visibleDays?: readonly number[];
  // The kit ticks its own clock when undefined; null silences
  // the now line and the today chip (a week that is not this one)
  now?: NowPoint | null;
  // +1 = swipe to the NEXT week, -1 = the previous
  onChangeWeek?: (direction: 1 | -1) => void;
  onPressLesson?: (lesson: TimetableLesson) => void;
  renderLesson?: (placed: PlacedLesson, frame: LessonFrame) => ReactNode;
  hourHeight?: number;
  // The header caption, e.g. labels.weekNumber(week)
  weekLabel?: string;
  // The normalizer's dropped-row count — shown as a notice
  skippedCount?: number;
  // False renders a headerless BODY for a host that pins one
  // WeekDaysHeader over several pager pages
  showHeader?: boolean;
  // False drops the grid's own vertical ScrollView (and its
  // edge padding) — the host's shared scroll supplies both,
  // so every pager page rides one offset and a settled swipe
  // never snaps the view
  scrollEnabled?: boolean;
}







// -----------------------------------------------------------
// WeekDaysHeader
// -----------------------------------------------------------
//
// The Monday-first day-name row (today wearing the brand
// chip) with the optional week label and skipped notice above
// it — extracted so a host sharing ONE vertical scroll across
// pager pages can pin a single header outside that scroll
// while the pages render headerless bodies. Self-measuring
// like the grid, so its chips land on the same dayWidth.
//
// Used by:
//   - WeekGrid (below) — its own header
//   - components/schedule/TimetableView.tsx — pinned over the
//     shared-scroll week pager
// -----------------------------------------------------------

export function WeekDaysHeader({
  visibleDays = WEEKDAYS,
  now,
  weekLabel,
  skippedCount = 0,
  width,
}: {
  visibleDays?: readonly number[];
  // Resolved by the caller (or the kit clock when undefined);
  // null = no today chip, a foreign week
  now?: NowPoint | null;
  weekLabel?: string;
  skippedCount?: number;
  // The grid passes its own measured width so header and
  // columns agree on dayWidth from one measurement; standalone
  // the header measures itself
  width?: number;
}) {

  const { theme, labels } = useTimetableEnv();
  const [measured, setMeasured] = useState(0);
  const containerWidth = width ?? measured;

  const clock = useNow({ enabled: now === undefined });
  const effectiveNow = now === undefined ? clock : now;

  const dayWidth = containerWidth > 0 ? Math.floor((containerWidth - AXIS_WIDTH) / visibleDays.length) : 0;
  const onLayout = (event: LayoutChangeEvent) => setMeasured(Math.round(event.nativeEvent.layout.width));


  return (
    <View onLayout={width === undefined ? onLayout : undefined}>

      {weekLabel ? (
        <Text style={[theme.text.meta, { color: theme.colors.inkSoft, paddingLeft: AXIS_WIDTH, paddingBottom: 2 }]}>
          {weekLabel}
        </Text>
      ) : null}

      {skippedCount > 0 ? (
        <Text
          testID="timetableuikit-skipped"
          style={[theme.text.meta, { color: theme.colors.inkFaint, paddingLeft: AXIS_WIDTH, paddingBottom: 4 }]}
        >
          {labels.lessonsSkipped(skippedCount)}
        </Text>
      ) : null}

      {/* The Monday-first header — today wears the brand chip */}
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <View style={{ width: AXIS_WIDTH }} />
        {dayWidth > 0
          ? visibleDays.map((day) => {
              const today = effectiveNow?.day === day;
              return (
                <View key={day} style={{ width: dayWidth, alignItems: 'center' }}>
                  <View
                    testID={`timetableuikit-dayname-${day}`}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 10,
                      backgroundColor: today ? theme.colors.brand : 'transparent',
                    }}
                  >
                    <Text style={[theme.text.day, { color: today ? theme.colors.onBrand : theme.colors.inkSoft }]}>
                      {labels.dayShort[day]}
                    </Text>
                  </View>
                </View>
              );
            })
          : null}
      </View>

    </View>
  );
}







// -----------------------------------------------------------
// WeekGrid (default export)
// -----------------------------------------------------------
//
// Day-name chips over one DayColumn per visible day, each
// dayWidth wide (floored, see the header); the empty notice
// shows only when EVERY visible day's bucket is empty.
//
// Used by:
//   - components/schedule/TimetableView.tsx — week mode
// -----------------------------------------------------------

export default function WeekGrid({
  days,
  window,
  visibleDays = WEEKDAYS,
  now,
  onChangeWeek,
  onPressLesson,
  renderLesson,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  weekLabel,
  skippedCount = 0,
  showHeader = true,
  scrollEnabled = true,
}: WeekGridProps) {

  const { theme, labels } = useTimetableEnv();
  const [containerWidth, setContainerWidth] = useState(0);

  // A host-supplied now (or null) silences the internal clock
  // entirely — no interval, no half-minute re-render
  const clock = useNow({ enabled: now === undefined });
  const effectiveNow = now === undefined ? clock : now;

  const pan = usePagePan((direction) => onChangeWeek?.(direction), { enabled: !!onChangeWeek });

  const gridHeight = ((window.endMin - window.startMin) / 60) * hourHeight;
  const dayWidth = containerWidth > 0 ? Math.floor((containerWidth - AXIS_WIDTH) / visibleDays.length) : 0;
  const empty = visibleDays.every((day) => (days[day] ?? []).length === 0);

  const onLayout = (event: LayoutChangeEvent) => setContainerWidth(Math.round(event.nativeEvent.layout.width));

  // The body container: the grid's own vertical scroll, or a
  // plain block when the host scrolls several pages as one
  const Body = scrollEnabled ? ScrollView : View;
  const bodyProps = scrollEnabled
    ? { contentContainerStyle: { paddingTop: 12, paddingBottom: 12 }, showsVerticalScrollIndicator: false }
    : {};

  return (
    <View testID="timetableuikit-week" style={scrollEnabled ? { flex: 1 } : null} onLayout={onLayout} {...pan}>

      {showHeader ? (
        <WeekDaysHeader
          visibleDays={visibleDays}
          now={effectiveNow}
          weekLabel={weekLabel}
          skippedCount={skippedCount}
          width={containerWidth}
        />
      ) : null}


      <Body
        // Top padding gives the first hour label (drawn centered
        // on its line) room to render whole instead of being
        // halved by the container edge; bottom likewise — both
        // the host's job in the shared-scroll (embedded) mode
        {...bodyProps}
      >
        {dayWidth > 0 ? (
          <View style={{ flexDirection: 'row' }}>

            {/* Behind the columns: a dotted seam at every
                interior day boundary */}
            {visibleDays.slice(1).map((day, index) => (
              <View
                key={`boundary-${day}`}
                testID={`timetableuikit-dayline-${day}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: AXIS_WIDTH + (index + 1) * dayWidth,
                  top: 0,
                  height: gridHeight,
                  width: 1,
                  borderWidth: 1,
                  borderColor: theme.colors.line,
                  borderStyle: 'dotted',
                  borderRadius: 1,
                }}
              />
            ))}

            <HourAxis window={window} height={gridHeight} />
            {visibleDays.map((day) => (
              <DayColumn
                key={day}
                day={day}
                placed={days[day] ?? []}
                window={window}
                width={dayWidth}
                height={gridHeight}
                nowMin={effectiveNow?.day === day ? effectiveNow.minutes : null}
                onPressLesson={onPressLesson}
                renderLesson={renderLesson}
              />
            ))}
          </View>
        ) : null}

        {empty ? (
          <Text
            testID="timetableuikit-empty"
            style={[theme.text.day, { color: theme.colors.inkFaint, textAlign: 'center', marginTop: 32 }]}
          >
            {labels.noLessons}
          </Text>
        ) : null}
      </Body>

    </View>
  );
}
