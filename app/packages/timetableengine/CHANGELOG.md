# Changelog

## 1.0.1 — 2026-09-01

The adversarial review round over the fresh core, before any screen
consumed it. Behavior corrections, each pinned by a new test:

- `deriveWindow` ignores background blocks — a full-day holiday no
  longer stretches the axis to midnight; a blocks-only day keeps the
  default span. `padMin` and a custom ceiling are now exercised too.
- The packer clamps BOTH vertical ends into the window (a wholly-late
  entry pins at the bottom edge, never off canvas) and paints
  overlapping blocks in total-sort order — shuffled input now yields
  identical output for blocks as well.
- Conflicts never cross semesters in EITHER scope, and the advertised
  annotate stage exists: `annotateConflicts(placed, ids)` stamps
  `layout.isConflict` immutably, keeping calm objects identical for
  memoized cells. The group scope's advisory nature (a group label
  can bundle parallel subgroups) is documented rather than implied.
- `forTeacher` keys on the term too — the same weekly slot in two
  semesters stays two cards, groups never merging across terms.
- `nowState`: an overlapping already-started lesson surfaces as
  `next` with `minutesToNext: 0` instead of vanishing mid-overlap.
- `normalizeEntries` shape-checks `title` / `people` / `location`, so
  a malformed row skips itself at the door instead of crashing the
  sort or the conflict scan far from it.
- The KNF adapter folds academic titles ("Doc.", "Dr.") out of the
  teacher list — a titled lecturer is one person, not three — and
  documents the 500-row page contract: concatenate pages, then one
  `normalizeKnf` call.
- `WindowOptions` doc now says what the code and tests always did:
  the bounds are the default span, lessons widen past them.

## 1.0.0 — 2026-09-01

The headless timetable core, extracted battle-first: the algorithms a
university schedule actually needs, each pinned by an exact-number
test before any screen renders it.

- **Structural time** — lessons are day + wall-clock minutes with
  exclusive ends; dates exist only at `materializeWeek`, on UTC
  strings, immune to the mid-semester EET DST Sundays.
- **The packer** — sweep clustering (back-to-back never shares
  width), greedy first-fit columns, equal cluster widths, rightward
  span expansion, fraction output measured against the visible
  window; background blocks draw behind and claim nothing.
- **Per-entry degradation** — `normalizeEntries` / `normalizeKnf`
  drop only the unreadable rows and count them.
- **`deriveWindow`** — hour-snapped padding around the outermost
  lessons; the configured bounds are the default span and lessons
  only ever widen it, so the axis stays put while paging.
- **Conflicts** — exclusive endpoints, `group` scope (off without an
  active group filter; duplicates are data, not clashes) and `person`
  scope (a teacher double-booked across groups).
- **Perspectives** — `forGroup`, `listTeachers`, and `forTeacher`
  with cross-group dedupe merging `groupKeys`.
- **Semester keys** — `semesterRank` / `newestSemester` order
  `YYYY-R` (autumn) before `YYYY-P` (spring) inside an academic year.
- **KNF adapter** — the faculty's `GET /api/schedule` rows mapped
  defensively: unpadded times repaired, "TBA" skipped, extra fields
  riding the generic payload.
- Reserved dormant fields: `kind`, `parity`, `weeks` — shapes pinned,
  behavior inert until the data carries them.
