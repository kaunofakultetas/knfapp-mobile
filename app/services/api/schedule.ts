// -----------------------------------------------------------
//  [*] API — schedule
//
//  The lecture timetable and its filter values. Times come as
//  plain "HH:MM" wall-clock strings (no timezone games here,
//  unlike chat) and dayOfWeek is 0=Monday … 6=Sunday.
//
//  Split into:
//
//    ScheduleLesson          — one timetable entry
//    ScheduleResponse        — filtered lesson list
//    ScheduleFiltersResponse — available groups + semesters
//    fetchSchedule           — lessons, optionally filtered
//    fetchScheduleWeek       — one semester, EVERY group and
//                              day, paged past the 500-row cap
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
//   - ScheduleResponse (below)
//   - app/(main)/tabs/schedule.tsx — day view + conflict checks
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
// ScheduleResponse
// -----------------------------------------------------------
//
// Rows arrive pre-sorted (day, start time, group) and capped
// at 500 per response — fetchScheduleWeek pages past the cap,
// fetchSchedule trusts one page to be enough once filtered.
//
// Used by:
//   - fetchSchedule (below)
//   - app/(main)/tabs/schedule.tsx — timetable state
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
//   - app/(main)/tabs/schedule.tsx — timetable load
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
//   - app/(main)/tabs/schedule.tsx — week/day timetable views
//     and the teacher picker
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
