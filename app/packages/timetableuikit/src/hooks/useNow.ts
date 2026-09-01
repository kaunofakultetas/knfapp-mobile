// -----------------------------------------------------------
//  [*] timetableuikit — useNow
//
//  The kit's only clock: today's day index (0 = Monday) and
//  the wall-clock minute, refreshed every HALF MINUTE — a
//  per-second re-render of a whole grid is a named production
//  anti-lesson, and a timetable's now line cannot show seconds
//  anyway. Components receive `now` as data; when the host
//  supplies its own (or null, an archived week) the grids pass
//  enabled: false and NO interval ever runs. Even enabled, a
//  tick that lands on the same displayed minute returns the
//  PREVIOUS state object, so React bails and nothing
//  re-renders until the minute actually turns.
//
//  Used by:
//    - WeekGrid.tsx / DayTimeline.tsx — the default clock
// -----------------------------------------------------------

import { useEffect, useState } from 'react';

export interface NowPoint {
  // 0 = Monday .. 6 = Sunday
  day: number;
  minutes: number;
}

const read = (): NowPoint => {
  const date = new Date();
  return { day: (date.getDay() + 6) % 7, minutes: date.getHours() * 60 + date.getMinutes() };
};


export interface UseNowOptions {
  intervalMs?: number;
  // false = the host brought its own clock; no interval runs
  enabled?: boolean;
}

export function useNow(options: UseNowOptions = {}): NowPoint {
  const { intervalMs = 30_000, enabled = true } = options;
  const [now, setNow] = useState<NowPoint>(read);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(
      () =>
        setNow((prev) => {
          const fresh = read();
          // Same displayed minute → same object → no re-render
          return prev.day === fresh.day && prev.minutes === fresh.minutes ? prev : fresh;
        }),
      intervalMs,
    );
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);

  return now;
}
