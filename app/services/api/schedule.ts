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







// -----------------------------------------------------------
// ScheduleLesson
// -----------------------------------------------------------
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

const WEEK_PAGE_LIMIT = 500;
const WEEK_MAX_PAGES = 10;

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
// Used by:
//   - app/(main)/tabs/schedule.tsx — filter options load
// -----------------------------------------------------------

export const fetchScheduleFilters = () =>
  request(api.get<ScheduleFiltersResponse>('/schedule/filters'));
