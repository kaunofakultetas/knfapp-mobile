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
//  One response is ONE PAGE: GET /api/schedule caps a call at
//  500 rows and a semester holds more across all groups, so an
//  ungrouped fetch (the teacher perspective needs every group)
//  must page with ?offset until a short page comes back, and
//  hand the CONCATENATED rows here in one call. The adapter
//  stays transport-free on purpose.
//
//  Used by:
//    - hosts feeding the faculty schedule into the core
// -----------------------------------------------------------

import { normalizeEntries } from '../../core/normalize';
import type { NormalizeResult, TimetableEntry } from '../../core/types';


// One lesson row exactly as the backend serves it
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


// "9:00" (unpadded) → "09:00"; anything else passes through
// for the strict parser to judge
const padTime = (value?: string) => {
  const raw = (value ?? '').trim();
  return /^\d:\d\d$/.test(raw) ? `0${raw}` : raw;
};

const splitList = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

// A single capitalised abbreviation ending in a period —
// "Doc.", "Dr.", "Prof.", "Lekt.", "Asist." — is an academic
// TITLE riding after a name in the feed's comma list, not
// another person. Names keep their identity bare, so the same
// teacher matches across rows whether or not a row lists
// every title.
const TITLE_RE = /^\p{Lu}\p{Ll}{0,9}\.$/u;

const splitPeople = (value?: string) => splitList(value).filter((token) => !TITLE_RE.test(token));

const toMinutes = (value?: string): number => {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(padTime(value));
  if (!match) return Number.NaN; // normalize skips the row
  return Number(match[1]) * 60 + Number(match[2]);
};


// One backend row → one candidate entry. Extra backend fields
// ride along on the generic payload untouched.
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


// Every fetched row (all pages concatenated, when the query
// needed more than one) through mapping + the core gate: rows
// with unusable times/days come back as a skipped COUNT, and
// everything usable still renders
export function normalizeKnf(lessons: readonly KnfLesson[]): NormalizeResult<KnfLesson> {
  return normalizeEntries(lessons.map(toTimetableEntry));
}
