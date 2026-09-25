# Changelog

## Unreleased — 2026-09-25

The QA sweep over the schedule tab (audit KNF-174/175/184/185/186/187
and the 320 pt visual pass):

- Kinds: `kindName` / `kindBadge` (new exports) and `kinds` /
  `kindsShort` labels. Exam-like kinds wear a brand outline and a bold
  lead on the cell and a filled badge on the LessonCard; everyday kinds
  are named quietly (the cell's time line, the card's footer).
- Subgroups: `subgroups` / `subgroupsShort` labels; the cell's meta
  line and the card's footer name them.
- Narrow cells show the course's short code ("KT") when the longest
  word cannot fit — no more mid-word breaks in a 50 pt week column.
- `TodayButton` (new export): the snap-back pill for a host's strip
  row. DayStepper, DayTabs and TodayButton draw their visuals inside
  the Pressable's children function (a style FUNCTION is dropped on
  device); DayStepper's chevrons are 24 pt boxes with 12 pt of slop so
  a header title stays whole at 320 pt; DayTabs is a true 44 pt strip
  with an opt-out hairline (`bordered`).
- Empty notices sit over the TOP of the grid (EmptyNotice) with a
  host-overridable `emptyLabel`; they used to render 700+ px below.
- SnapPager pages take the frame's height too — on react-native-web
  a day page grew to its content and never scrolled.
- LessonCard: `status` chip (under way / countdown), `kind`,
  `subgroups`; brand TEXT uses `brandText`; the footer wraps; below
  360 pt the room chip moves under the teacher line.
- Labels: "lecture" wording in both languages, `ltPlural` byte-
  identical to its three twins (the `mod10 <= 9` clause restored),
  `inProgress` / `startsIn`; `dangerFill` theme slot for the banner's
  "!" disc; zero-padded fallback clock.

## 1.0.2 — 2026-09-01

- Dotted vertical hairlines between the week grid's day
  columns, painted behind the cells — a sparse week no longer
  reads as one day, and the dotted style keeps day boundaries
  visually apart from the solid hour lines. Drawn with the
  1px full-border trick, since Android paints nothing for a
  single-side dashed border.

## 1.0.1 — 2026-09-01

The adversarial review round before first wiring:

- `useNow` gained `{ enabled }` and both grids pass it: a
  host-supplied `now` (or `null`) starts NO interval, and a tick
  inside the same displayed minute returns the previous state object
  — the grid re-renders only when the minute turns.
- DayTimeline's auto-scroll waits for the measured width (it used to
  fire against a not-yet-laid-out list and clamp to 0), runs ONCE per
  shown day — a rebuilt-but-equal `placed` array no longer yanks the
  reader's scroll position — and still positions data that arrives
  after an empty first render.
- Custom `renderLesson` cells are absolutely positioned by the kit
  into the same frame the default cell gets; a flow-layout renderer
  no longer stacks at the column's top-left.
- `usePagePan`: a second finger abandons the gesture instead of
  corrupting the start point, and `enabled` is re-read on every move
  — flipping it false mid-drag cancels the commit. The claim
  distance, the exact commit boundary and custom thresholds are now
  unit-pinned.
- The subject palette parses `#rgb` shorthand and falls back to the
  plain surface on any color it cannot parse, instead of silently
  emitting a garbled hue.
- A host `formatTime` is pinned end-to-end into the cells and the
  hour axis.

## 1.0.0 — 2026-09-01

The timetable's face: presentational components over pre-placed
fraction geometry, themable and LT/EN labelled, with no gesture or
animation dependency anywhere in the tree.

- **WeekGrid** — Monday-first header with the today chip, hour axis,
  one column per visible day, horizontal swipe paging that reports a
  direction and nothing else. Integer day widths from `onLayout`.
- **DayTimeline** — one day, taller hours, auto-opens just above the
  first lesson, swipes between days.
- **LessonCell** — three pixel-height tiers with constant line
  counts; title-hashed subject pastels composited over the theme
  surface; the danger wash and a spoken note on conflicts; muted
  inert background blocks.
- **HourAxis / NowLine** — integer hour labels positioned by the same
  fractions as the cells; the now line gated to today AND the visible
  window, ticking half-minutely through `useNow`.
- **TimetableProvider** — theme (12 semantic colors, 4 font roles,
  derived text styles), LT/EN `defaultLabels` with declined plural
  notices, `formatTime`, all optional with neutral fallbacks.
- **usePagePan** — raw-responder paging: claims only a decisively
  horizontal drag, commits ONE page per gesture at 50px, never steals
  a tap or the vertical scroll.
- Export surface pinned by test; engine shapes mirrored structurally,
  never imported.
