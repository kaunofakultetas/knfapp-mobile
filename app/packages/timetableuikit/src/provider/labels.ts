// -----------------------------------------------------------
//  [*] timetableuikit — labels
//
//  Every string the kit shows, one object through the
//  provider. Day names are MONDAY-FIRST in both languages —
//  the same 0..6 indexing the lessons carry, so a day name is
//  always labels.dayShort[lesson.day], never an offset dance.
//  defaultLabels ships Lithuanian and English sets so the kit
//  is usable with no catalog at all.
//
//  Used by:
//    - provider/index.tsx — resolution and the fallback
//    - WeekGrid / DayTimeline / LessonCell — the strings
// -----------------------------------------------------------

export interface TimetableLabels {
  // Monday-first, 7 entries each
  dayShort: string[];
  dayLong: string[];
  today: string;
  // An empty day / week
  noLessons: string;
  // The degradation notice — data dropped by the normalizer
  lessonsSkipped: (count: number) => string;
  // Appended to a clashing cell's accessibility label
  conflict: string;
  // The now line's accessibility label
  nowLine: string;
  // The header caption for an ISO week
  weekNumber: (week: number) => string;
}


// 1 įrašas / 2–9 įrašai / 10–20, 30… įrašų
const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && (mod100 < 11 || mod100 > 19)) return few;
  return other;
};


export const defaultLabels: { lt: TimetableLabels; en: TimetableLabels } = {
  lt: {
    dayShort: ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'],
    dayLong: ['Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis', 'Sekmadienis'],
    today: 'Šiandien',
    noLessons: 'Paskaitų nėra',
    lessonsSkipped: (count) =>
      ltPlural(
        count,
        `${count} tvarkaraščio įrašo nepavyko perskaityti`,
        `${count} tvarkaraščio įrašų nepavyko perskaityti`,
        `${count} tvarkaraščio įrašų nepavyko perskaityti`,
      ),
    conflict: 'Persidengia su kita paskaita',
    nowLine: 'Dabar',
    weekNumber: (week) => `${week} savaitė`,
  },
  en: {
    dayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    today: 'Today',
    noLessons: 'No lessons',
    lessonsSkipped: (count) => (count === 1 ? '1 timetable entry could not be read' : `${count} timetable entries could not be read`),
    conflict: 'Overlaps another lesson',
    nowLine: 'Now',
    weekNumber: (week) => `Week ${week}`,
  },
};
