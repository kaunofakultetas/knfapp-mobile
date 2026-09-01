# timetableuikit

A presentational university timetable kit for Expo / React Native: a
week grid, a single-day timeline, an hour axis, tiered lesson cells
with per-subject pastels, the now line, and conflict marks. The kit
renders the geometry it is handed and calls back on every intent —
placement, windows, conflicts and perspectives come from the host's
logic (in this repo `@knf/timetableengine`, whose `PlacedEntry` rows
are structurally this kit's `PlacedLesson`; the shapes are MIRRORED,
never imported, so either package upgrades alone).

Plain React Native only: no gesture library, no animation library.
Week/day paging runs on the raw responder system (`usePagePan`), and
the clock ticks half-minutely (`useNow`) — never per second.

```tsx
import { TimetableProvider, WeekGrid } from '@knf/timetableuikit';

<TimetableProvider
  theme={{ colors, fonts }}   // 12 semantic color tokens + 4 font families (see theme.ts)
  locale="lt"                 // picks defaultLabels.lt; labels={} overrides single strings
  formatTime={min => '9:05'}  // wall-clock minutes → printed time
>
  <WeekGrid
    days={placedDays}         // 7 pre-placed buckets, Monday first
    window={window}
    now={isThisWeek ? undefined : null}   // undefined = kit's own clock, null = silence
    onChangeWeek={dir => setAnchor(a => addWeeks(a, dir))}
    onPressLesson={openLesson}
  />
</TimetableProvider>
```

Every provider field is optional and falls back to neutral defaults
(a system-font light palette, English labels, an `H:mm` formatter), so
tests and demos need no ceremony.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the structural mirrors), `palette.ts` (title-hashed subject pastels, composited numerically over the theme surface) |
| `provider/` | The host seam: `TimetableProvider` + `useTimetable*` hooks, `theme.ts`, `labels.ts` (LT/EN, Monday-first day names) |
| `hooks/` | `useNow` (the half-minute clock), `usePagePan` (horizontal paging on the raw responder system) |
| `grid/` | `HourAxis`, `NowLine`, `LessonCell`, `DayColumn` |
| root | `WeekGrid.tsx`, `DayTimeline.tsx`, `index.ts` (the pinned surface) |

## Controlled, measured, tiered

Both roots are FULLY CONTROLLED: a swipe reports `+1`/`-1` and the
host moves its own cursor, so deep links, persistence and the host's
own pager all stay possible. Day columns take an INTEGER pixel width
measured through `onLayout` — fraction geometry over fractional
widths shimmers 1px seams; integers do not. Cells degrade by pixel
height through three tiers (full / medium / short) with a CONSTANT
`numberOfLines` per tier, and a 15-minute sliver still renders.

The now line draws only in today's column and only while the minute
falls inside the visible window; passing `now={null}` (or your own
`now`) silences the clock entirely — no interval even runs, and the
kit's own clock only re-renders when the displayed minute turns.

A custom `renderLesson` swaps the cell's face, not its place: the kit
absolutely positions the wrapper into the same frame the default cell
gets, so a plain flow-layout renderer lands exactly where the lesson
belongs. DayTimeline auto-scrolls to the first lesson once per shown
day — after the width is measured, again when the day changes or its
lessons first arrive, and never on an ordinary host re-render.

## Tests

`npm test` inside the package (or the host's root jest run) — pinned
frame integers from measured widths, tier thresholds, now-line gating,
paging (claim / commit-once / cancel), LT/EN label parity, and the
export surface.
