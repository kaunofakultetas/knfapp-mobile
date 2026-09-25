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
//  re-renders until the minute actually turns. A clock
//  switched ON (back to this week after browsing another)
//  reads the wall clock at once — its last sample may be
//  hours old, and the now line must not sit there for the
//  next half minute.
//
//  Used by:
//    - WeekGrid.tsx / DayTimeline.tsx — the default clock
// -----------------------------------------------------------

import { useEffect, useState } from 'react';







// -----------------------------------------------------------
// NowPoint
// -----------------------------------------------------------
//
// One clock sample in the kit's own coordinates — the shape
// the grids consume as plain data.
//
// Used by:
//   - read / useNow (below)
//   - WeekGrid.tsx / DayTimeline.tsx — the now prop
// -----------------------------------------------------------

export interface NowPoint {
  // 0 = Monday .. 6 = Sunday
  day: number;
  minutes: number;
}







// -----------------------------------------------------------
// read
// -----------------------------------------------------------
//
// One clock sample, in the kit's own coordinates (Monday-
// first day, wall-clock minutes).
//
// Used by:
//   - useNow (below) — the initial state and every tick
// -----------------------------------------------------------

const read = (): NowPoint => {
  const date = new Date();
  return { day: (date.getDay() + 6) % 7, minutes: date.getHours() * 60 + date.getMinutes() };
};







// -----------------------------------------------------------
// UseNowOptions
// -----------------------------------------------------------
//
// The clock's two knobs: intervalMs is the tick cadence
// (default 30 s); enabled: false runs no interval at all —
// the hook then answers its mount-time sample forever.
//
// Used by:
//   - useNow (below)
//   - WeekGrid.tsx / DayTimeline.tsx — pass { enabled } when
//     the host brought its own clock
// -----------------------------------------------------------

export interface UseNowOptions {
  intervalMs?: number;
  // false = the host brought its own clock; no interval runs
  enabled?: boolean;
}







// -----------------------------------------------------------
// useNow
// -----------------------------------------------------------
//
//   useNow()                          — tick every 30 s
//   useNow({ intervalMs })            — a custom cadence
//   useNow({ enabled: false })        — no interval at all;
//                                       answers the mount-time
//                                       sample
//
// Used by:
//   - WeekGrid.tsx / DayTimeline.tsx — the default clock
// -----------------------------------------------------------

export function useNow(options: UseNowOptions = {}): NowPoint {
  const { intervalMs = 30_000, enabled = true } = options;
  const [now, setNow] = useState<NowPoint>(read);

  useEffect(() => {
    if (!enabled) return undefined;
    // Same displayed minute → same object → no re-render
    const tick = () =>
      setNow((prev) => {
        const fresh = read();
        return prev.day === fresh.day && prev.minutes === fresh.minutes ? prev : fresh;
      });
    // Switching the clock on is the event: a stale sample is
    // replaced at once, never half a minute later
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);

  return now;
}
