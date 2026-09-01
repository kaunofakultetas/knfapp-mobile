// -----------------------------------------------------------
//  [*] TimetableView — engine pipeline + the kit's two views
//
//  The one place the timetable engine meets the timetable kit:
//  entries in, a rendered day timeline or week grid out. The
//  screen keeps fetching, filtering and perspective state; this
//  component runs the pure pipeline — deriveWindow, buildWeek,
//  placeDay, conflictIds + annotateConflicts — memoized so a
//  screen re-render without new entries repacks nothing.
//
//  The week grid gets no onChangeWeek on purpose: the faculty
//  timetable is one recurring week, so there is no other week
//  to page to. Day swipes DO page — they report ±1 and the
//  screen moves its own day cursor, exactly like the tab bar.
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — 'day' and 'week' modes
// -----------------------------------------------------------

import { useMemo } from 'react';

import {
  annotateConflicts,
  buildWeek,
  conflictIds,
  deriveWindow,
  placeDay,
  visibleDays,
  type ConflictOptions,
  type KnfLesson,
  type TimetableEntry,
} from '@knf/timetableengine';
import { DayTimeline, WeekGrid, type TimetableLesson } from '@knf/timetableuikit';


export default function TimetableView({
  entries,
  skipped,
  scope,
  mode,
  day,
  onChangeDay,
  onPressLesson,
}: {
  // Already normalized and perspective-filtered by the screen
  entries: TimetableEntry<KnfLesson>[];
  // The normalizer's dropped-row count — surfaces as a notice
  skipped: number;
  scope: ConflictOptions;
  mode: 'day' | 'week';
  // 0 = Monday .. 6 — which day the timeline shows
  day: number;
  onChangeDay: (direction: 1 | -1) => void;
  onPressLesson: (lesson: TimetableLesson) => void;
}) {

  const window = useMemo(() => deriveWindow(entries), [entries]);

  const ids = useMemo(() => conflictIds(entries, scope), [entries, scope]);

  // Seven placed buckets, each carrying its conflict washes
  const days = useMemo(
    () => buildWeek(entries).map((bucket) => annotateConflicts(placeDay(bucket, window), ids)),
    [entries, window, ids],
  );

  // Mon–Fri until a weekend lesson exists, then the full week
  const weekDays = useMemo(() => visibleDays(entries), [entries]);


  if (mode === 'week') {
    return (
      <WeekGrid
        days={days}
        window={window}
        visibleDays={weekDays}
        skippedCount={skipped}
        onPressLesson={onPressLesson}
      />
    );
  }

  return (
    <DayTimeline
      placed={days[day] ?? []}
      window={window}
      day={day}
      skippedCount={skipped}
      onChangeDay={onChangeDay}
      onPressLesson={onPressLesson}
    />
  );
}
