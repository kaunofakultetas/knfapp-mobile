// -----------------------------------------------------------
//  [*] timetableengine — normalize
//
//  The single door raw rows come through. Times parse from
//  zero-padded "HH:MM" with STRICT ASCII digits — anything
//  else ("TBA", "", "9:00") skips that one entry and bumps
//  the skipped count, so a host can say "3 lessons could not
//  be read" instead of showing a blank week (the whole-parse
//  try/catch that blanks an entire timetable is a named
//  anti-lesson from production clients). Entries never cross
//  midnight: an end past 24:00 is data corruption here, not a
//  feature, and skips the row before it can poison clustering.
//
//  Used by:
//    - adapters (the KNF one calls it after field mapping)
//    - hosts normalizing their own shapes
// -----------------------------------------------------------

import type { NormalizeResult, TimetableEntry } from './types';

const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
export const DAY_MINUTES = 24 * 60;


// "HH:MM" → minutes since midnight, or null when the shape is
// anything but the zero-padded 24h clock
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}


// Keeps every entry that holds together; drops the rest and
// counts them. Never throws, never mutates the input rows
export function normalizeEntries<T = object>(rows: readonly (TimetableEntry<T> | null | undefined)[]): NormalizeResult<T> {
  const entries: TimetableEntry<T>[] = [];
  let skipped = 0;

  const stringArrayOrAbsent = (value: unknown) =>
    value === undefined || (Array.isArray(value) && value.every((member) => typeof member === 'string'));

  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) {
      skipped += 1;
      continue;
    }
    // Shape too, not just times: a non-string title or a bare
    // string where a name ARRAY belongs would crash the sort
    // and the conflict scan far from here — the gate is the
    // one door, so it checks everything downstream leans on
    if (typeof row.title !== 'string' || !stringArrayOrAbsent(row.people) || !stringArrayOrAbsent(row.location)) {
      skipped += 1;
      continue;
    }
    const { day, startMin, endMin } = row;
    const badDay = !Number.isInteger(day) || day < 0 || day > 6;
    const badTimes =
      !Number.isFinite(startMin) || !Number.isFinite(endMin) ||
      startMin < 0 || endMin > DAY_MINUTES || endMin <= startMin;
    if (badDay || badTimes) {
      skipped += 1;
      continue;
    }
    entries.push(row);
  }

  return { entries, skipped };
}
