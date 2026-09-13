// -----------------------------------------------------------
//  [*] timetableuikit — provider
//
//  The single seam between the kit and its host: one context
//  carrying the theme, the labels, the locale, and how a
//  wall-clock minute becomes a printed time. Mount
//  TimetableProvider above any kit component; with none
//  mounted the hooks answer neutral defaults (defaultTheme,
//  English labels, a plain H:mm formatter), so tests and demos
//  need no ceremony.
//
//  Split into:
//
//    TimetableEnv       — what the context carries
//    TimetableProvider  — the host mounts it once
//    useTimetableTheme / useTimetableLabels / useTimetableEnv
//                       — what components read
// -----------------------------------------------------------

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { defaultLabels, type TimetableLabels } from './labels';
import { defaultTheme, resolveTheme, type TimetableResolvedTheme, type TimetableTheme } from './theme';


// What the hooks answer with NO provider mounted — neutral
// theme, English labels, plain H:mm times. Reads
// fallbackFormatTime below at module init, which is a hoisted
// function declaration for exactly that reason
const defaultEnv: TimetableEnv = {
  theme: resolveTheme(defaultTheme),
  labels: defaultLabels.en,
  locale: 'en',
  formatTime: fallbackFormatTime,
};

// Defaulted, never null — provider-less reads are supported
// by design (tests, demos)
const TimetableContext = createContext<TimetableEnv>(defaultEnv);







// -----------------------------------------------------------
// TimetableEnv
// -----------------------------------------------------------
//
// What the context carries — everything a kit component needs
// from its host.
//
// Used by:
//   - TimetableProvider and the hooks (below)
//   - WeekGrid / DayTimeline / HourAxis / LessonCell / NowLine
//     — through useTimetableEnv
// -----------------------------------------------------------

export interface TimetableEnv {
  theme: TimetableResolvedTheme;
  labels: TimetableLabels;
  // BCP-47 tag — picks the default label set
  locale: string;
  // Wall-clock minutes → the printed time (axis, cells)
  formatTime: (minutes: number) => string;
}







// -----------------------------------------------------------
// fallbackFormatTime
// -----------------------------------------------------------
//
// 545 → "9:05" — the provider-less fallback. A hoisted
// `function` declaration ON PURPOSE: defaultEnv at the top of
// the file reads it at module evaluation, and a const arrow
// there would throw before the module finished loading.
//
// Used by:
//   - defaultEnv (above)
// -----------------------------------------------------------

function fallbackFormatTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(minutes)));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
}







// -----------------------------------------------------------
// TimetableProvider
// -----------------------------------------------------------
//
// Every field is optional and falls back to the default env,
// so a host may start with just a theme. A partial labels
// object merges over the locale's own set — a host overrides
// two strings, not twenty. Hand in stable objects: the value
// is memoised on its parts.
//
// Used by:
//   - the host app, once, above its timetable screens
// -----------------------------------------------------------

export function TimetableProvider({
  theme,
  labels,
  locale,
  formatTime,
  children,
}: {
  theme?: TimetableTheme;
  labels?: Partial<TimetableLabels>;
  locale?: string;
  formatTime?: (minutes: number) => string;
  children: ReactNode;
}) {

  const resolvedTheme = useMemo(() => (theme ? resolveTheme(theme) : defaultEnv.theme), [theme]);

  const resolvedLabels = useMemo<TimetableLabels>(() => {
    const base = (locale ?? defaultEnv.locale).toLowerCase().startsWith('lt') ? defaultLabels.lt : defaultLabels.en;
    return labels ? { ...base, ...labels } : base;
  }, [labels, locale]);

  const value = useMemo<TimetableEnv>(
    () => ({
      theme: resolvedTheme,
      labels: resolvedLabels,
      locale: locale ?? defaultEnv.locale,
      formatTime: formatTime ?? defaultEnv.formatTime,
    }),
    [resolvedTheme, resolvedLabels, locale, formatTime],
  );

  return <TimetableContext.Provider value={value}>{children}</TimetableContext.Provider>;
}







// -----------------------------------------------------------
// useTimetableTheme
// -----------------------------------------------------------
//
// Used by:
//   - every kit component that paints — cells, chrome, grids
// -----------------------------------------------------------

export function useTimetableTheme(): TimetableResolvedTheme {
  return useContext(TimetableContext).theme;
}







// -----------------------------------------------------------
// useTimetableLabels
// -----------------------------------------------------------
//
// Used by:
//   - every kit component that speaks — chrome copy and
//     accessibility labels
// -----------------------------------------------------------

export function useTimetableLabels(): TimetableLabels {
  return useContext(TimetableContext).labels;
}







// -----------------------------------------------------------
// useTimetableEnv
// -----------------------------------------------------------
//
// Used by:
//   - components needing the locale or formatTime alongside
//     the theme — HourAxis, LessonCell, NowLine, the grids
// -----------------------------------------------------------

export function useTimetableEnv(): TimetableEnv {
  return useContext(TimetableContext);
}
