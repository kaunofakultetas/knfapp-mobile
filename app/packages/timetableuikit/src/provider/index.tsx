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


export interface TimetableEnv {
  theme: TimetableResolvedTheme;
  labels: TimetableLabels;
  // BCP-47 tag — picks the default label set
  locale: string;
  // Wall-clock minutes → the printed time (axis, cells)
  formatTime: (minutes: number) => string;
}


// 545 → "9:05" — the provider-less fallback
const fallbackFormatTime = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(minutes)));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
};

const defaultEnv: TimetableEnv = {
  theme: resolveTheme(defaultTheme),
  labels: defaultLabels.en,
  locale: 'en',
  formatTime: fallbackFormatTime,
};

const TimetableContext = createContext<TimetableEnv>(defaultEnv);







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
// useTimetableTheme / useTimetableLabels / useTimetableEnv
// -----------------------------------------------------------
//
// Used by:
//   - every kit component
// -----------------------------------------------------------

export function useTimetableTheme(): TimetableResolvedTheme {
  return useContext(TimetableContext).theme;
}

export function useTimetableLabels(): TimetableLabels {
  return useContext(TimetableContext).labels;
}

export function useTimetableEnv(): TimetableEnv {
  return useContext(TimetableContext);
}
