// -----------------------------------------------------------
//  [*] timetableengine — window
//
//  The visible hour span of a timetable: an hour of air above
//  the earliest lesson and below the latest, snapped to whole
//  hours, clamped to the configured bounds — and the
//  CONFIGURED floor is respected, never a hardcoded 8 (the
//  bug a production university-timetable component shipped).
//  Pure, returns a fresh object, never mutates options.
//
//  Used by:
//    - hosts deriving the grid's vertical span
// -----------------------------------------------------------

import type { TimeWindow, TimetableEntry } from './types';







// -----------------------------------------------------------
// WindowOptions
// -----------------------------------------------------------
//
// Tuning for the derived hour span — bounds and padding, all
// wall-clock minutes.
//
// Used by:
//   - deriveWindow (below) — its options bag; no in-tree
//     caller passes one today (the defaults serve)
// -----------------------------------------------------------

export interface WindowOptions {
  // The DEFAULT span: the window never shrinks inside these
  // bounds, but an earlier or later lesson widens past them
  floorMin?: number;
  ceilMin?: number;
  // Air around the outermost lessons, before hour snapping
  padMin?: number;
}

// 08:00 in minutes — the default window never starts later
const DEFAULT_FLOOR = 8 * 60;
// 21:00 in minutes — nor ends earlier
const DEFAULT_CEIL = 21 * 60;
// Default air around the outermost lessons, in minutes
const DEFAULT_PAD = 60;







// -----------------------------------------------------------
// deriveWindow
// -----------------------------------------------------------
//
// Used by:
//   - components/schedule/TimetableView.tsx — one window for
//     both views
// -----------------------------------------------------------

export function deriveWindow(entries: readonly TimetableEntry[], options: WindowOptions = {}): TimeWindow {
  const floorMin = options.floorMin ?? DEFAULT_FLOOR;
  const ceilMin = options.ceilMin ?? DEFAULT_CEIL;
  const padMin = options.padMin ?? DEFAULT_PAD;

  // Background blocks (holidays, reserved rooms) span whole
  // days by design — letting them widen the axis would squash
  // every real lesson, and placeDay already clamps them into
  // whatever window the LESSONS earn
  const lessons = entries.filter((entry) => !entry.isBlock);
  if (lessons.length === 0) return { startMin: floorMin, endMin: ceilMin };

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const entry of lessons) {
    if (entry.startMin < minStart) minStart = entry.startMin;
    if (entry.endMin > maxEnd) maxEnd = entry.endMin;
  }

  // Snap outward to whole hours. The configured bounds are the
  // DEFAULT span — an early or late lesson widens past them,
  // nothing ever shrinks inside them, so the axis stays put
  // while paging between days and weeks
  const start = Math.floor((minStart - padMin) / 60) * 60;
  const end = Math.ceil((maxEnd + padMin) / 60) * 60;
  return {
    startMin: Math.max(0, Math.min(floorMin, start)),
    endMin: Math.min(24 * 60, Math.max(ceilMin, end)),
  };
}
