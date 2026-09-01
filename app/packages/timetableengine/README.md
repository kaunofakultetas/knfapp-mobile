# timetableengine

Headless university timetable logic for any JS host — normalize raw
schedule rows, pack overlapping lessons into exact column geometry,
derive the visible hour window, bucket the week, find conflicts, and
switch between the student and the teacher perspective. Zero runtime
dependencies, zero React: every export is a pure function over plain
objects, so the engine runs the same in a component, a worker, or a
test.

The domain lives in integers. A lesson is a WEEKLY SLOT — a day index
(0 = Monday .. 6 = Sunday) and wall-clock minutes since 00:00 with an
EXCLUSIVE end — never a pair of Dates. Concrete dates exist only at one
edge (`materializeWeek`), computed on UTC-normalized `YYYY-MM-DD`
strings, so the EET DST switches in late March and late October —
mid-semester Sundays — can never duplicate or skip a day.

```ts
import { deriveWindow, buildWeek, normalizeKnf, placeDay } from '@knf/timetableengine';

const { entries, skipped } = normalizeKnf(await api.schedule());  // bad rows drop PER ENTRY, counted
const window = deriveWindow(entries);                             // e.g. { startMin: 480, endMin: 1260 }
const days = buildWeek(entries);                                  // 7 sorted buckets, Monday first
const placed = placeDay(days[0], window);                         // fractions ready to multiply by pixels
```

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the entry contract), `normalize.ts` (the single door raw rows come through), `layout.ts` (the overlap packer), `window.ts` (the visible hour span), `week.ts` (buckets + the dated edge), `conflicts.ts`, `now.ts`, `perspective.ts`, `utils.ts` |
| `adapters/knf/` | The faculty backend's `GET /api/schedule` rows → entries, defensively |

## The packer

`placeDay` sweeps a day's sorted lessons into overlap clusters (strict
`>=` closes a cluster, so back-to-back lessons NEVER share width),
first-fits columns inside each cluster, gives every member the
cluster's equal column width, and lets an entry widen rightward across
columns that are free at its time. Geometry comes out as FRACTIONS —
of the day column horizontally, of the visible window vertically — so
any pixel size renders the same shapes and every guarantee is an exact
equality in the tests. Background blocks (`isBlock`) draw full-width
behind and never claim columns from real lessons.

## Two perspectives

`forGroup` filters a student's group. `forTeacher` collects one
teacher's lessons across every group and collapses rows identical in
everything but group into ONE card carrying the merged `groupKeys` —
a lecture given to three groups at once is one cell with three chips,
while a subgroup split into two rooms stays two cells for the packer.
`conflictIds` answers both sides: `scope: 'group'` (double-booked
cohort — disabled unless a group filter is active, because a mixed
view of parallel groups shares slots legitimately) and
`scope: 'person'` (a double-booked teacher, across groups on
purpose) — and neither scope ever crosses semesters.
`annotateConflicts(placed, ids)` then stamps the verdict onto placed
layouts immutably for the UI's conflict wash. One honest caveat the
data imposes: a group label can bundle parallel subgroups and
elective baskets that share slots by design, so a group-scope hit is
an ADVISORY wash for the reader to judge, not a proven error.

## Degradation, not blankness

`normalizeEntries` never throws: a row with an unreadable time
("TBA", an empty string, an unpadded hour the adapter could not fix),
a bad day, or a midnight-crossing span skips ITSELF and bumps
`skipped`, so a host says "3 entries could not be read" over a full
grid instead of showing an empty week.

`kind`, `parity` and `weeks` are RESERVED fields: today's data never
carries them, every filter treats their absence as a no-op, and the
shapes are pinned by tests so the behavior activates the day the data
arrives.

## The KNF adapter

`normalizeKnf` maps the faculty backend's rows defensively: unpadded
times are repaired before the strict parse, academic titles riding
the comma list ("Vardenė Pavardenė, Doc., Dr.") fold out of `people`
so a titled lecturer is one person, and extra backend fields ride the
generic payload untouched. One response is ONE PAGE — the endpoint
caps a call at 500 rows, so an ungrouped fetch (the teacher
perspective wants every group) pages with `?offset` until a short
page returns and hands the concatenated rows here in a single call.

## Tests

`npm test` inside the package (or the host's root jest run) — the
battery pins exact packing fractions, shuffled-input determinism, DST
and year-boundary week materialization, ISO week 53, conflict scopes,
teacher dedupe, and the adapter's defensive mapping.
