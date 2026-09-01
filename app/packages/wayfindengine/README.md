# wayfindengine

A headless indoor wayfinding engine for React Native / Expo: one building
as a graph of levels, rooms, nodes and typed edges; A* routing costed in
walking seconds with three accessibility modes; turn-by-turn instructions
with landmarks and collapsed stairwells; a navigation cursor a screen
walks with taps, a pedometer or a scanned code; QR anchors; and a
diacritic-folded room search. It owns no floor plans and draws no pixels:
plans are drawings the host bundles, the engine only knows their pixel
space, and every shape it answers is plain data any UI can render
(`@knf/wayfinduikit` in this repo, or anything structurally compatible
with `Route`, `Instruction` and `NavigationState`).

```tsx
import { WayfindProvider, nodeForRoom, useNavigation, useRoomSearch, useRoute, useWayfind } from '@knf/wayfindengine';

<WayfindProvider
  graph={building}                       // your BuildingGraph (see The authoring pipeline)
  routing={{ avoid: ['stairs'] }}        // optional building-wide defaults
  strideM={0.7}                          // optional: the pedometer's metres per step
  onGraphIssues={(issues) => log(issues)} // optional: validateGraph's findings, once per graph object
>
  …
</WayfindProvider>

function RouteSheet({ toRoomId }) {
  const { index, graph } = useWayfind();
  const { route, reason } = useRoute(graph.entranceNodeId ?? null, nodeForRoom(index, toRoomId), { accessibility: 'accessible' });
  const nav = useNavigation(route);           // nav.state, nav.next(), nav.snapTo(scannedNodeId), nav.advanceBySteps(n)
  const { grouped } = useRoomSearch(query);   // matches sectioned by floor, floor order
}
```

## Examples

- **`example/ExampleWayfindScreen.tsx`** — the engine driving a bare
  React Native screen over `sampleBuilding()`: no plan, no UI kit, no
  host. A search box over `useRoomSearch`, a pick that routes from the
  entrance through `useRoute` with an "avoid stairs" switch, the
  instructions rendered as their raw fields, and Back / Next walking the
  route through `useNavigation` with the level and the metres left.
  Paste it into a blank Expo project to see the engine alone.
- **Kit + engine together** — `packages/wayfinduikit` draws these same
  shapes (the plan with the route on it, the instruction sheet, the
  panorama stage) but imports nothing from the engine: the two meet only
  in the host, which hands engine answers to the components and turns
  the kit's intents (a scan, a plan tap, a room pick) into engine calls.
  The kit README's "Pairing with @knf/wayfindengine" section lists that
  mapping; the kit's own example screen runs over a hand-written step
  list and a `useState` cursor standing in for the engine, so neither
  package ships a screen that wires both.

## The data model

One `BuildingGraph` per building, plain JSON a host can bundle, fetch or
generate at build time:

```jsonc
{
  "version": 1,
  "building": "faculty",
  "entranceNodeId": "n-entrance",        // where "route from the entrance" starts
  "levels": [
    { "id": "L1", "label": "1 aukštas", "ordinal": 1,
      "plan": "plans/l1.svg",            // a reference the HOST loads; the engine never does
      "viewBox": [0, 0, 1200, 800],      // the drawing's coordinate space
      "metersPerPixel": 0.05 }
  ],
  "nodes": [
    { "id": "n-entrance", "level": "L1", "x": 100, "y": 720, "kind": "entrance",
      "qr": "knf://node/n-entrance", "pano": "pano-entrance", "panoYaw": 0 },
    { "id": "n-lobby", "level": "L1", "x": 100, "y": 600, "kind": "corridor", "landmark": "reception desk" },
    { "id": "n-d101", "level": "L1", "x": 300, "y": 560, "kind": "door", "roomId": "r-101" },
    { "id": "n-st1", "level": "L1", "x": 500, "y": 560, "kind": "stairs" },
    { "id": "n-st2", "level": "L2", "x": 500, "y": 560, "kind": "stairs" }
  ],
  "edges": [
    { "a": "n-entrance", "b": "n-lobby", "kind": "hallway" },          // length = plan distance × metersPerPixel
    { "a": "n-c1", "b": "n-d101", "kind": "door" },
    { "a": "n-c6", "b": "n-exit", "kind": "door", "oneWay": true },    // walkable a → b only
    { "a": "n-st1", "b": "n-st2", "kind": "stairs", "lengthM": 8 }     // a connector MUST carry its length
  ],
  "rooms": [
    { "id": "r-101", "name": "101 auditorija", "level": "L1", "nodeId": "n-d101",
      "category": "lecture", "aliases": ["101"], "nameKey": "rooms.101",
      "polygon": [[200, 400], [400, 400], [400, 560], [200, 560]] }
  ]
}
```

- **Node kinds**: `corridor`, `door`, `stairs`, `elevator`, `ramp`,
  `entrance`, `room`. A node may carry the room it stands in or at the
  door of (`roomId`), a panorama shot taken at it plus the plan-space
  bearing its centre column faces (`pano`, `panoYaw`), a printed code
  (`qr`) and a `landmark` worth saying at a turn.
- **Edge kinds**: `hallway`, `door`, `stairs`, `elevator`, `ramp`. The
  last three are *connectors* — the only kinds allowed to change level.
  An edge without `lengthM` measures the plan distance between its ends;
  a cross-level edge without one measures 0 and `validateGraph` reports
  it as an error (`connector_without_length`). A same-level edge may
  carry an explicit `lengthM` (a corridor that bends between two nodes),
  but it must not undercut its plan chord — the straight line between
  the ends times `metersPerPixel` — by more than half a percent, or
  `validateGraph` warns (`length_under_chord`); a length that is not a
  finite number at or above 0 is an error (`bad_length`).
- **Rooms** point at the node a route to them ends at (`nodeId`), carry
  a `category` for nearest-by-kind lookups (`wc`, `exit`, `lecture`,
  `office`, `service`, `food`, `other`, or any string), optional
  `aliases` for search, a host-side translation key (`nameKey`) and an
  optional `polygon` the arrival side is read from.
- The tag vocabulary (room / corridor / door / stairs / elevator / level)
  is the common indoor-mapping one on purpose, so plans drawn for one
  tool stay readable by another.

`indexGraph(graph)` builds the lookups (nodes, rooms, levels by id, levels
in ordinal order, adjacency per node with one-way edges appearing once,
the room whose own node a node is), computes `heuristicScale` (the
smallest `lengthM`-to-plan-chord ratio over the same-level edges that
carry a usable explicit length, capped at 1 and 1 when none do — see
Routing) and memoises it all on the graph object's identity — hand in an
immutable graph and every hook shares one index.

## Plan space

Coordinates are **pixels of each level's plan drawing**. x grows to the
right, y grows DOWN the page, and a level's `metersPerPixel` turns plan
distance into metres — every distance the engine reports is in metres.
There are no geographic coordinates anywhere: a single building never
needs them, and a later projection onto a map is exactly that, a
projection of this model.

Bearings live in the frame a compass rose printed on the drawing shows:
0 is up the page (towards SMALLER y, since y grows down), 90 is right,
the wheel turns clockwise, and a turn is
the signed shortest arc between two successive bearings — negative is
left, positive is right. Plan space is per level, so nothing is ever
measured across floors: a connector's length is authored, a route's
polyline splits at every level change, and `nearestNode` only answers on
the level asked.

`bearingDeg`, `shortestArcDeg`, `turnBetween` and `compressPath` are the
public helpers, there for a host and its own plan renderer — thinning a
floor segment before drawing it, a heading arrow off a bearing. The UI
kit in this repo imports nothing from the engine and draws every route
point it is handed as is.

## Routing modes and the ETA

`findRoute(index, from, to, options)` answers `{ route }` or
`{ route: null, reason }` — `'unknown_node'` when an endpoint is not in
the graph, `'no_path'` when the two are known but no walkable way joins
them under the options. `from === to` is a one-point route of zero
metres. `useRoute` adds a third reason, `'idle'`, for an endpoint the
screen has not chosen yet.

The search is A* over the index, costed in **seconds rather than
metres**, so stairs, doors and an elevator's wait all weigh what they
cost a walker — the shortest line through a building is rarely the
quickest walk. `DEFAULT_WALKING_SPEEDS` prices each edge kind (hallway
1.3 m/s, door and ramp 1.0, stairs 0.6, elevator 0.5) and an elevator
edge also pays a fixed 30 s wait per hop, which is why a one-floor hop by
elevator loses to the stairs for anyone who can take them while a long
ride still wins. `walkingSpeeds` overrides any entry; an override that is
not a positive finite number keeps the default (refusing a kind is what
`avoid` is for). `edgeSeconds(index, edge)` is that pricing for one edge —
it is what the ETA sums — and `ELEVATOR_WAIT_S` the wait; both are public
so a host can quote a leg the way the router does.

Accessibility is a **filter, not a cost** — a route that needs a refused
edge does not exist, never a route that quietly breaks the promise:

| mode | stairs on one level | stairs between levels | elevator / ramp |
| --- | --- | --- | --- |
| `shortest` (default) | walked | walked | walked |
| `noInaccessibleFloorChanges` | walked (a few steps along a corridor) | refused | walked |
| `accessible` | refused | refused | walked |

`avoid: ['elevator']` refuses kinds outright (a lift out of order today),
and `minimizeFloorChanges` adds a minute's penalty to every level change
so a shortcut through another floor must save real walking before it is
worth a second stairwell. Penalties steer the choice and are **not**
time spent: the route's `etaSeconds` is the plain sum of edge seconds.
One-way edges are directional in the index's adjacency, so the search
sees nothing of them.

The heuristic is straight-line metres on the goal's level over the
fastest speed, and zero from any other level. The straight line is the
shortest walk only on a plan drawn to scale, and an explicit `lengthM`
may undercut its chord on a hand-measured one, so the estimate is
multiplied by the index's `heuristicScale` — the smallest length-to-chord
ratio over the graph's measured same-level edges, capped at 1 — which
keeps it admissible on every graph, not only the ones where the
`length_under_chord` warning was heeded. It is not consistent (it drops
to zero on leaving the goal's level), so the search keeps no closed set
and re-expands a node whenever a cheaper way to it turns up; on a
building graph that costs nothing and keeps the answer optimal.

An edge the search cannot price — an unknown kind has no speed, a NaN or
infinite `lengthM` no metres, a negative one a walk backwards — is
skipped, never walked: it is invisible to the search exactly like a
refused edge, so a route that needs it answers `'no_path'` rather than
NaN metres or a search that never returns. `validateGraph` reports all
three as errors; the router does not rely on that.

A `Route` carries `points` (node id, level, plan x / y, metres walked so
far), `floors` (one polyline per level stretch in plan pixels, split at
every level change and saying how the level was entered — a plan renderer
draws exactly these; the connector itself is never drawn, its two ends
lie on two different plans), `levels` in walking order deduplicated,
`distanceM`, `etaSeconds` and `steps`.

## How instructions are derived

`buildInstructions(index, points, edges)` fills `Route.steps` for every
answered route and is public for hosts building steps over a hand-made
one. Every step is anchored to a node and carries the metres from that
node to the **next step's** node (arrive carries 0), so the steps sum to
the route and a navigation state finds "the step whose action comes
next" by node alone. Metres are re-derived from the edges, so a
hand-built route is measured exactly the way the router's is.

What becomes a step, by priority when two meet at one node:

- **connector** — the first edge of a maximal run of stairs / elevator /
  ramp edges. The whole run is ONE step — `via` (the kind the walker
  meets first), the level before and after, `up` or `down` by the
  levels' ordinals, the run's total length — and the nodes inside it
  never turn: a stairwell's zig-zag is noise.
- **turn** — a corner of the walk between two connector runs, found
  exactly as `compressPath` keeps one: the heading in is measured from
  the LAST corner, so a gentle arc of sub-threshold bends still adds up
  to a turn, and 25° against the heading out makes a corner. The spoken
  direction is the arc's size — under 25° straight, under 70° slight,
  up to 135° a turn, beyond a u-turn — and its sign. A turn names the
  room whose door the node is, else the node's `landmark`, else the
  destination.
- **door** — a door-kind edge leaves the node, unless the node is
  already a corner, the depart covers it, or the arrival is right behind
  it.
- **continue** — the node where a connector run ends (the walker resumes
  on the new level), or the first node inside a straight stretch over
  40 m that would otherwise pass in silence — one per stretch, never
  inside a connector run, never right behind another continue.

Node 0 is always **depart**, pointing at the room of the first event
ahead, else the destination; a connector opening there stands right
after it. The last node is only ever **arrive**, its `side` (`left`,
`right`, `ahead`) read off the final heading against the room polygon's
area-weighted centroid — `ahead` within 30° either way, `null` when
there is nothing to compare (no polygon, a polygon on another level, a
route ending on a connector).

Turning a step into a sentence — and translating it — is the UI's job;
the engine hands over fields, never strings.

## The navigation state machine

`createNavigation(index, route)` is a cursor over `route.points`, pure and
React-free; `useNavigation(route)` subscribes to one per Route object and
re-renders with the fresh `NavigationState`. The cursor moves four ways:

- `next()` / `back()` / `jumpTo(i)` — the host's taps, clamped to the
  route.
- `snapTo(nodeId)` — a scanned code: a node on the route places the
  walker there and answers `'on-route'`; a node off it changes nothing
  and answers `'off-route'`, which is the host's cue to re-route from
  that node.
- `advanceByDistance(m)` (`advanceBySteps(n)` on the hook, through the
  provider's `strideM`) — the pedometer nudge: an odometer of walked
  metres that carries the cursor forward every time it reaches the next
  point's `atM`, never backwards, never past the end, keeping the
  overshoot. Every explicit placement re-bases the odometer to the point
  it lands on.

The state is **derived, never patched**: each index change builds one
fresh `NavigationState` and keeps it until the next, so the object is a
memo or effect dependency as it is — identical between changes, different
after one. A call that leaves the index where it was (next at the end, a
nudge short of the next point, an off-route snap) builds nothing and wakes
nobody.

What the state carries: the point `index`, `currentNodeId` / `nextNodeId`,
`currentLevel` with the nearest DIFFERENT levels behind and ahead
(`prevLevel` / `nextLevel`, null on the first / last floor) and the
`isStartFloor` / `isEndFloor` flags; `stepIndex` and `step` — the step
whose action happens at or after the current point, the arrive step at
the destination; `progressM` / `remainingM` and `remainingSeconds` (the
route's ETA scaled by the metres left); `bearingToNext` (plan-space — 0 is
up the drawing towards smaller y, clockwise — only while the next point
shares the level) and `panoYawToNext` (that bearing inside the node's
panorama: the bearing minus the node's `panoYaw`, folded into [0, 360)
where 0 is the photo's centre column; needs `pano` and `panoYaw` on the
node);
`arrived`; and `currentRoomId` — the room whose OWN node this is, so a
node merely at a room's door does not count as being in it.

A new Route object is a new walk from its first point; a null route makes
the hook inert (`state` null, `snapTo` answers `'off-route'`).

## Anchors

Where the walker IS, from the outside world in — each resolves to a node
the router can start from or the cursor can snap to:

- **Printed codes** are tiny URIs under a host-chosen scheme:
  `<scheme>node/<id>` and `<scheme>room/<id>`, `knf://` by default.
  `parseAnchor(payload, scheme?)` is strict on purpose — a payload under
  another scheme, an unknown kind, an empty id or an id with whitespace
  inside is somebody else's code, not a damaged one of ours — and only
  the payload's ends are trimmed, for scanner newlines. `formatAnchor` is
  the exact inverse, so a printed code round-trips. A node's `qr` field
  holds the payload physically posted at it.
- **Plan taps** — `nearestNode(index, { level, x, y }, { kinds })`, the
  closest node on ONE level, optionally narrowed to kinds (a tap should
  land on corridors and doors, never on a stair node's twin upstairs).
- **Room picks** — `nodeForRoom(index, roomId)`, null when the room or
  its node is missing so a pick never becomes a dangling endpoint.

Room search is `searchRooms(index, query, { localize, limit })` behind
`useRoomSearch`: case and diacritics fold on both sides ("rysiai" finds
"Ryšiai"), every query token must hit somewhere in the room's name, the
host's localised name, its aliases or its id, in any order; a token
scores by its best hit (the id exactly, then a field or word start, then
anywhere inside) — every occurrence in a field counts, not the first
alone, so "ka" ranks "Dekanato kabinetas" as a word start level with
"Kavinė" and above "Aula skaitykla"; ties fall back to floor order then
name, and the empty query is the browse list. `nearestRoomByCategory(index, fromNodeId,
'wc')` is a walking-distance scan over edge metres — not the router: no
modes, no speeds — answering "which WC is closest" in the time a tap
takes; the host then routes to the one it picks under whatever options
apply.

## The authoring pipeline

A building is drawn, not typed. Per level, in any vector editor, three
kinds of marked-up shapes go on top of the plan drawing:

```svg
<svg viewBox="0 0 1200 800">
  <!-- walls, labels, anything else: ignored -->
  <circle id="n-lobby" cx="100" cy="600" data-landmark="reception desk" />
  <circle id="n-d101"  cx="300" cy="560" data-kind="door" data-room="101" />
  <circle id="n-st1"   cx="500" cy="560" data-kind="stairs" data-qr="knf://node/n-st1" />
  <line id="e-1" x1="100" y1="600" x2="300" y2="600" />
  <line id="e-2" x1="300" y1="600" x2="300" y2="560" data-kind="door" />
  <line id="e-3" x1="900" y1="200" x2="900" y2="100" data-kind="door" data-oneway="true" />
  <path id="r-101" d="M 200 400 L 400 400 L 400 560 L 200 560 Z" data-name="101 auditorija" data-category="lecture" />
</svg>
```

- `<circle id="n-…">` — a node at the centre; `data-kind` (default
  `corridor`), `data-room`, `data-pano`, `data-yaw`, `data-qr`,
  `data-landmark`.
- `<line id="e-…">` — an edge whose ends SNAP to the nearest node within
  `snapTolerancePx` (6 by default) — a line drawn by hand never lands on
  a centre exactly; `data-kind` (default `hallway`), `data-length`,
  `data-oneway` (a → b is the line's own direction).
- `<path id="r-<roomId>">` (or a `<rect>` / `<polygon>`) — a room whose
  outline is the shape (M / L / H / V and their relative forms, one
  closed ring); `data-name`, `data-name-key`, `data-category`, and
  `data-node` for the node a route ends at — else a node inside the
  outline wins (nearest the centre among several), else the nearest to
  its boundary.

Then, in a build script:

```ts
import { svgToGraph, mergeLevels } from '@knf/wayfindengine';

const l1 = svgToGraph(readFileSync('plans/l1.svg', 'utf8'), { levelId: 'L1', ordinal: 1, label: '1 aukštas', metersPerPixel: 0.05, plan: 'plans/l1.svg' });
const l2 = svgToGraph(readFileSync('plans/l2.svg', 'utf8'), { levelId: 'L2', ordinal: 2, label: '2 aukštas', metersPerPixel: 0.05, plan: 'plans/l2.svg' });

const { graph, issues } = mergeLevels([l1, l2], {
  building: 'faculty',
  entranceNodeId: 'n-entrance',
  connectors: [{ a: 'n-st1', b: 'n-st2', kind: 'stairs', lengthM: 8 }],
});
if (issues.some((i) => i.severity === 'error')) fail(issues);
writeFileSync('building.json', JSON.stringify(graph));
```

`svgToGraph` throws nothing and no issue stops the parse — an authoring
tool shows everything wrong at once, so the result carries the shapes it
could read beside the issues it found (`unsnapped_edge`, `self_edge`,
`unsupported_path`, `unknown_node_ref`, `room_without_node`,
`bad_attribute`, `duplicate_id`, `missing_viewbox`). `mergeLevels` joins
the levels with the connectors the author names, runs `validateGraph`
over the whole and folds its issues in (so an issue's `code` is either
one of the tool's or one of `validateGraph`'s). Parsing is a pair of
regexes over the SVG text, not an XML parser: comments are stripped
first, transforms are ignored, shapes are read in plan coordinates as
written, and every attribute value the tool reads — ids, numbers,
`viewBox` and each `data-*` text — has its XML entities decoded: the
five named ones (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`, case-sensitive)
and numeric references in decimal (`&#279;`) or hexadecimal (`&#x117;`),
so a room named "Kavinė & baras" is authored as
`data-name="Kavinė &amp; baras"` (what any vector editor writes) and
reaches the graph and the search index spelt correctly. Any other entity
form (`&nbsp;`, a document-defined one) is left exactly as written and
raises no issue.

## The graph contract

`validateGraph(graph)` is the authoring safety net and runs in the tool,
in the provider (once per graph object; in development, or in any build
that passes `onGraphIssues`) and in the conformance suite. Issues are
reported, never thrown, each with a `severity`, a `code`, a `message`
and the `ref` at fault. Every code:

Errors —

- `duplicate_id` — a level, node or room id defined twice.
- `unknown_level` — a node or room on a level the graph does not list.
- `dangling_edge` — an edge naming a node that is not there.
- `unknown_kind` — an edge kind outside `hallway` / `door` / `stairs` /
  `elevator` / `ramp` (it would have no walking speed).
- `bad_length` — a `lengthM` that is not a finite number at or above 0
  (negative, NaN, infinite).
- `cross_level_hallway` — a hallway or door drawn between floors.
- `connector_without_length` — stairs, an elevator or a ramp between
  floors with no `lengthM` (there is no plan chord to fall back on, so
  it would be walked for 0 m). A cross-level edge gets one of these two,
  never both.
- `room_without_node` — a room pointing at a missing node.
- `missing_entrance` — an `entranceNodeId` that is not a node.

Warnings —

- `duplicate_id` — the same edge listed twice (both directions of a
  two-way edge count as one).
- `unknown_kind` — a node kind outside the vocabulary (a node kind never
  reaches any arithmetic, so the router is unhurt).
- `zero_length_edge` — a same-level edge joining two nodes at the same
  point with no length (an explicit 0 counts as none).
- `length_under_chord` — a same-level edge whose explicit `lengthM` sits
  more than half a percent below its plan chord (the straight line
  between its ends times the level's `metersPerPixel`); a straight line
  is the shortest walk on one plan, so a shorter tape is a mis-measure.
  Not raised across levels, on a bad length, or on an unknown level.
- `unreachable_node` — a node the entrance cannot reach (almost always a
  forgotten edge).

To prove a building, call `describeGraphContract` in a jest file:

```ts
describeGraphContract('faculty', () => require('./building.json'), {
  expectInaccessible: ['r-attic'],   // rooms with no accessible route on purpose
  anchorScheme: 'vu://',             // when the codes are not knf://
});
```

Green means: `validateGraph` reports no errors; an entrance is named;
every room is reachable from it in every mode (minus the rooms declared
inaccessible, which are proven to really have none); room pairs route
both ways at the same distance where no one-way edge is involved; every
route found passes `assertRouteInvariants` (endpoints, known nodes on the
levels they claim, an edge joining every consecutive pair, level changes
over connectors only, monotone `atM` growing by exactly each edge's
metres, floors covering every point and splitting at every level change,
`levels` as the deduplicated walking order, steps opening with a depart,
closing with an arrive, standing on the route in order and summing to
the route's metres, no stairs under `accessible` and no stairs level
change under `noInaccessibleFloorChanges`); and every posted code
round-trips through `parseAnchor` / `formatAnchor` onto the node it is
posted at. `sampleBuilding()` is the reference graph the suite runs over
in this package — two levels at 0.05 m/px, ten rooms, a stairwell, an
elevator and a ramp, an exit-only door, codes, panoramas and polygons.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the domain model), `graph.ts` (`indexGraph`, `validateGraph`, `edgeLengthM`), `geometry.ts` (bearings, turns, `compressPath`), `route.ts` (A*, speeds, the ETA), `instructions.ts` (the step rules), `navigation.ts` (the cursor), `anchors.ts` (codes, plan taps, room picks), `search.ts` (the fold, the rank, nearest-by-category) |
| `provider/` | `WayfindProvider` / `useWayfind` — the graph with its memoised index, the default routing options, the stride length, the issue sink |
| `hooks/` | `useRoute`, `useNavigation`, `useRoomSearch` |
| `testing/` | `sampleBuilding()` (the reference two-level faculty) and `assertRouteInvariants` / `describeGraphContract` (the conformance suite) |
| `tools/` | `svgToGraph` / `mergeLevels` — the plan-to-graph authoring tool, pure, no filesystem |

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` and
`example/__tests__/` with the jest-expo preset and this package's own
`babel.config.js` — no host needed. Specs sit beside what they pin;
`testing/` ships, `__tests__` does not (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact export list, the speed
  table, the sample building off the barrel, the anchor round-trip.
- `src/__tests__/contract.test.ts` — the conformance suite run over the
  sample building, plus what the sample promises.
- `src/core/__tests__/` — geometry on both sides of every threshold,
  every `validateGraph` code and `heuristicScale`, the router's modes,
  penalties, one-way edges, the ETA, the under-chord optimum and the
  unpriceable-edge skip, every instruction rule, the cursor's four moves
  and every derived field, the anchor parser's strictness, the search
  fold, rank and walking-distance scan.
- `src/provider/__tests__/` — `routing` keyed by content across
  re-renders and re-orderings, validation once per graph object, and
  the sink rule in development and release builds.
- `src/hooks/__tests__/` — the three hooks under the provider: idle /
  reasons / option merging / one Route object across renders, the walk,
  the pedometer through the stride, the reset on a new route, sections
  in floor order.
- `src/testing/__tests__/` — the invariants catching each thing they
  promise to catch.
- `src/tools/__tests__/` — the SVG shapes, the snap, every issue code
  (a shape drawn twice included), the entity decoding, `mergeLevels`
  with `validateGraph`'s issues folded in.
- `example/__tests__/example.test.tsx` — the example screen end to end
  over the sample building.

## What the host supplies

- **`graph`** — a `BuildingGraph`, immutable once handed in (the index
  is memoised on its identity). Draw it (above) or write the JSON by
  hand for a small building.
- **Plans** — the drawings themselves, loaded by the host and rendered
  by the host or a UI kit it hands them to; `Level.plan` is whatever
  reference the host needs.
- **`routing`** — optional building-wide defaults (`accessibility`,
  `minimizeFloorChanges`, `avoid`, `walkingSpeeds`); a call's options
  win field by field, `walkingSpeeds` merging one level deeper. The
  provider compares it by content, not identity, so an inline literal
  (`routing={{ avoid: ['stairs'] }}`) is safe: `env.routing` keeps its
  identity across renders until a field changes, and no Route or walker
  beneath it restarts. The rule, shared with `useRoute`'s options: the
  fields are compared in a fixed order, undefined fields dropped, `avoid`
  as a set (its order ignored) and `walkingSpeeds` by kind whatever the
  key order — two literals spelling the same options differently are the
  same options.
- **`strideM`** — metres per step for the pedometer nudge, 0.7 by
  default.
- **`onGraphIssues`** — receives `validateGraph`'s findings once per
  graph object, in every build (an inline arrow re-runs nothing; a new
  graph object is validated again); omitted, the graph is validated in
  development only and the findings go to `console.warn`, and a release
  build without it skips validation altogether.
- **Strings** — the engine hands over ids, kinds and fields; labels,
  sentences and translations are the UI's (`Level.label`, `Room.nameKey`
  and `localize` on the search are the seams).
- **Sensors** — a scanner handing raw payloads to `parseAnchor`, a
  pedometer handing step deltas to `advanceBySteps`; both optional, taps
  alone walk a route.

## Behaviours worth knowing

- Every distance is in metres and every coordinate in plan pixels; a
  cross-level edge without `lengthM` measures 0 and `validateGraph`
  reports it as `connector_without_length`.
- Routes are costed in seconds: a one-floor hop by elevator loses to the
  stairs for anyone who may take them; `minimizeFloorChanges` steers but
  never counts as time; `etaSeconds` is the plain sum of edge seconds.
- Accessibility filters, never penalises — a refused edge is invisible to
  the search and the answer is `'no_path'`, not a route that quietly
  breaks the promise.
- `useRoute` compares options by content, field order included (the
  provider's `routing` is compared the same way), so an inline options
  literal holds one Route object across renders — and a Route object's
  identity is what starts a walker over, so a new destination or a
  flipped mode restarts `useNavigation` at the first point on its own.
- A step's `distanceM` is the way to the NEXT step's node, so a corridor
  of non-corners between two turns is one number; a stairwell drawn as
  several edges is one connector step; a route opening on stairs has a
  0 m depart in front of the connector.
- The navigation state is one object per index change — identical
  between moves, different after one — and a move that changes nothing
  (next at the end, an off-route snap, a nudge short of the next point)
  renders nothing.
- The pedometer odometer keeps its overshoot between points and never
  walks backwards; every explicit placement (tap, jump, scan) re-bases
  it.
- `panoYawToNext` needs both `pano` and `panoYaw` on the node and a next
  point on the same level; it is the plan bearing to the next point
  minus the panorama's facing, folded into [0, 360) — a yaw in the
  photo's frame, 0 being its centre column. Both bearings share the plan
  frame: 0 is up the drawing (towards smaller y), clockwise.
- `currentRoomId` is the room whose OWN node the walker stands at; a
  node at a room's door is not "in" the room.
- `parseAnchor` is strict: another scheme, an unknown kind, an empty id
  or whitespace inside the id answer null — somebody else's code, not a
  damaged one of ours.
- Search requires every token, in any order, folded on both sides; the
  empty query is the browse list in floor-then-name order, and
  `useRoomSearch`'s sections follow the building's floor order whatever
  the query.
- `nearestRoomByCategory` measures WALKING distance over every edge kind
  and ignores modes on purpose — it answers "which is closest", the
  router answers "how do I get there under my constraints".
- The provider validates once per graph object, in development or
  whenever `onGraphIssues` is given — a release build without a reporter
  skips validation; a dangling edge found at boot beats a route that
  silently fails in the building, but a report nobody reads is only work.
