// -----------------------------------------------------------
//  [*] timetableengine — types
//
//  The domain in integers: a lesson is a WEEKLY SLOT — a day
//  index and wall-clock minutes — never a Date pair. Every
//  timezone/DST/midnight bug class in production calendar
//  clients comes from doing time math on dates; a university
//  timetable is structural, and concrete dates are a derived
//  edge concern (materializeWeek). The generic parameter lets
//  a host's own fields ride through every derivation
//  untouched and come back out typed on the far side.
//
//  Used by:
//    - every core module and the KNF adapter
//    - hosts typing their entries and layout results
// -----------------------------------------------------------

// Day 0 = Monday .. 6 = Sunday — Lithuanian convention, and the
// same indexing the backend stores
export interface TimetableEntryBase {
  // Stable — React keys downstream ride on it
  id: string;
  title: string;
  day: number;
  // Wall-clock minutes since 00:00; end is EXCLUSIVE and must
  // exceed start or normalize() skips the entry
  startMin: number;
  endMin: number;
  // Teachers, already split into individual names
  people?: string[];
  // Rooms, already split
  location?: string[];
  // Cohort identity — the student perspective and the group
  // conflict scope key on it
  groupKey?: string;
  // Several groups taught at once (a merged teacher-view row)
  groupKeys?: string[];
  // Semester label — conflicts never cross terms
  termKey?: string;
  // 'lecture' | 'seminar' | 'lab' | … — RESERVED, absent in
  // today's data; a typed tint activates when it appears
  kind?: string;
  // RESERVED week filters — no-ops while the data lacks them
  parity?: 'odd' | 'even' | null;
  weeks?: number[];
  // A background block (holiday, reserved room): drawn behind,
  // NEVER claiming layout columns from real lessons
  isBlock?: boolean;
}

export type TimetableEntry<T = object> = TimetableEntryBase & T;

// What the packer computes for one entry. Fractions of the day
// column / visible window, so any pixel size renders the same
// geometry — and so the numbers are exactly testable
export interface EntryLayout {
  clusterId: number;
  column: number;
  columnCount: number;
  // Columns this entry may widen into, itself included
  span: number;
  topFrac: number;
  heightFrac: number;
  leftFrac: number;
  widthFrac: number;
  // Under the compact-cell threshold — the UI drops lines
  isShort: boolean;
  // Flagged by annotateConflicts; false until then
  isConflict: boolean;
}

// The caller's entry stays pristine — layout rides BESIDE it
export interface PlacedEntry<T = object> {
  entry: TimetableEntry<T>;
  layout: EntryLayout;
}

// The visible vertical span of a day, in wall-clock minutes
export interface TimeWindow {
  startMin: number;
  endMin: number;
}

// What normalize() answers: the clean entries plus how many
// rows were dropped — malformed data degrades PER ENTRY, never
// blanks the whole table
export interface NormalizeResult<T = object> {
  entries: TimetableEntry<T>[];
  skipped: number;
}

// Where "now" falls inside one day's lessons
export interface NowState<T = object> {
  current?: TimetableEntry<T>;
  next?: TimetableEntry<T>;
  minutesToNext?: number;
}
