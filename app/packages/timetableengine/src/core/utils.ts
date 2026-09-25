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







// -----------------------------------------------------------
// formatMinutes
// -----------------------------------------------------------
//
// 545 → "09:05". 24-hour and zero-padded on BOTH parts — the
// shape the scraped "HH:MM" strings carry and every other
// clock in the app prints (Intl, hour '2-digit', in lt-LT
// and en-GB alike), so a lesson reads "09:45" in the grid,
// the list and the detail sheet. It used to drop the hour's
// zero, and the grid alone said "9:45" (KNF-184). 1440 stays
// "24:00" — a window's end, never "00:00" of the next day.
//
// Used by:
//   - components/schedule/TimetableHost.tsx — the kit's
//     formatTime (grid axis and cells)
//   - app/(main)/tabs/schedule.tsx — the list cards' times
//   - components/schedule/LessonSheet.tsx — the tap sheet
// -----------------------------------------------------------

export function formatMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}







// -----------------------------------------------------------
// termKeyOf
// -----------------------------------------------------------
//
// The 'YYYY-R/P' label the scraper stamps on an event of the
// given 'YYYY-MM-DD' date — the backend's own rule mirrored
// one to one (schedule_scraper._get_semester_label): August–
// December → '{y}-R', January–July → '{y-1}-P', months
// counted 1 = January. The label year is the academic year's
// FIRST calendar year, so '2026-P' is spring 2027. Pure on
// the date string — no Date, no timezone.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — today's term (the jump's
//     "back to today" branch) and the visible week's term
//     (the semester row the filter sheet checks)
// -----------------------------------------------------------

export function termKeyOf(dateISO: string): string {
  const [year, month] = dateISO.split('-').map(Number);
  return month >= 8 ? `${year}-R` : `${year - 1}-P`;
}







// -----------------------------------------------------------
// semesterRank
// -----------------------------------------------------------
//
// "2025-R" (autumn/ruduo) sorts BEFORE "2025-P" (spring/
// pavasaris) — the academic year starts in autumn, so rank is
// year*2 + season. Unknown shapes rank lowest and never win
// the "newest" pick over a real semester.
//
// Used by:
//   - newestSemesterKey, newestSemester (below)
// -----------------------------------------------------------

export function semesterRank(termKey: string): number {
  const match = /^(\d{4})-([RP])$/.exec(termKey);
  if (!match) return -1;
  return Number(match[1]) * 2 + (match[2] === 'R' ? 0 : 1);
}







// -----------------------------------------------------------
// newestSemesterKey
// -----------------------------------------------------------
//
// The most recent semester among CATALOG labels — hosts fetch
// their filter lists as bare 'YYYY-P/R' strings, not entries.
// Ranking is semesterRank's: the label year is the academic
// year's FIRST calendar year, so "2025-P" (spring, held in
// calendar 2026) outranks "2025-R" (its autumn); unparsable
// labels never win, and a catalog of only those yields null.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the default semester pick
// -----------------------------------------------------------

export function newestSemesterKey(keys: readonly string[]): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const key of keys) {
    const trimmed = key.trim();
    const rank = semesterRank(trimmed);
    if (rank > bestRank) {
      bestRank = rank;
      best = trimmed;
    }
  }
  return best;
}







// -----------------------------------------------------------
// newestSemester
// -----------------------------------------------------------
//
// The most recent semester present in the data — the default
// selection when the host has no saved choice
//
// Used by:
//   - nothing calls this at the moment — re-exported through
//     the public surface
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// posToSlot
// -----------------------------------------------------------
//
// A touch point in grid space back to a slot: fractional x
// across the 7 day columns, fractional y down the window.
// Start snaps DOWN to the half hour — tapping mid-slot means
// that slot
//
// Used by:
//   - nothing calls this at the moment — re-exported through
//     the public surface
// -----------------------------------------------------------

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
