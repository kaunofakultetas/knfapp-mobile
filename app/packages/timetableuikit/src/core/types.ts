// -----------------------------------------------------------
//  [*] timetableuikit — types
//
//  STRUCTURAL MIRRORS of the engine's shapes — the kit never
//  imports the engine, so either side upgrades alone; a host
//  passes engine results straight in and TypeScript checks the
//  shapes match. The kit reads geometry, it never computes it:
//  placement arrives as fractions and the kit only multiplies
//  them by pixels.
//
//  Used by:
//    - every component and the host's props
// -----------------------------------------------------------







// -----------------------------------------------------------
// TimetableLesson
// -----------------------------------------------------------
//
// What a cell renders. Day 0 = Monday .. 6 = Sunday.
//
// Used by:
//   - PlacedLesson (below) — the entry side
//   - WeekGrid / DayTimeline / DayColumn / LessonCell — props
//   - components/schedule/LessonSheet.tsx,
//     app/(main)/tabs/schedule.tsx — the tapped lesson
// -----------------------------------------------------------

export interface TimetableLesson {
  id: string;
  title: string;
  day: number;
  startMin: number;
  endMin: number;
  people?: string[];
  location?: string[];
  groupKey?: string;
  // A merged teacher-view card lists every group it serves
  groupKeys?: string[];
  termKey?: string;
  kind?: string;
  // Drawn behind the lessons, full width, muted
  isBlock?: boolean;
}







// -----------------------------------------------------------
// LessonGeometry
// -----------------------------------------------------------
//
// The fraction geometry the engine computed — of the day
// column horizontally, of the visible window vertically.
//
// Used by:
//   - PlacedLesson (below) — the layout side
// -----------------------------------------------------------

export interface LessonGeometry {
  topFrac: number;
  heightFrac: number;
  leftFrac: number;
  widthFrac: number;
  isShort: boolean;
  isConflict: boolean;
}







// -----------------------------------------------------------
// PlacedLesson
// -----------------------------------------------------------
//
// The engine's PlacedEntry, structurally.
//
// Used by:
//   - WeekGrid / DayTimeline / DayColumn / LessonCell — the
//     rows every view consumes
// -----------------------------------------------------------

export interface PlacedLesson {
  entry: TimetableLesson;
  layout: LessonGeometry;
}







// -----------------------------------------------------------
// TimeWindow
// -----------------------------------------------------------
//
// The visible vertical span, wall-clock minutes.
//
// Used by:
//   - WeekGrid / DayTimeline / DayColumn / HourAxis / NowLine
// -----------------------------------------------------------

export interface TimeWindow {
  startMin: number;
  endMin: number;
}







// -----------------------------------------------------------
// LessonFrame
// -----------------------------------------------------------
//
// The pixel frame a cell actually occupies.
//
// Used by:
//   - grid/DayColumn.tsx — computes it; LessonCell and the
//     hosts' renderLesson overrides receive it
// -----------------------------------------------------------

export interface LessonFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}
