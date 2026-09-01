# Changelog

## 1.1.0 — 2026-09-01

The data model grows what an admin-authored, server-published building
needs; nothing existing changes meaning.

- Types — `Level.northDeg` and `BuildingGraph.northDeg` (compass bearing
  of plan "up", for turning a sensor heading into a plan bearing),
  `BuildingGraph.revision` / `publishedAt` (stamped by the server);
  `GraphNode.panoGeometry` (`PanoGeometry`: what the photo covers —
  absent means a full sphere or, by aspect, a full turn with a limited
  vertical band), `panoHeading` (`PanoHeading`: where `panoYaw` came
  from — manual / aligned / compass / path / auto, with the raw reading),
  `panoLinks` (`PanoLink[]`: authored hotspots with an arrival yaw);
  `GraphEdge.id` (optional, for editors and the server), `tags`,
  `delaySeconds`, `closedUntil`; `Room.nameEn`,
  `hours`, `access`, `accessibility`, `photos`, `details`;
  `RoutingOptions.at` (the clock `closedUntil` is judged against).
- Router — an edge's `delaySeconds` is added to its price like the
  elevator wait (a non-finite or negative value is ignored); an edge
  whose `closedUntil` lies after `options.at` (default: now) is refused
  like an avoided kind.
- `validateGraph` — two warnings: `bad_pano_geometry` (a coverage the
  stage cannot draw) and `pano_link_unknown` (a hotspot to a missing
  node or to its own node).

## 1.0.1 — 2026-09-01

Hardening after a review of the graph contract, the router, the
provider and the docs. No export added or removed, no prop renamed, no
default changed.

- `validateGraph` — four new issue codes. Errors:
  `connector_without_length` (stairs / elevator / ramp between floors
  with no `lengthM`; it was walked for 0 m before), `unknown_kind` on an
  edge (a kind outside `hallway` / `door` / `stairs` / `elevator` /
  `ramp` has no walking speed), `bad_length` (a `lengthM` that is not a
  finite number at or above 0; an explicit 0 stays `zero_length_edge`).
  Warnings: `unknown_kind` on a node (never reaches arithmetic),
  `length_under_chord` (a same-level explicit length more than half a
  percent under its plan chord — the straight line between the ends
  times `metersPerPixel`; not raised across levels, on a bad length or
  on an unknown level). Kinds are checked by value: the graph is plain
  JSON, the type unions guard nothing at runtime.
- `GraphIndex.heuristicScale` — new public field, computed once in
  `indexGraph`: the smallest `lengthM`-to-chord ratio over the
  same-level edges with a usable explicit length, capped at 1, 1 when
  none. `findRoute` multiplies its straight-line estimate by it, so A*
  stays admissible and the answer optimal on a plan whose explicit
  lengths undercut the drawing (a 20 m corridor drawn 100 px long at
  1 m/px used to lose to a 100 m detour).
- `findRoute` — skips any edge whose seconds are not finite or are
  negative (an unknown kind, a NaN / infinite / negative `lengthM`),
  exactly as it skips a refused one, so a route needing it answers
  `'no_path'` instead of NaN metres or a search that never returned (a
  misspelt kind used to hang; a negative length lapped a cycle).
- `WayfindProvider` — `routing` is keyed by content: fields compared
  in a fixed order, `avoid` as a set, `walkingSpeeds` by kind whatever
  the key order, so an inline literal keeps `env.routing` (and every
  Route and walker beneath it) across re-renders, and two literals
  spelling the same options differently share one object. `useRoute`
  keys its call options through the same serialisation, so field order
  no longer re-identifies a route there either.
- `WayfindProvider` — `onGraphIssues` is held in a ref and the
  validation effect keys on the graph alone: the sink fires once per
  graph object however often the parent re-renders (an inline arrow
  used to re-run validation every render). Validation itself now runs
  only when somebody will hear it — in development (falling back to
  `console.warn`), or in any build that passes `onGraphIssues`; a
  release build without a reporter skips the walk (it used to run it
  and drop the result).
- `NavigationState.panoYawToNext` — computed through `shortestArcDeg`
  and unfolded into [0, 360); every value is what it was, the range is
  now documented on the type and in the README. `GraphNode.panoYaw` /
  `bearingToNext` comments corrected: 0 is up the drawing towards
  SMALLER y (y grows down), clockwise.
- `searchRooms` — a token scores by its best hit across every
  occurrence in a field, not the first: "ka" now ranks "Dekanato
  kabinetas" as a word start (it scored the infix inside "dekanato"
  before).
- `svgToGraph` — every attribute value read (ids, numbers, `viewBox`,
  each `data-*` text) has its XML entities decoded: the five named ones
  (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;`) and decimal / hexadecimal
  numeric references; anything else is left as written. A room named
  with an `&` used to reach the graph as `&amp;`.
- Docs — the README no longer says the UI kit uses the engine's
  geometry helpers, sample building or anchors (the kit imports nothing
  from the engine; the packages meet in the host, and the kit README's
  "Pairing" section holds the mapping), lists every `validateGraph`
  code, explains `heuristicScale`, and its quick start type-checks
  (`useRoute(graph.entranceNodeId ?? null, …)`). Banners across the
  package say the same. New specs: `core/__tests__/graph.test.ts`,
  `provider/__tests__/provider.test.tsx`, a `duplicate_id` and an
  entity-decoding case for the tool.

## 1.0.0 — 2026-09-01

First cut.

- `BuildingGraph` — the domain model: levels with a plan reference, a
  viewBox and `metersPerPixel`; nodes in plan pixels with a kind, an
  optional room, panorama + facing, printed code and landmark; typed
  edges (`hallway`, `door`, `stairs`, `elevator`, `ramp`) with an
  optional explicit length and a one-way flag; rooms with a category,
  aliases, a translation key and an outline polygon; an entrance node.
  `indexGraph` memoises the lookups and adjacency on the graph object's
  identity; `validateGraph` reports (never throws) duplicate ids,
  unknown levels, dangling edges, cross-level hallways, rooms without a
  node, a missing entrance, zero-length edges and unreachable nodes;
  `edgeLengthM` measures one edge.
- Geometry — `bearingDeg` (0 up the drawing, clockwise, y down),
  `shortestArcDeg` (signed, (-180, 180]), `turnBetween` (25 / 70 / 135°
  thresholds), `compressPath` (heading measured from the last KEPT
  point, so a gentle arc still adds up to a corner).
- Routing — `findRoute`: A* costed in seconds over `DEFAULT_WALKING_SPEEDS`
  plus a per-hop elevator wait (`edgeSeconds` and `ELEVATOR_WAIT_S` are
  public); `shortest` / `noInaccessibleFloorChanges`
  / `accessible` as filters, `avoid` for kinds refused outright,
  `minimizeFloorChanges` as a penalty that steers but is not time; no
  closed set (the heuristic drops to zero off the goal's level). A Route
  carries points with metres so far, per-level polylines split at every
  level change with how each was entered, the levels in walking order,
  the distance, the ETA and the steps.
- Instructions — `buildInstructions`: depart, turns with a landmark or a
  room, doors, one connector step per maximal stairs / elevator / ramp
  run (the zig-zag inside silenced), a continue where a run ends or a
  straight stretch passes 40 m, arrive with the side read off the room
  polygon's area-weighted centroid. Each step measures the way to the
  next step's node, so the steps sum to the route.
- Navigation — `createNavigation`: a cursor over the route's points with
  `next` / `back` / `jumpTo`, `snapTo` (`'on-route'` | `'off-route'`),
  `advanceByDistance` (an odometer that keeps its overshoot and never
  walks backwards) and `subscribe`; one derived `NavigationState` per
  index change (levels behind and ahead, the step whose action comes
  next, progress / remaining metres and seconds, the bearing to the next
  point and its yaw inside the node's panorama, the room the walker is
  in).
- Anchors — `parseAnchor` / `formatAnchor` (`<scheme>node/<id>`,
  `<scheme>room/<id>`, `knf://` by default, strict), `nearestNode` on one
  level with a kinds filter, `nodeForRoom`.
- Search — `foldForSearch` (NFD, accents stripped, case, whitespace),
  `searchRooms` (every token, any order, across name / localised name /
  aliases / id; exact-id, prefix and infix tiers; floor-then-name
  browse order; `limit`), `nearestRoomByCategory` (a walking-distance
  scan, closest first, capped).
- `WayfindProvider` / `useWayfind` — the graph with its memoised index,
  the building-wide routing defaults, the stride length, the issue sink
  (`console.warn` in development when omitted).
- Hooks: `useRoute` (memoised by content — an inline options literal
  holds one Route object; the provider's options as defaults under the
  call's, `walkingSpeeds` merging one level deeper; `'idle'` beside the
  router's two reasons), `useNavigation` (one cursor per Route object,
  identity-stable state, `advanceBySteps` through the stride, `reset`,
  inert on null), `useRoomSearch` (matches, floor sections in floor
  order, the count).
- `testing/sampleBuilding` — the reference two-level faculty (0.05 m/px,
  ten rooms across the categories, a stairwell, an elevator and a ramp
  with explicit lengths, an exit-only door, codes, panoramas with a
  facing, polygons; a fresh object per call) — and
  `testing/invariants`: `assertRouteInvariants` (every promise a Route
  makes, with a message naming the point, edge or step at fault) and
  `describeGraphContract` (the conformance suite any host graph runs).
- `tools/svgToGraph` — the plan-to-graph authoring tool: id'd circles,
  lines and paths / rects / polygons over a drawing become one level's
  nodes, edges (snapped to the nearest node) and rooms (outline, and the
  node inside or nearest it); every problem reported beside the shapes
  read, nothing thrown; `mergeLevels` joins levels with named connectors
  and folds `validateGraph`'s issues in.
- `example/ExampleWayfindScreen.tsx` — a bare-RN screen over the sample
  building (search, pick, "avoid stairs", raw instruction fields, Back /
  Next with the level and the metres left), with its own end-to-end spec.
- Specs live inside the package (`src/**/__tests__/`,
  `example/__tests__/`) with their own `npm test` (jest-expo + the
  package's babel config); `__tests__` is excluded from `files`.
