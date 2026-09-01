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
//  Used by:
//    - hosts bucketing entries for the grid
//    - future dated features (parity, "this week" copies)
// -----------------------------------------------------------

import { compareEntries } from './layout';
import type { TimetableEntry } from './types';


// Day buckets 0..6, each sorted with the layout's total order
export function buildWeek<T = object>(entries: readonly TimetableEntry<T>[]): TimetableEntry<T>[][] {
  const days: TimetableEntry<T>[][] = [[], [], [], [], [], [], []];
  for (const entry of entries) days[entry.day].push(entry);
  for (const bucket of days) bucket.sort(compareEntries);
  return days;
}


// Which day indexes deserve a column: Monday–Friday always,
// the weekend only when something is scheduled there
export function visibleDays(entries: readonly TimetableEntry[]): number[] {
  const has = new Set(entries.map((entry) => entry.day));
  const days = [0, 1, 2, 3, 4];
  if (has.has(5)) days.push(5);
  if (has.has(6)) days.push(6);
  return days;
}


// --- dated edge, all in UTC on 'YYYY-MM-DD' strings ---

export const DAY_MS = 86_400_000;

export const parseISO = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const toISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10);


// The Monday of the week holding the given date
export function mondayOf(dateISO: string): string {
  const ms = parseISO(dateISO);
  const weekday = new Date(ms).getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (weekday + 6) % 7;
  return toISO(ms - sinceMonday * DAY_MS);
}


// ISO-8601 week number — the future key for parity/weeks
// filters (week 53 exists; Jan 1 can belong to week 52/53)
export function isoWeekNumber(dateISO: string): number {
  const ms = parseISO(dateISO);
  const date = new Date(ms);
  // Thursday of this week decides the ISO year
  const thursday = ms + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS;
  const yearStart = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  return Math.floor((thursday - yearStart) / DAY_MS / 7) + 1;
}


export interface DatedEntry<T = object> {
  entry: TimetableEntry<T>;
  // 'YYYY-MM-DD' of this occurrence
  date: string;
}

// Structural slots → one concrete week of dated occurrences,
// applying parity/weeks filters when the entry carries them
// (today's data does not — every filter is then a no-op)
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
