/**
 * Detects overlapping schedule entries within a list of lessons.
 *
 * Two lessons conflict when their time ranges overlap on the same day.
 * Returns a Set of lesson IDs that have at least one conflict.
 */
import { useMemo } from 'react';
import type { ScheduleLesson } from '@/services/api';

/** Parse "HH:MM" to minutes since midnight. */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Check if two time ranges overlap (exclusive endpoints). */
function timesOverlap(
  startA: number, endA: number,
  startB: number, endB: number,
): boolean {
  return startA < endB && startB < endA;
}

/**
 * Given a list of lessons (already filtered to one day), return the set of
 * lesson IDs that overlap with at least one other lesson.
 */
export function detectConflicts(lessons: ScheduleLesson[]): Set<string> {
  const conflicts = new Set<string>();
  for (let i = 0; i < lessons.length; i++) {
    const a = lessons[i];
    const aStart = parseTime(a.timeStart);
    const aEnd = parseTime(a.timeEnd);
    for (let j = i + 1; j < lessons.length; j++) {
      const b = lessons[j];
      const bStart = parseTime(b.timeStart);
      const bEnd = parseTime(b.timeEnd);
      if (timesOverlap(aStart, aEnd, bStart, bEnd)) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

/**
 * React hook that memoizes conflict detection for a lesson list.
 */
export function useScheduleConflicts(lessons: ScheduleLesson[]): Set<string> {
  return useMemo(() => detectConflicts(lessons), [lessons]);
}
