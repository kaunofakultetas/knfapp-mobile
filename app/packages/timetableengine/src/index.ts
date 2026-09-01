// -----------------------------------------------------------
//  [*] @knf/timetableengine — public surface
//
//  Headless university timetable logic: normalize → place →
//  annotate, plus week/date math and the two perspectives.
//  Everything here is a pure function over structural entries;
//  React, styling and ticking live with the host.
//
//  Used by:
//    - @knf/timetableuikit hosts and the mobile app
// -----------------------------------------------------------

export { DAY_MINUTES, normalizeEntries, parseTimeToMinutes } from './core/normalize';
export { compareEntries, placeDay } from './core/layout';
export { deriveWindow } from './core/window';
export { DAY_MS, buildWeek, isoWeekNumber, materializeWeek, mondayOf, parseISO, toISO, visibleDays } from './core/week';
export { annotateConflicts, conflictIds } from './core/conflicts';
export { nowState } from './core/now';
export { forGroup, forTeacher, listTeachers } from './core/perspective';
export { formatMinutes, newestSemester, posToSlot, semesterRank } from './core/utils';
export { normalizeKnf, toTimetableEntry } from './adapters/knf';

export type {
  EntryLayout,
  NormalizeResult,
  NowState,
  PlacedEntry,
  TimeWindow,
  TimetableEntry,
  TimetableEntryBase,
} from './core/types';
export type { ConflictOptions } from './core/conflicts';
export type { DatedEntry } from './core/week';
export type { KnfLesson } from './adapters/knf';
