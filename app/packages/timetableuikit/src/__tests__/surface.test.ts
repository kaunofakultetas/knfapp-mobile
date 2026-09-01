// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
// -----------------------------------------------------------

import * as pkg from '../index';

describe('@knf/timetableuikit surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'AXIS_WIDTH',
      'DEFAULT_SUBJECT_COLORS',
      'DayColumn',
      'DayTimeline',
      'FULL_MIN_HEIGHT',
      'HourAxis',
      'LessonCell',
      'MEDIUM_MIN_HEIGHT',
      'NowLine',
      'TimetableProvider',
      'WeekGrid',
      'defaultLabels',
      'defaultTheme',
      'resolveTheme',
      'subjectTint',
      'useNow',
      'usePagePan',
      'useTimetableEnv',
      'useTimetableLabels',
      'useTimetableTheme',
    ]);
  });
});
