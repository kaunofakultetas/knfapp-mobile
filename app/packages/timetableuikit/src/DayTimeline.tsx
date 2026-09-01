// -----------------------------------------------------------
//  [*] timetableuikit — DayTimeline
//
//  One day, full width, taller hours — the phone-first view.
//  FULLY CONTROLLED like the grid: a swipe reports +1/-1 and
//  the host moves its own day cursor. Once the layout width
//  lands (and again whenever the day changes, or when a day's
//  lessons first arrive), the list auto-scrolls so the first
//  lesson sits just under the header — mornings are not an
//  empty scroll past 8:00. One scroll per day view: ordinary
//  host re-renders that rebuild the placed array never yank
//  the reader's scroll position back.
//
//  Used by:
//    - the host's timetable screen (day mode)
// -----------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import type { LessonFrame, PlacedLesson, TimeWindow, TimetableLesson } from './core/types';
import DayColumn from './grid/DayColumn';
import HourAxis, { AXIS_WIDTH } from './grid/HourAxis';
import { useNow, type NowPoint } from './hooks/useNow';
import { usePagePan } from './hooks/usePagePan';
import { useTimetableEnv } from './provider';

const DEFAULT_HOUR_HEIGHT = 64;


// Where the day should open: just above the first real lesson,
// or nowhere when the day is empty. Exported for the tests.
export function firstLessonOffset(placed: readonly PlacedLesson[], gridHeight: number): number | null {
  const lessons = placed.filter((p) => !p.entry.isBlock);
  if (lessons.length === 0) return null;
  const firstTop = Math.min(...lessons.map((p) => p.layout.topFrac)) * gridHeight;
  return Math.max(0, firstTop - 12);
}


export interface DayTimelineProps {
  // This one day's pre-placed lessons
  placed: readonly PlacedLesson[];
  window: TimeWindow;
  // 0 = Monday .. 6 — names the header and the now gating
  day: number;
  // Caption under the day name, e.g. a date
  dateLabel?: string;
  now?: NowPoint | null;
  // +1 = swipe to the NEXT day, -1 = the previous
  onChangeDay?: (direction: 1 | -1) => void;
  onPressLesson?: (lesson: TimetableLesson) => void;
  renderLesson?: (placed: PlacedLesson, frame: LessonFrame) => ReactNode;
  hourHeight?: number;
  skippedCount?: number;
}


export default function DayTimeline({
  placed,
  window,
  day,
  dateLabel,
  now,
  onChangeDay,
  onPressLesson,
  renderLesson,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  skippedCount = 0,
}: DayTimelineProps) {

  const { theme, labels } = useTimetableEnv();
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // A host-supplied now (or null) silences the internal clock
  // entirely — no interval, no half-minute re-render
  const clock = useNow({ enabled: now === undefined });
  const effectiveNow = now === undefined ? clock : now;

  const pan = usePagePan((direction) => onChangeDay?.(direction), { enabled: !!onChangeDay });

  const gridHeight = ((window.endMin - window.startMin) / 60) * hourHeight;
  const today = effectiveNow?.day === day;


  // The first real lesson decides where the day opens. Guarded
  // three ways: never before onLayout delivers a width (the
  // grid is not even mounted, scrollTo would clamp to 0 and
  // the effect would not re-run), at most ONCE per shown day
  // (a rebuilt-but-equal placed array must not teleport the
  // reader), and not at all while the day has no lessons — so
  // data arriving late still positions the view when it lands
  // =========================================================
  const scrolledDayRef = useRef<number | null>(null);
  useEffect(() => {
    if (containerWidth <= 0) return;
    if (scrolledDayRef.current === day) return;
    const offset = firstLessonOffset(placed, gridHeight);
    if (offset === null) return;
    scrollRef.current?.scrollTo({ y: offset, animated: false });
    scrolledDayRef.current = day;
  }, [day, placed, gridHeight, containerWidth]);

  const onLayout = (event: LayoutChangeEvent) => setContainerWidth(Math.round(event.nativeEvent.layout.width));

  return (
    <View testID="timetableuikit-timeline" style={{ flex: 1 }} onLayout={onLayout} {...pan}>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingLeft: AXIS_WIDTH, paddingBottom: 4, gap: 8 }}>
        <Text testID="timetableuikit-timeline-day" style={[theme.text.day, { color: theme.colors.ink }]}>
          {labels.dayLong[day]}
        </Text>
        {today ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: theme.colors.brand }}>
            <Text style={[theme.text.meta, { color: theme.colors.onBrand }]}>{labels.today}</Text>
          </View>
        ) : null}
        {dateLabel ? <Text style={[theme.text.meta, { color: theme.colors.inkSoft }]}>{dateLabel}</Text> : null}
      </View>

      {skippedCount > 0 ? (
        <Text
          testID="timetableuikit-skipped"
          style={[theme.text.meta, { color: theme.colors.inkFaint, paddingLeft: AXIS_WIDTH, paddingBottom: 4 }]}
        >
          {labels.lessonsSkipped(skippedCount)}
        </Text>
      ) : null}


      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        {containerWidth > 0 ? (
          <View style={{ flexDirection: 'row' }}>
            <HourAxis window={window} height={gridHeight} />
            <DayColumn
              day={day}
              placed={placed}
              window={window}
              width={containerWidth - AXIS_WIDTH}
              height={gridHeight}
              nowMin={today && effectiveNow ? effectiveNow.minutes : null}
              onPressLesson={onPressLesson}
              renderLesson={renderLesson}
            />
          </View>
        ) : null}

        {placed.length === 0 ? (
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
