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
//  In the KNF app THIS file is the one source of the
//  timetable chrome's copy: the host (TimetableHost) passes
//  no labels, so a day name, a view-mode name or the overlap
//  banner is edited here — the app's i18n catalogs carry no
//  twin of any of them (the dead schedule.day*/view*/
//  conflict* copies were removed, KNF-185). Both sets say
//  "lecture"/"paskaita" throughout, the word the app's own
//  screens use.
//
//  Used by:
//    - provider/index.tsx — resolution and the fallback
//    - WeekGrid / DayTimeline / LessonCell — the strings
//    - components/schedule/LessonSheet.tsx — kinds and
//      subgroups on the detail sheet
// -----------------------------------------------------------







// -----------------------------------------------------------
// TimetableLabels
// -----------------------------------------------------------
//
// The full catalog contract — a host overrides any subset,
// the provider merges it over the locale's own set.
//
// Used by:
//   - defaultLabels (below) — the two shipped sets
//   - provider/index.tsx — resolution and useTimetableLabels
//   - the grids and chrome — every string they show
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
  // DayStepper's chevron accessibility labels
  prevDay: string;
  nextDay: string;
  // ViewModeSwitch's three modes
  viewList: string;
  viewDay: string;
  viewWeek: string;
  // LessonCard's clash chip — short, it sits in a bordered pill
  conflictBadge: string;
  // ConflictBanner's summary line
  conflictsOverlap: (count: number) => string;
  // Event kinds by the engine's canonical code — the name a
  // detail row prints and, for the badge kinds (core/kinds),
  // the badge on cards and cells; the short forms lead a
  // narrow grid cell's time line
  kinds: Record<string, string>;
  kindsShort: Record<string, string>;
  // The subgroups an entry names — "1 pogrupis" on a card,
  // the compact form inside a grid cell
  subgroups: (keys: readonly string[]) => string;
  subgroupsShort: (keys: readonly string[]) => string;
  // LessonCard's live status chip: the lecture under way, and
  // how soon the next one starts (whole minutes)
  inProgress: string;
  startsIn: (minutes: number) => string;
}







// -----------------------------------------------------------
// defaultLabels
// -----------------------------------------------------------
//
// The two shipped catalogs, Lithuanian and English.
//
// Used by:
//   - provider/index.tsx — the locale pick and the
//     provider-less fallback
// -----------------------------------------------------------

export const defaultLabels: { lt: TimetableLabels; en: TimetableLabels } = {
  lt: {
    dayShort: ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'],
    dayLong: ['Pirmadienis', 'Antradienis', 'Trečiadienis', 'Ketvirtadienis', 'Penktadienis', 'Šeštadienis', 'Sekmadienis'],
    today: 'Šiandien',
    // Word for word the app's own "no lectures" — the list view
    // and the grid say one thing
    noLessons: 'Nėra paskaitų',
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
    prevDay: 'Ankstesnė diena',
    nextDay: 'Kita diena',
    viewList: 'Sąrašas',
    viewDay: 'Diena',
    viewWeek: 'Savaitė',
    conflictBadge: 'Persidengimas',
    conflictsOverlap: (count) =>
      ltPlural(
        count,
        `${count} paskaita persidengia laiku`,
        `${count} paskaitos persidengia laiku`,
        `${count} paskaitų persidengia laiku`,
      ),
    kinds: {
      lecture: 'Paskaita',
      practice: 'Pratybos',
      seminar: 'Seminaras',
      lab: 'Laboratoriniai darbai',
      lecture_seminar: 'Paskaitos ir seminarai',
      lecture_practice: 'Paskaitos ir pratybos',
      exam: 'Egzaminas',
      retake: 'Perlaikymas',
      assessment: 'Atsiskaitymas',
      consultation: 'Konsultacija',
    },
    kindsShort: {
      lecture: 'Pask.',
      practice: 'Prat.',
      seminar: 'Sem.',
      lab: 'Lab.',
      lecture_seminar: 'Pask. ir sem.',
      lecture_practice: 'Pask. ir prat.',
      exam: 'Egz.',
      retake: 'Perl.',
      assessment: 'Ats.',
      consultation: 'Kons.',
    },
    // "1 pogrupis", "1, 2 pogrupiai" — the count of subgroups
    // decides the noun, never the numbers in it
    subgroups: (keys) => (keys.length === 1 ? `${keys[0]} pogrupis` : `${keys.join(', ')} pogrupiai`),
    subgroupsShort: (keys) => `${keys.join(', ')} pogr.`,
    inProgress: 'Vyksta dabar',
    // "Po 25 min.", "Po 1 val. 30 min." — abbreviations need no
    // plural forms
    startsIn: (minutes) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (hours === 0) return `Po ${minutes} min.`;
      return rest === 0 ? `Po ${hours} val.` : `Po ${hours} val. ${rest} min.`;
    },
  },
  en: {
    dayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dayLong: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    today: 'Today',
    noLessons: 'No lectures',
    lessonsSkipped: (count) => (count === 1 ? '1 timetable entry could not be read' : `${count} timetable entries could not be read`),
    conflict: 'Overlaps another lecture',
    nowLine: 'Now',
    weekNumber: (week) => `Week ${week}`,
    prevDay: 'Previous day',
    nextDay: 'Next day',
    viewList: 'List',
    viewDay: 'Day',
    viewWeek: 'Week',
    conflictBadge: 'Overlap',
    conflictsOverlap: (count) =>
      count === 1 ? '1 lecture overlaps in time' : `${count} lectures overlap in time`,
    kinds: {
      lecture: 'Lecture',
      practice: 'Practical',
      seminar: 'Seminar',
      lab: 'Lab work',
      lecture_seminar: 'Lectures and seminars',
      lecture_practice: 'Lectures and practicals',
      exam: 'Exam',
      retake: 'Retake',
      assessment: 'Assessment',
      consultation: 'Consultation',
    },
    kindsShort: {
      lecture: 'Lec.',
      practice: 'Prac.',
      seminar: 'Sem.',
      lab: 'Lab',
      lecture_seminar: 'Lec. & sem.',
      lecture_practice: 'Lec. & prac.',
      exam: 'Exam',
      retake: 'Retake',
      assessment: 'Test',
      consultation: 'Cons.',
    },
    subgroups: (keys) => (keys.length === 1 ? `Subgroup ${keys[0]}` : `Subgroups ${keys.join(', ')}`),
    subgroupsShort: (keys) => `Sub. ${keys.join(', ')}`,
    inProgress: 'In progress',
    startsIn: (minutes) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (hours === 0) return `In ${minutes} min`;
      return rest === 0 ? `In ${hours} h` : `In ${hours} h ${rest} min`;
    },
  },
};







// -----------------------------------------------------------
// ltPlural
// -----------------------------------------------------------
//
// 1 įrašas / 2–9 įrašai / 10–20, 30… įrašų. Only ever called
// once a catalog closure runs, so it may live below the
// catalogs. The body is BYTE-IDENTICAL to the chat, social
// and wayfind kits' copies (KNF-187): this one had lost the
// `mod10 <= 9` guard, harmless for whole counts and wrong for
// 9.5 ("few" where the others say "other"). Keep the four in
// step until they share one module; the boundary table in
// provider/__tests__ pins this copy.
//
// Used by:
//   - defaultLabels (above) — the Lithuanian counters
// -----------------------------------------------------------

const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return few;
  return other;
};
