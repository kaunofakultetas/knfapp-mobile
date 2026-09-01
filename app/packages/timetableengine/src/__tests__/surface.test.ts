// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
// -----------------------------------------------------------

import * as pkg from '../index';

describe('@knf/timetableengine surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'DAY_MINUTES',
      'DAY_MS',
      'annotateConflicts',
      'buildWeek',
      'compareEntries',
      'conflictIds',
      'deriveWindow',
      'forGroup',
      'forTeacher',
      'formatMinutes',
      'isoWeekNumber',
      'listTeachers',
      'materializeWeek',
      'mondayOf',
      'newestSemester',
      'normalizeEntries',
      'normalizeKnf',
      'nowState',
      'parseISO',
      'parseTimeToMinutes',
      'placeDay',
      'posToSlot',
      'semesterRank',
      'toISO',
      'toTimetableEntry',
      'visibleDays',
    ]);
  });
});
