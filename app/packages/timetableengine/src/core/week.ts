// -----------------------------------------------------------
//  [*] timetableengine — week
//
//  The weekly shape: day buckets (0=Monday..6), the days worth
//  showing, and the ONE place structural slots meet real
//  dates — materializeWeek. All date-only arithmetic runs on
//  UTC-normalized date strings, so the EET DST Sundays in
//  late March and late October (mid-semester!) can never
//  duplicate or skip a day: dates are strings, times stay
//  wall-clock minutes, and the two never mix.
//
//  Parity/weeks filters are RESERVED no-ops until the data
//  carries them — the shape is ready, the behavior is inert.
//
//  ONE function reads the wall clock: todayISO, the local
//  calendar date. Everything else is pure date arithmetic on
//  strings and must stay UTC-only — feeding it Date.now()
//  through toISO answers the UTC date, which east of UTC is
//  still yesterday for the first hours of every day.
//
//  Used by:
//    - hosts bucketing entries for the grid
//    - app/(main)/tabs/schedule.tsx — the dated week window
//      (weekStart cursor, fetch bounds, header captions)
//    - future dated features (parity, "this week" copies)
// -----------------------------------------------------------

import { compareEntries } from './layout';
import type { TimetableEntry } from './types';







// -----------------------------------------------------------
// DAY_MS
// -----------------------------------------------------------
//
// One UTC day in milliseconds — the stride of all date-only
// arithmetic on this edge (no DST days exist in UTC).
//
// Used by:
//   - mondayOf, isoWeekNumber, materializeWeek (below)
//   - app/(main)/tabs/schedule.tsx — the dated week window
// -----------------------------------------------------------

export const DAY_MS = 86_400_000;







// -----------------------------------------------------------
// buildWeek
// -----------------------------------------------------------
//
// Day buckets 0..6, each sorted with the layout's total order
//
// Used by:
//   - components/schedule/TimetableView.tsx — the week grid's
//     buckets
// -----------------------------------------------------------

export function buildWeek<T = object>(entries: readonly TimetableEntry<T>[]): TimetableEntry<T>[][] {
  const days: TimetableEntry<T>[][] = [[], [], [], [], [], [], []];
  for (const entry of entries) days[entry.day].push(entry);
  for (const bucket of days) bucket.sort(compareEntries);
  return days;
}







// -----------------------------------------------------------
// visibleDays
// -----------------------------------------------------------
//
// Which day indexes deserve a column: Monday–Friday always,
// the weekend only when something is scheduled there
//
// Used by:
//   - components/schedule/TimetableView.tsx — the grid's columns
//   - app/(main)/tabs/schedule.tsx — the day tab set
// -----------------------------------------------------------

export function visibleDays(entries: readonly TimetableEntry[]): number[] {
  const has = new Set(entries.map((entry) => entry.day));
  const days = [0, 1, 2, 3, 4];
  if (has.has(5)) days.push(5);
  if (has.has(6)) days.push(6);
  return days;
}







// -----------------------------------------------------------
// parseISO
// -----------------------------------------------------------
//
// 'YYYY-MM-DD' to UTC midnight milliseconds — the dated
// edge's way IN.
//
// Used by:
//   - mondayOf, isoWeekNumber, materializeWeek (below)
//   - app/(main)/tabs/schedule.tsx — week window arithmetic
// -----------------------------------------------------------

export const parseISO = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};







// -----------------------------------------------------------
// toISO
// -----------------------------------------------------------
//
// UTC milliseconds back to 'YYYY-MM-DD' — the dated edge's
// way OUT.
//
// Used by:
//   - mondayOf, materializeWeek (below)
//   - app/(main)/tabs/schedule.tsx — week window arithmetic
// -----------------------------------------------------------

export const toISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10);







// -----------------------------------------------------------
// todayISO
// -----------------------------------------------------------
//
// The LOCAL calendar date as 'YYYY-MM-DD' — the one place the
// wall clock enters the dated edge. Never toISO(Date.now()):
// that is the UTC date, and in Vilnius (UTC+2/+3) Monday's
// first two or three hours still read as Sunday, opening the
// timetable on LAST week marked "today". The answer is a plain
// date string, so all the UTC arithmetic applies to it as is.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — today's week cursor, the
//     today marker, the tab re-press and day-rollover resets,
//     the semester time-jump's "back to today"
// -----------------------------------------------------------

export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}







// -----------------------------------------------------------
// dayIndexOf
// -----------------------------------------------------------
//
// A local Date to the timetable's day index — JS counts
// 0=Sunday, every entry.day here (and the KNF wire) counts
// 0=Monday…6=Sunday
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — today's day cursor
// -----------------------------------------------------------

export function dayIndexOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}







// -----------------------------------------------------------
// mondayOf
// -----------------------------------------------------------
//
// The Monday of the week holding the given date
//
// Used by:
//   - materializeWeek (below)
//   - app/(main)/tabs/schedule.tsx — the weekStart cursor
// -----------------------------------------------------------

export function mondayOf(dateISO: string): string {
  const ms = parseISO(dateISO);
  const weekday = new Date(ms).getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (weekday + 6) % 7;
  return toISO(ms - sinceMonday * DAY_MS);
}







// -----------------------------------------------------------
// isoWeekNumber
// -----------------------------------------------------------
//
// ISO-8601 week number — the key for parity/weeks filters
// (week 53 exists; Jan 1 can belong to week 52/53)
//
// Used by:
//   - materializeWeek (below)
//   - app/(main)/tabs/schedule.tsx — week mode's caption
// -----------------------------------------------------------

export function isoWeekNumber(dateISO: string): number {
  const ms = parseISO(dateISO);
  const date = new Date(ms);
  // Thursday of this week decides the ISO year
  const thursday = ms + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS;
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / DAY_MS / 7) + 1;
}







// -----------------------------------------------------------
// DatedEntry
// -----------------------------------------------------------
//
// One structural slot landed on a concrete date.
//
// Used by:
//   - materializeWeek (below) — its return rows; re-exported
//     through the public surface, no other in-tree consumer
//     yet
// -----------------------------------------------------------

export interface DatedEntry<T = object> {
  entry: TimetableEntry<T>;
  // 'YYYY-MM-DD' of this occurrence
  date: string;
}







// -----------------------------------------------------------
// materializeWeek
// -----------------------------------------------------------
//
// Structural slots → one concrete week of dated occurrences,
// applying parity/weeks filters when the entry carries them
// (today's data does not — every filter is then a no-op)
//
// Used by:
//   - nothing calls this at the moment — the reserved dated
//     edge, re-exported through the public surface
// -----------------------------------------------------------

export function materializeWeek<T = object>(entries: readonly TimetableEntry<T>[], mondayISO: string): DatedEntry<T>[] {
  const monday = mondayOf(mondayISO);
  const mondayMs = parseISO(monday);
  const week = isoWeekNumber(monday);
  const parityOfWeek = week % 2 === 1 ? 'odd' : 'even';

  const out: DatedEntry<T>[] = [];
  for (const entry of entries) {
    if (entry.parity && entry.parity !== parityOfWeek) continue;
    if (entry.weeks && entry.weeks.length > 0 && !entry.weeks.includes(week)) continue;
    out.push({ entry, date: toISO(mondayMs + entry.day * DAY_MS) });
  }
  return out;
}
