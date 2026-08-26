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
//  conflict with one starting 12:00. Malformed "HH:MM" values
//  parse to zero-length ranges, which can never overlap — bad
//  data degrades to "no conflict", never to a crash or a
//  false red flag.
//
//  Split into:
//
//    parseTime            — "HH:MM" → minutes since midnight
//    detectConflicts      — the pairwise scan (module-private)
//    useScheduleConflicts — memoizing hook (the export)
// -----------------------------------------------------------

// Memoization — the scan is O(n²) over one day's lessons
import { useMemo } from 'react';

// Lesson shape; group/semester feed the same-group rule
import type { ScheduleLesson } from '@/services/api';


// "HH:MM" → minutes since midnight; a missing or garbled part
// reads as 0, so garbage degrades to a zero-length range
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}








// -----------------------------------------------------------
// detectConflicts
// -----------------------------------------------------------
//
// Pairwise scan returning the ids of every lesson that
// overlaps another lesson of the same group and semester.
// Overlap test is startA < endB && startB < endA — exclusive
// endpoints, so back-to-back lessons never conflict.
//
// Used by:
//   - useScheduleConflicts (below)
// -----------------------------------------------------------

function detectConflicts(lessons: ScheduleLesson[]): Set<string> {

  const conflicts = new Set<string>();


  for (let i = 0; i < lessons.length; i++) {
    const a = lessons[i];
    const aStart = parseTime(a.timeStart);
    const aEnd = parseTime(a.timeEnd);

    for (let j = i + 1; j < lessons.length; j++) {
      const b = lessons[j];

      // Parallel groups share time slots by design — only the
      // same group+semester can truly double-book a student
      if (a.group !== b.group || a.semester !== b.semester) continue;

      if (aStart < parseTime(b.timeEnd) && parseTime(b.timeStart) < aEnd) {
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
  lessons: ScheduleLesson[],
  enabled: boolean = true,
): Set<string> {
  return useMemo(
    () => (enabled ? detectConflicts(lessons) : new Set<string>()),
    [lessons, enabled],
  );
}
