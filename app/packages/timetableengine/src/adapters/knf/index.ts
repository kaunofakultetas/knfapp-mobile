// -----------------------------------------------------------
//  [*] timetableengine — KNF adapter
//
//  The faculty backend's GET /api/schedule lesson rows, turned
//  into structural entries. Every mapping is defensive: the
//  scraper feeds this table, and scraped data drifts — a "TBA"
//  time or an unpadded "9:00" must skip that row, never sink
//  the week. The core never learns these field names.
//
//    id                     → id            (stringified)
//    title                  → title
//    teacher                → people        (names only — see
//                             splitPeople: the feed writes
//                             "Vardenė Pavardenė, Doc., Dr.",
//                             where commas ALSO separate a
//                             name from its academic titles)
//    room                   → location      (split on ',')
//    timeStart / timeEnd    → startMin/endMin (strict "HH:MM")
//    dayOfWeek  0 = Monday  → day
//    group    "ISKS-1"      → groupKey
//    semester "2025-R"      → termKey
//
//  One response is ONE PAGE: the schedule endpoints cap a
//  call at 500 rows and an unfiltered query holds more across
//  all groups, so a wide fetch must page with ?offset until a
//  short page comes back, and hand the CONCATENATED rows here
//  in one call. The adapter stays transport-free on purpose.
//
//  Used by:
//    - hosts feeding the faculty schedule into the core
// -----------------------------------------------------------

import { normalizeEntries } from '../../core/normalize';
import type { NormalizeResult, TimetableEntry } from '../../core/types';


// A single capitalised abbreviation ending in a period —
// "Doc.", "Dr.", "Prof.", "Lekt.", "Asist." — is an academic
// TITLE riding after a name in the feed's comma list, not
// another person. Names keep their identity bare, so the same
// teacher matches across rows whether or not a row lists
// every title.
const TITLE_RE = /^\p{Lu}\p{Ll}{0,9}\.$/u;







// -----------------------------------------------------------
// KnfLesson
// -----------------------------------------------------------
//
// One lesson row exactly as the backend serves it.
//
// Used by:
//   - toTimetableEntry / normalizeKnf (below)
//   - components/schedule/TimetableView.tsx,
//     app/(main)/tabs/schedule.tsx — typing the fetched rows
// -----------------------------------------------------------

export interface KnfLesson {
  id: number | string;
  title?: string;
  teacher?: string;
  room?: string;
  timeStart?: string;
  timeEnd?: string;
  dayOfWeek?: number;
  group?: string;
  semester?: string;
  [extra: string]: unknown;
}







// -----------------------------------------------------------
// padTime
// -----------------------------------------------------------
//
// "9:00" (unpadded) → "09:00"; anything else passes through
// for the strict parser to judge.
//
// Used by:
//   - toMinutes (below)
// -----------------------------------------------------------

const padTime = (value?: string) => {
  const raw = (value ?? '').trim();
  return /^\d:\d\d$/.test(raw) ? `0${raw}` : raw;
};







// -----------------------------------------------------------
// splitList
// -----------------------------------------------------------
//
// The feed's comma lists (rooms, names) into trimmed parts.
//
// Used by:
//   - splitPeople, toTimetableEntry (below)
// -----------------------------------------------------------

const splitList = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);







// -----------------------------------------------------------
// splitPeople
// -----------------------------------------------------------
//
// The comma list minus the academic titles (TITLE_RE above) —
// people only.
//
// Used by:
//   - toTimetableEntry (below)
// -----------------------------------------------------------

const splitPeople = (value?: string) => splitList(value).filter((token) => !TITLE_RE.test(token));







// -----------------------------------------------------------
// toMinutes
// -----------------------------------------------------------
//
// 'HH:MM' wall clock to minutes since midnight — NaN flags a
// malformed stamp for normalize to skip.
//
// Used by:
//   - toTimetableEntry (below)
// -----------------------------------------------------------

const toMinutes = (value?: string): number => {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(padTime(value));
  if (!match) return Number.NaN; // normalize skips the row
  return Number(match[1]) * 60 + Number(match[2]);
};







// -----------------------------------------------------------
// toTimetableEntry
// -----------------------------------------------------------
//
// One backend row → one candidate entry. Extra backend fields
// ride along on the generic payload untouched.
//
// Used by:
//   - normalizeKnf (below)
// -----------------------------------------------------------

export function toTimetableEntry(lesson: KnfLesson): TimetableEntry<KnfLesson> {
  return {
    ...lesson,
    id: String(lesson.id ?? ''),
    title: (lesson.title ?? '').trim() || 'Užsiėmimas',
    day: lesson.dayOfWeek ?? -1,
    startMin: toMinutes(lesson.timeStart),
    endMin: toMinutes(lesson.timeEnd),
    people: splitPeople(lesson.teacher),
    location: splitList(lesson.room),
    groupKey: (lesson.group ?? '').trim() || undefined,
    termKey: (lesson.semester ?? '').trim() || undefined,
  };
}







// -----------------------------------------------------------
// normalizeKnf
// -----------------------------------------------------------
//
// Every fetched row (all pages concatenated, when the query
// needed more than one) through mapping + the core gate: rows
// with unusable times/days come back as a skipped COUNT, and
// everything usable still renders
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the dated events of both
//     perspectives, shown week and pager side pages alike
// -----------------------------------------------------------

export function normalizeKnf(lessons: readonly KnfLesson[]): NormalizeResult<KnfLesson> {
  return normalizeEntries(lessons.map(toTimetableEntry));
}
