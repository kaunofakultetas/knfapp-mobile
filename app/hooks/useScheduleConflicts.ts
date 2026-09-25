// -----------------------------------------------------------
//  [*] useScheduleConflicts — timetable overlap detection
//
//  Flags lessons that double-book a student: two entries of
//  the SAME group and semester whose time ranges overlap.
//  Cross-group comparison is deliberately excluded — parallel
//  groups legitimately share hours, and comparing across them
//  painted half of the "all groups" view red. The schedule
//  screen goes one step further and disables detection
//  entirely while no group filter is active, since that view
//  is exactly the parallel case.
//
//  Endpoints are exclusive: a lesson ending 12:00 does not
//  conflict with one starting 12:00. A value that is not
//  "HH:MM" parses to NaN and that lesson is explicitly
//  excluded from the scan — bad data degrades to "no
//  conflict", never to a crash or a false red flag. Identical
//  rows (same title, room and times) are duplicates, not
//  conflicts, and are skipped too. So are two rows naming
//  DISJOINT subgroups ("Pogrupiai: 1" beside "Pogrupiai: 2")
//  — the two halves of one group in two rooms, which painted
//  a group's every split practical red; a row naming no
//  subgroup is the whole group and still clashes with any.
//  The rule is the engine's own group-scope rule (the grid
//  and the list must never disagree on a clash).
//
//  Split into:
//
//    ConflictLesson       — the row shape the scan reads
//    parseTime            — "HH:MM" → minutes since midnight
//    disjointSubgroups    — two halves of one group
//    detectConflicts      — the pairwise scan (module-private)
//    useScheduleConflicts — memoizing hook (the export)
// -----------------------------------------------------------

// Memoization — the scan is O(n²) over one day's lessons
import { useMemo } from 'react';

// Lesson shape; group/semester feed the same-group rule
import type { ScheduleLesson } from '@/services/api';







// -----------------------------------------------------------
// ConflictLesson
// -----------------------------------------------------------
//
// A card's lesson plus the subgroups the dated wire names —
// optional, so a plain ScheduleLesson (or a row cached before
// the wire carried them) scans as the whole group.
//
// Used by:
//   - disjointSubgroups, detectConflicts, useScheduleConflicts
//     (below)
// -----------------------------------------------------------

export type ConflictLesson = ScheduleLesson & { subgroups?: readonly string[] };







// -----------------------------------------------------------
// parseTime
// -----------------------------------------------------------
//
// "HH:MM" → minutes since midnight; anything else → NaN, and
// detectConflicts skips lessons whose times did not parse.
//
// Used by:
//   - detectConflicts (below)
// -----------------------------------------------------------

function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}







// -----------------------------------------------------------
// disjointSubgroups
// -----------------------------------------------------------
//
// True only when BOTH rows name subgroups and none is shared
// — no student sits in both halves. An empty or absent list
// is the whole group and overlaps everything.
//
// Used by:
//   - detectConflicts (below)
// -----------------------------------------------------------

function disjointSubgroups(a: ConflictLesson, b: ConflictLesson): boolean {
  const mine = a.subgroups ?? [];
  const theirs = b.subgroups ?? [];
  if (mine.length === 0 || theirs.length === 0) return false;
  return !mine.some((key) => theirs.includes(key));
}







// -----------------------------------------------------------
// detectConflicts
// -----------------------------------------------------------
//
// Pairwise scan returning the ids of every lesson that
// overlaps another lesson of the same group and semester
// (and a subgroup in common, or none named). Overlap test is
// startA < endB && startB < endA — exclusive endpoints, so
// back-to-back lessons never conflict.
//
// Used by:
//   - useScheduleConflicts (below)
// -----------------------------------------------------------

function detectConflicts(lessons: readonly ConflictLesson[]): Set<string> {

  const conflicts = new Set<string>();


  for (let i = 0; i < lessons.length; i++) {
    const a = lessons[i];
    const aStart = parseTime(a.timeStart);
    const aEnd = parseTime(a.timeEnd);

    // Unparseable times are excluded, never flagged
    if (Number.isNaN(aStart) || Number.isNaN(aEnd)) continue;

    for (let j = i + 1; j < lessons.length; j++) {
      const b = lessons[j];

      // Parallel groups share time slots by design — only the
      // same group+semester can truly double-book a student,
      // and only across a subgroup they share
      if (a.group !== b.group || a.semester !== b.semester) continue;
      if (disjointSubgroups(a, b)) continue;

      // An identical row is a duplicate entry in the source
      // data, not a lecture the student must be in twice
      if (
        a.title === b.title &&
        a.room === b.room &&
        a.timeStart === b.timeStart &&
        a.timeEnd === b.timeEnd
      ) {
        continue;
      }

      const bStart = parseTime(b.timeStart);
      const bEnd = parseTime(b.timeEnd);
      if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;

      if (aStart < bEnd && bStart < aEnd) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }


  return conflicts;
}







// -----------------------------------------------------------
// useScheduleConflicts
// -----------------------------------------------------------
//
//   useScheduleConflicts(lessons)         — Set of lesson ids
//                                           overlapping another
//                                           lesson of the same
//                                           group + semester
//   useScheduleConflicts(lessons, false)  — detection disabled
//                                           → always the empty
//                                           Set (the "all
//                                           groups" view)
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — red conflict highlights
//     and the "N lectures overlap" banner
// -----------------------------------------------------------

export function useScheduleConflicts(
  lessons: readonly ConflictLesson[],
  enabled: boolean = true,
): Set<string> {
  return useMemo(
    () => (enabled ? detectConflicts(lessons) : new Set<string>()),
    [lessons, enabled],
  );
}
