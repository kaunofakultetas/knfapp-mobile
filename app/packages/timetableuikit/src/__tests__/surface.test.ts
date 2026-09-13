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
      'ConflictBanner',
      'DEFAULT_SUBJECT_COLORS',
      'DayColumn',
      'DayStepper',
      'DayTabs',
      'DayTimeline',
      'FULL_MIN_HEIGHT',
      'HourAxis',
      'LessonCard',
      'LessonCell',
      'MEDIUM_MIN_HEIGHT',
      'NowLine',
      'TimetableProvider',
      'ViewModeSwitch',
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
