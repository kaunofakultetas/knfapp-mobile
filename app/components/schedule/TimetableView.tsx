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
//  Both modes SCROLL between their pages when the screen
//  hands over the neighbour weeks' entries: the kit's
//  SnapPager renders previous/current/next side by side —
//  whole weeks in the grid, single days in the timeline, a
//  day page before Monday or past Sunday drawing from the
//  neighbouring week's bucket — and a settled swipe moves the
//  screen's cursor while the pager recenters. The time axis
//  and the visible-day set derive from ALL three weeks, so
//  pages never jump vertically or change column count
//  mid-swipe. Without neighbours (the teacher pattern) the
//  static single views render, day swipes paging through the
//  timeline's own pan exactly as before.
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
import { DayTimeline, SnapPager, WeekGrid, type TimetableLesson } from '@knf/timetableuikit';







// -----------------------------------------------------------
// TimetableView (default export)
// -----------------------------------------------------------
//
// The memo stages — the union-derived window, per-week placed
// buckets with their conflict washes, visibleDays — are all
// keyed to the entries, so a screen re-render without new
// data repacks nothing; the mode fork only picks which kit
// view gets them. Each week's conflicts are computed within
// that week alone: a clash never bleeds across pages.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — 'day' and 'week' modes
// -----------------------------------------------------------

export default function TimetableView({
  entries,
  skipped,
  scope,
  mode,
  day,
  currentWeek = true,
  weeks,
  onChangeDay,
  onChangeWeek,
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
  // False while the dated window shows some OTHER week: the
  // kit's now line and today chip are silenced (now={null}) —
  // "now" has no business on next week's Thursday
  currentWeek?: boolean;
  // The neighbour weeks' entries — their presence turns both
  // modes into the scrolling pager (week pages, day pages)
  weeks?: { prev: TimetableEntry<KnfLesson>[]; next: TimetableEntry<KnfLesson>[] };
  onChangeDay: (direction: 1 | -1) => void;
  // A settled week swipe pages the dated window ±1 week —
  // absent, week mode neither pans nor pages
  onChangeWeek?: (direction: 1 | -1) => void;
  onPressLesson: (lesson: TimetableLesson) => void;
}) {

  // One axis for every page — a window derived per week would
  // make the hour scale jump between pages mid-swipe
  const allEntries = useMemo(
    () => (weeks ? [...weeks.prev, ...entries, ...weeks.next] : entries),
    [weeks, entries],
  );
  const window = useMemo(() => deriveWindow(allEntries), [allEntries]);
  const weekDays = useMemo(() => visibleDays(allEntries), [allEntries]);


  // Seven placed buckets per week, each week's conflict wash
  // computed within itself
  const place = useMemo(
    () => (set: TimetableEntry<KnfLesson>[]) => {
      const ids = conflictIds(set, scope);
      return buildWeek(set).map((bucket) => annotateConflicts(placeDay(bucket, window), ids));
    },
    [scope, window],
  );
  const days = useMemo(() => place(entries), [place, entries]);
  const neighbourDays = useMemo(
    () => (weeks ? { prev: place(weeks.prev), next: place(weeks.next) } : null),
    [place, weeks],
  );


  // undefined lets the kit tick its own clock; null silences
  // the now line and today chip on a foreign week
  const now = currentWeek ? undefined : null;


  if (mode === 'week') {
    const grid = (pageDays: typeof days, pageNow: typeof now) => (
      <WeekGrid
        days={pageDays}
        window={window}
        visibleDays={weekDays}
        skippedCount={skipped}
        now={pageNow}
        onPressLesson={onPressLesson}
      />
    );

    if (neighbourDays && onChangeWeek) {
      return (
        <SnapPager
          onSettle={onChangeWeek}
          // Side pages are never "now" — whatever week they
          // hold, it is not the one on screen when they settle
          renderPage={(offset) =>
            grid(
              offset === 0 ? days : offset < 0 ? neighbourDays.prev : neighbourDays.next,
              offset === 0 ? now : null,
            )
          }
        />
      );
    }
    return grid(days, now);
  }


  if (neighbourDays) {
    return (
      <SnapPager
        onSettle={onChangeDay}
        // A page before Monday or past Sunday draws from the
        // neighbouring week's bucket; a side page keeps the
        // clock only while it stays inside the shown week —
        // a page in a foreign week is never "now"
        renderPage={(offset) => {
          const rawDay = day + offset;
          const pageDays = rawDay < 0 ? neighbourDays.prev : rawDay > 6 ? neighbourDays.next : days;
          const pageDay = ((rawDay % 7) + 7) % 7;
          return (
            <DayTimeline
              placed={pageDays[pageDay] ?? []}
              window={window}
              day={pageDay}
              skippedCount={skipped}
              now={rawDay >= 0 && rawDay <= 6 ? now : null}
              onPressLesson={onPressLesson}
            />
          );
        }}
      />
    );
  }

  return (
    <DayTimeline
      placed={days[day] ?? []}
      window={window}
      day={day}
      skippedCount={skipped}
      now={now}
      onChangeDay={onChangeDay}
      onPressLesson={onPressLesson}
    />
  );
}
