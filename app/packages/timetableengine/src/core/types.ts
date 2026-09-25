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







// -----------------------------------------------------------
// TimetableEntryBase
// -----------------------------------------------------------
//
// Day 0 = Monday .. 6 = Sunday — Lithuanian convention, and
// the same indexing the backend stores.
//
// Used by:
//   - TimetableEntry (below) — the structural half of every
//     entry
// -----------------------------------------------------------

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
  // The subgroups of the group this entry is for ("1", "2");
  // absent or empty = the whole group. Two entries naming
  // DISJOINT subgroups never double-book one student
  subgroupKeys?: string[];
  // Semester label — conflicts never cross terms
  termKey?: string;
  // The canonical event kind — 'lecture' | 'practice' |
  // 'seminar' | 'lab' | 'lecture_seminar' |
  // 'lecture_practice' | 'exam' | 'retake' | 'assessment' |
  // 'consultation' | 'other' (a type the source names that
  // no adapter vocabulary knows); absent when the source
  // names none. The kit badges the exam-like kinds
  kind?: string;
  // RESERVED week filters — no-ops while the data lacks them
  parity?: 'odd' | 'even' | null;
  weeks?: number[];
  // A background block (holiday, reserved room): drawn behind,
  // NEVER claiming layout columns from real lessons
  isBlock?: boolean;
}







// -----------------------------------------------------------
// TimetableEntry
// -----------------------------------------------------------
//
// The working type everywhere: the structural base with the
// host's own fields riding along untouched, typed back out on
// the far side of every derivation.
//
// Used by:
//   - every core module and the KNF adapter
//   - components/schedule/TimetableView.tsx,
//     app/(main)/tabs/schedule.tsx — the host's rows
// -----------------------------------------------------------

export type TimetableEntry<T = object> = TimetableEntryBase & T;







// -----------------------------------------------------------
// EntryLayout
// -----------------------------------------------------------
//
// What the packer computes for one entry. Fractions of the day
// column / visible window, so any pixel size renders the same
// geometry — and so the numbers are exactly testable.
//
// Used by:
//   - PlacedEntry (below) — rides beside the entry
//   - layout.ts — placeDay fills it; conflicts.ts —
//     annotateConflicts flips isConflict
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// PlacedEntry
// -----------------------------------------------------------
//
// The caller's entry stays pristine — layout rides BESIDE it.
//
// Used by:
//   - layout.ts — placeDay's rows; conflicts.ts —
//     annotateConflicts
//   - the UI kit mirrors this shape structurally as
//     PlacedLesson
// -----------------------------------------------------------

export interface PlacedEntry<T = object> {
  entry: TimetableEntry<T>;
  layout: EntryLayout;
}







// -----------------------------------------------------------
// TimeWindow
// -----------------------------------------------------------
//
// The visible vertical span of a day, in wall-clock minutes.
//
// Used by:
//   - window.ts — deriveWindow's answer; layout.ts — placeDay's
//     vertical yardstick
// -----------------------------------------------------------

export interface TimeWindow {
  startMin: number;
  endMin: number;
}







// -----------------------------------------------------------
// NormalizeResult
// -----------------------------------------------------------
//
// What normalize() answers: the clean entries plus how many
// rows were dropped — malformed data degrades PER ENTRY, never
// blanks the whole table.
//
// Used by:
//   - normalize.ts — normalizeEntries' answer; adapters/knf —
//     normalizeKnf hands it through
// -----------------------------------------------------------

export interface NormalizeResult<T = object> {
  entries: TimetableEntry<T>[];
  skipped: number;
}







// -----------------------------------------------------------
// NowState
// -----------------------------------------------------------
//
// Where "now" falls inside one day's lessons.
//
// Used by:
//   - now.ts — nowState's answer
// -----------------------------------------------------------

export interface NowState<T = object> {
  current?: TimetableEntry<T>;
  next?: TimetableEntry<T>;
  minutesToNext?: number;
}
