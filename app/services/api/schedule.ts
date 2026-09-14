// -----------------------------------------------------------
//  [*] API — schedule
//
//  The lecture timetable and its filter values. Times come as
//  plain "HH:MM" wall-clock strings (no timezone games here,
//  unlike chat) and dayOfWeek is 0=Monday … 6=Sunday.
//
//  Split into:
//
//    ScheduleLesson          — one weekly-pattern entry (the
//                              legacy folded shape)
//    ScheduleEventRow        — one DATED lecture instance
//    ScheduleResponse        — filtered lesson list
//    ScheduleEventsResponse  — dated event list
//    ScheduleFiltersResponse — available groups + semesters
//    fetchSchedule           — lessons, optionally filtered
//    fetchScheduleWeek       — one semester, EVERY group and
//                              day, paged past the 500-row cap
//    fetchScheduleEvents     — dated events for a date range
//    fetchScheduleFilters    — filter dropdown values
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';


// The backend caps a /schedule response at 500 rows — the week
// fetch pages with ?offset in steps of exactly this
const WEEK_PAGE_LIMIT = 500;

// Fences a runaway backend: the week fetch never asks for more
// than this many pages (10 × 500 rows covers any real semester)
const WEEK_MAX_PAGES = 10;







// -----------------------------------------------------------
// ScheduleLesson
// -----------------------------------------------------------
//
// One scraped timetable row. `group` and `semester` are the
// sheet's own labels, matched by EXACT string against the
// filter values — never normalized on either side.
//
// Used by:
//   - ScheduleEventRow / ScheduleResponse (below)
//   - app/(main)/tabs/schedule.tsx — teacher cards + conflict
//     checks (dated rows pass wherever this shape is asked)
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
// (0=Monday) so every client agrees on it.
//
// Used by:
//   - ScheduleEventsResponse (below)
//   - app/(main)/tabs/schedule.tsx — the dated week views
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
// cap the same way the week fetch does.
//
// Used by:
//   - fetchScheduleEvents (below)
//   - app/(main)/tabs/schedule.tsx — dated week state
// -----------------------------------------------------------

export interface ScheduleEventsResponse {
  events: ScheduleEventRow[];
}







// -----------------------------------------------------------
// ScheduleResponse
// -----------------------------------------------------------
//
// Rows arrive pre-sorted (day, start time, group) and capped
// at 500 per response — fetchScheduleWeek pages past the cap,
// fetchSchedule trusts one page to be enough once filtered.
//
// Used by:
//   - fetchSchedule / fetchScheduleWeek (below)
//   - app/(main)/tabs/schedule.tsx — the teacher week state
// -----------------------------------------------------------

export interface ScheduleResponse {
  lessons: ScheduleLesson[];
}







// -----------------------------------------------------------
// ScheduleFiltersResponse
// -----------------------------------------------------------
//
// Only what the pickers read — the wire answer also carries
// `days` and `semesterGroups`, dropped here. groups arrive
// sorted; semesters newest first, with stray one-off labels
// already filtered out server-side.
//
// Used by:
//   - fetchScheduleFilters (below)
//   - app/(main)/tabs/schedule.tsx — group/semester pickers
// -----------------------------------------------------------

export interface ScheduleFiltersResponse {
  groups: string[];
  semesters: string[];
}







// -----------------------------------------------------------
// fetchSchedule
// -----------------------------------------------------------
//
//   fetchSchedule()               — the whole timetable
//   fetchSchedule(0, 'IT-3')      — Monday of one group
//
// Used by:
//   - no screen since the dated events path took over the
//     group perspective — kept while the legacy folded
//     GET /schedule stays on the wire
// -----------------------------------------------------------

export const fetchSchedule = (day?: number, group?: string, semester?: string) =>
  request(
    api.get<ScheduleResponse>('/schedule', {
      params: {
        ...(day !== undefined ? { day } : {}),
        ...(group ? { group } : {}),
        ...(semester ? { semester } : {}),
      },
    }),
  );







// -----------------------------------------------------------
// fetchScheduleWeek
// -----------------------------------------------------------
//
// The whole weekly timetable of one semester — every group,
// every day — for the timetable views and the teacher
// perspective, which needs a teacher's lessons ACROSS groups.
// The backend caps a response at 500 rows and a semester holds
// more, so this pages with ?offset until a short page says the
// table is done; the page cap only fences a runaway backend.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the TEACHER perspective
//     (all its view modes) and the teacher picker's roster
// -----------------------------------------------------------

export const fetchScheduleWeek = async (semester?: string): Promise<ScheduleResponse> => {
  const lessons: ScheduleLesson[] = [];
  for (let page = 0; page < WEEK_MAX_PAGES; page++) {
    const resp = await request(
      api.get<ScheduleResponse>('/schedule', {
        params: {
          limit: WEEK_PAGE_LIMIT,
          offset: page * WEEK_PAGE_LIMIT,
          ...(semester ? { semester } : {}),
        },
      }),
    );
    lessons.push(...resp.lessons);
    if (resp.lessons.length < WEEK_PAGE_LIMIT) break;
  }
  return { lessons };
};







// -----------------------------------------------------------
// fetchScheduleEvents
// -----------------------------------------------------------
//
//   fetchScheduleEvents('2026-03-02', '2026-03-08')          — everyone's week
//   fetchScheduleEvents('2026-03-02', '2026-03-08', 'IS-1')  — one group's week
//
// Inclusive ISO date bounds; the backend caps a range at 220
// days. Pages past the 500-row cap like fetchScheduleWeek —
// one group's week is a single short page, the all-groups
// week is not.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the dated week views
// -----------------------------------------------------------

export const fetchScheduleEvents = async (
  from: string, to: string, group?: string,
): Promise<ScheduleEventsResponse> => {
  const events: ScheduleEventRow[] = [];
  for (let page = 0; page < WEEK_MAX_PAGES; page++) {
    const resp = await request(
      api.get<ScheduleEventsResponse>('/schedule/events', {
        params: {
          from,
          to,
          limit: WEEK_PAGE_LIMIT,
          offset: page * WEEK_PAGE_LIMIT,
          ...(group ? { group } : {}),
        },
      }),
    );
    events.push(...resp.events);
    if (resp.events.length < WEEK_PAGE_LIMIT) break;
  }
  return { events };
};







// -----------------------------------------------------------
// fetchScheduleFilters
// -----------------------------------------------------------
//
// GET /schedule/filters without a ?semester scope, so the
// groups list spans EVERY semester — the screen uses it to
// reset a remembered group that vanished from the timetable.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — filter options load
// -----------------------------------------------------------

export const fetchScheduleFilters = () =>
  request(api.get<ScheduleFiltersResponse>('/schedule/filters'));
