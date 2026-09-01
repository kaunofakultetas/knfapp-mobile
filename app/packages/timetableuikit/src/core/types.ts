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

// What a cell renders. Day 0 = Monday .. 6 = Sunday
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

// The fraction geometry the engine computed — of the day
// column horizontally, of the visible window vertically
export interface LessonGeometry {
  topFrac: number;
  heightFrac: number;
  leftFrac: number;
  widthFrac: number;
  isShort: boolean;
  isConflict: boolean;
}

// The engine's PlacedEntry, structurally
export interface PlacedLesson {
  entry: TimetableLesson;
  layout: LessonGeometry;
}

// The visible vertical span, wall-clock minutes
export interface TimeWindow {
  startMin: number;
  endMin: number;
}

// The pixel frame a cell actually occupies
export interface LessonFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}
