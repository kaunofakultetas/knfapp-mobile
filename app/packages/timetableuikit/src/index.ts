// -----------------------------------------------------------
//  [*] @knf/timetableuikit — public surface
//
//  Presentational timetable kit over pre-placed fraction
//  geometry: the week grid, the day timeline, their parts, and
//  the provider that themes and labels them. The engine's
//  shapes are MIRRORED, never imported — hand its results
//  straight in.
//
//  Used by:
//    - the mobile app's timetable screens
// -----------------------------------------------------------

export { TimetableProvider, useTimetableEnv, useTimetableLabels, useTimetableTheme } from './provider';
export { defaultTheme, resolveTheme } from './provider/theme';
export { defaultLabels } from './provider/labels';
export { DEFAULT_SUBJECT_COLORS, subjectTint } from './core/palette';
export { useNow } from './hooks/useNow';
export { usePagePan } from './hooks/usePagePan';

export { default as WeekGrid } from './WeekGrid';
export { default as DayTimeline } from './DayTimeline';
export { default as DayColumn } from './grid/DayColumn';
export { default as HourAxis, AXIS_WIDTH } from './grid/HourAxis';
export { default as LessonCell, FULL_MIN_HEIGHT, MEDIUM_MIN_HEIGHT } from './grid/LessonCell';
export { default as NowLine } from './grid/NowLine';

export type { WeekGridProps } from './WeekGrid';
export type { DayTimelineProps } from './DayTimeline';
export type { LessonFrame, LessonGeometry, PlacedLesson, TimeWindow, TimetableLesson } from './core/types';
export type { TimetableEnv } from './provider';
export type { TimetableColors, TimetableFonts, TimetableResolvedTheme, TimetableTextStyles, TimetableTheme } from './provider/theme';
export type { TimetableLabels } from './provider/labels';
export type { SubjectTint } from './core/palette';
export type { NowPoint } from './hooks/useNow';
export type { PagePanHandlers, PagePanOptions } from './hooks/usePagePan';
