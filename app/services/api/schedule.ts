// -----------------------------------------------------------
//  [*] API — schedule
//
//  The lecture timetable and its filter values, all on REAL
//  dates: GET /schedule/events is the one lesson wire — the
//  legacy folded GET /schedule stays on the backend for old
//  builds, but this client no longer speaks it. Times come as
//  plain "HH:MM" wall-clock strings (no timezone games here,
//  unlike chat) and dayOfWeek is 0=Monday … 6=Sunday.
//
//  Split into:
//
//    ScheduleLesson          — the base lesson shape the cards
//                              render
//    ScheduleEventRow        — one DATED lecture instance
//    ScheduleEventsResponse  — dated event list
//    ScheduleFiltersResponse — groups + semesters + teachers
//    fetchScheduleEvents     — dated events for a date range,
//                              scoped by group or teacher
//    fetchScheduleFilters    — filter dropdown values
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';


// The backend caps a /schedule/events response at 500 rows —
// the events fetch pages with ?offset in steps of exactly this
const EVENTS_PAGE_LIMIT = 500;

// Fences a runaway backend: the events fetch never asks for
// more than this many pages (10 × 500 rows covers any window
// the 220-day range cap allows)
const EVENTS_MAX_PAGES = 10;







// -----------------------------------------------------------
// ScheduleLesson
// -----------------------------------------------------------
//
// The lesson fields every card renders. `group` and `semester`
// are the sheet's own labels, matched by EXACT string against
// the filter values — never normalized on either side.
//
// Used by:
//   - ScheduleEventRow (below) — the dated superset
//   - app/(main)/tabs/schedule.tsx — the card shape both
//     perspectives hand to LessonCard
// -----------------------------------------------------------

export interface ScheduleLesson {
  id: string;
  title: string;
  teacher: string;
  room: string;
  timeStart: string; // "HH:MM"
  timeEnd: string;   // "HH:MM"
  dayOfWeek: number; // 0=Monday..6=Sunday
  group: string;
  semester: string;
}







// -----------------------------------------------------------
// ScheduleEventRow
// -----------------------------------------------------------
//
// One DATED lecture instance — a superset of ScheduleLesson
// with the real calendar date on it, so an irregular one-off
// lecture is a row on its own date instead of a phantom
// weekly pattern. dayOfWeek is server-derived from the date
// (0=Monday) so every client agrees on it. A lecture shared
// by several groups arrives once PER GROUP under the SAME id
// — consumers merge by id when they want one card.
//
// Used by:
//   - ScheduleEventsResponse (below)
//   - app/(main)/tabs/schedule.tsx — both perspectives' rows
// -----------------------------------------------------------

export interface ScheduleEventRow extends ScheduleLesson {
  date: string;        // "YYYY-MM-DD"
  lectureType: string; // '' when the source has none
}







// -----------------------------------------------------------
// ScheduleEventsResponse
// -----------------------------------------------------------
//
// Rows arrive pre-sorted (date, start time, group) and capped
// at 500 per response — fetchScheduleEvents pages past the
// cap and concatenates in order.
//
// Used by:
//   - fetchScheduleEvents (below)
//   - app/(main)/tabs/schedule.tsx — dated week state
// -----------------------------------------------------------

export interface ScheduleEventsResponse {
  events: ScheduleEventRow[];
}







// -----------------------------------------------------------
// ScheduleFiltersResponse
// -----------------------------------------------------------
//
// Only what the pickers read — the wire answer also carries
// `days` and `semesterGroups`, dropped here. groups arrive
// sorted; semesters newest first, with stray one-off labels
// already filtered out server-side; teachers casefold-sorted
// display strings, each an EXACT ?teacher= value.
//
// Used by:
//   - fetchScheduleFilters (below)
//   - app/(main)/tabs/schedule.tsx — group/teacher/semester
//     pickers (the teacher roster lists these names verbatim)
// -----------------------------------------------------------

export interface ScheduleFiltersResponse {
  groups: string[];
  semesters: string[];
  teachers: string[];
}







// -----------------------------------------------------------
// fetchScheduleEvents
// -----------------------------------------------------------
//
//   fetchScheduleEvents('2026-03-02', '2026-03-08')            — everyone's week
//   fetchScheduleEvents('2026-03-02', '2026-03-08', 'IS-1')    — one group's week
//   fetchScheduleEvents('2026-03-02', '2026-03-08',
//                       undefined, 'Eimantas Rebždys, Lekt.')  — one teacher's week,
//                                                                across every group
//
// Inclusive ISO date bounds; the backend caps a range at 220
// days. The teacher value is the filters response's display
// string, matched EXACTLY server-side. Pages past the 500-row
// cap — one group's or teacher's week is a single short page,
// the all-groups week is not.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the one loader behind
//     both perspectives
// -----------------------------------------------------------

export const fetchScheduleEvents = async (
  from: string, to: string, group?: string, teacher?: string,
): Promise<ScheduleEventsResponse> => {
  const events: ScheduleEventRow[] = [];
  for (let page = 0; page < EVENTS_MAX_PAGES; page++) {
    const resp = await request(
      api.get<ScheduleEventsResponse>('/schedule/events', {
        params: {
          from,
          to,
          limit: EVENTS_PAGE_LIMIT,
          offset: page * EVENTS_PAGE_LIMIT,
          ...(group ? { group } : {}),
          ...(teacher ? { teacher } : {}),
        },
      }),
    );
    events.push(...resp.events);
    if (resp.events.length < EVENTS_PAGE_LIMIT) break;
  }
  return { events };
};







// -----------------------------------------------------------
// fetchScheduleFilters
// -----------------------------------------------------------
//
// GET /schedule/filters without a ?semester scope, so the
// groups list spans EVERY semester — the screen uses it to
// reset a remembered group that vanished from the timetable,
// and its teachers list is the whole roster the teacher
// picker searches.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — filter options load
// -----------------------------------------------------------

export const fetchScheduleFilters = () =>
  request(api.get<ScheduleFiltersResponse>('/schedule/filters'));
