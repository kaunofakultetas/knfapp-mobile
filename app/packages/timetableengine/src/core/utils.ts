// -----------------------------------------------------------
//  [*] timetableengine — small utilities
//
//  Minutes to labels, semesters to a sortable rank, a touch
//  point back to a slot. All pure, all structural — no Date
//  objects anywhere near render-path formatting.
//
//  Used by:
//    - hosts labelling the axis and picking a default term
// -----------------------------------------------------------

import type { TimetableEntry } from './types';


// 545 → "9:05". 24-hour, no leading zero on the hour — the
// axis label style, matching how Lithuanian timetables read
export function formatMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}


// "2025-R" (autumn/ruduo) sorts BEFORE "2025-P" (spring/
// pavasaris) — the academic year starts in autumn, so rank is
// year*2 + season. Unknown shapes rank lowest and never win
// the "newest" pick over a real semester.
export function semesterRank(termKey: string): number {
  const match = /^(\d{4})-([RP])$/.exec(termKey);
  if (!match) return -1;
  return Number(match[1]) * 2 + (match[2] === 'R' ? 0 : 1);
}


// The most recent semester present in the data — the default
// selection when the host has no saved choice
export function newestSemester(entries: readonly TimetableEntry[]): string | undefined {
  let best: string | undefined;
  let bestRank = -1;
  for (const entry of entries) {
    if (!entry.termKey) continue;
    const rank = semesterRank(entry.termKey);
    if (rank > bestRank) {
      bestRank = rank;
      best = entry.termKey;
    }
  }
  return best;
}


// A touch point in grid space back to a slot: fractional x
// across the 7 day columns, fractional y down the window.
// Start snaps DOWN to the half hour — tapping mid-slot means
// that slot
export function posToSlot(
  xFrac: number,
  yFrac: number,
  window: { startMin: number; endMin: number },
): { day: number; snappedStartMin: number } {
  const day = Math.max(0, Math.min(6, Math.floor(xFrac * 7)));
  const span = Math.max(1, window.endMin - window.startMin);
  const raw = window.startMin + Math.max(0, Math.min(1, yFrac)) * span;
  const snapped = Math.floor(raw / 30) * 30;
  return { day, snappedStartMin: Math.max(window.startMin, Math.min(window.endMin - 30, snapped)) };
}
