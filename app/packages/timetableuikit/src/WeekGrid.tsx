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

const WEEKDAYS = [0, 1, 2, 3, 4];
const DEFAULT_HOUR_HEIGHT = 56;


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
}


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

  return (
    <View testID="timetableuikit-week" style={{ flex: 1 }} onLayout={onLayout} {...pan}>

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


      <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        {dayWidth > 0 ? (
          <View style={{ flexDirection: 'row' }}>
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
      </ScrollView>

    </View>
  );
}
