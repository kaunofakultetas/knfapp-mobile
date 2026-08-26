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
// fetchScheduleFilters
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — filter options load
// -----------------------------------------------------------

export const fetchScheduleFilters = () =>
  request(api.get<ScheduleFiltersResponse>('/schedule/filters'));
