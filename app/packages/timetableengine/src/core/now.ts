// -----------------------------------------------------------
//  [*] timetableengine — now
//
//  Where "now" falls in one day's lessons: the running lesson
//  (start <= now < end) and the next one up, as a pure
//  function of an integer minute — the TICKING lives in the
//  UI (a half-minute interval; a per-second re-render is a
//  named anti-lesson from a production timetable component).
//  "Next" is the first OTHER lesson still ahead or underway —
//  a double-booked overlap (the teacher's headline case) shows
//  as next with minutesToNext 0, never vanishing mid-overlap.
//
//  Used by:
//    - hosts driving the now line and the "up next" surface
// -----------------------------------------------------------

import { compareEntries } from './layout';
import type { NowState, TimetableEntry } from './types';


export function nowState<T = object>(dayEntries: readonly TimetableEntry<T>[], nowMin: number): NowState<T> {
  const lessons = dayEntries.filter((entry) => !entry.isBlock).slice().sort(compareEntries);

  let current: TimetableEntry<T> | undefined;
  let next: TimetableEntry<T> | undefined;
  for (const entry of lessons) {
    if (!current && entry.startMin <= nowMin && nowMin < entry.endMin) {
      current = entry;
      continue;
    }
    // Still relevant: not over yet. An already-started overlap
    // qualifies — it must not vanish until it ends
    if (entry.endMin > nowMin) {
      next = entry;
      break;
    }
  }

  return {
    current,
    next,
    minutesToNext: next ? Math.max(0, next.startMin - nowMin) : undefined,
  };
}
