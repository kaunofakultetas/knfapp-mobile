// -----------------------------------------------------------
//  [*] wayfindengine — domain types
//
//  The engine's vocabulary for one building. Coordinates live
//  in PIXEL space of each level's plan drawing (an SVG or a
//  raster) — a level carries `metersPerPixel`, and every
//  distance the engine reports is in metres. No geographic
//  coordinates anywhere: a single building never needs them,
//  and a later map-engine migration is a projection of this
//  model, not a remodel. The tag vocabulary (room / corridor /
//  door / stairs / elevator / level) follows the common indoor
//  mapping schema on purpose, so plans drawn for one tool are
//  readable by another.
//
//  A route is what the router answers; instructions are what
//  the instruction generator derives from it; the navigation
//  state is what a screen renders while walking. All three are
//  plain data — the UI kit mirrors them structurally.
//
//  Used by:
//    - everything in the package
// -----------------------------------------------------------







// -----------------------------------------------------------
// Level
// -----------------------------------------------------------
//
// One floor: its drawing's coordinate space, the metre scale,
// the ordinal and the calibrated north — field comments carry
// each contract.
//
// Used by:
//   - core/graph.ts, core/search.ts, hooks/useRoomSearch.ts,
//     tools/svgToGraph.ts, testing/sampleBuilding.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Level {
  id: string;
  // Display label the host localises ("1 aukštas")
  label: string;
  // The plan drawing: a bundled asset id / URL / SVG string
  // reference — the engine never loads it, the UI does
  plan?: string | null;
  // [minX, minY, width, height] of the drawing's coordinate space
  viewBox: [number, number, number, number];
  metersPerPixel: number;
  // Numeric floor for ordering and "up / down" wording
  ordinal: number;
  // Compass bearing (degrees, clockwise from magnetic north) of
  // the drawing's "up" — turns a sensor heading into a plan
  // bearing; null until an admin calibrates the level. Falls
  // back to BuildingGraph.northDeg
  northDeg?: number | null;
}







// -----------------------------------------------------------
// NodeKind
// -----------------------------------------------------------
//
// What a node IS — never priced by the router, but read by
// anchors, narration and the authoring checks.
//
// Used by:
//   - GraphNode (below), core/anchors.ts, core/graph.ts,
//     tools/svgToGraph.ts, testing/sampleBuilding.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type NodeKind = 'corridor' | 'door' | 'stairs' | 'elevator' | 'ramp' | 'entrance' | 'room';







// -----------------------------------------------------------
// GraphNode
// -----------------------------------------------------------
//
// One walkable point on a level's plan, with its optional
// panorama facts and QR anchor — field comments carry the
// coordinate and yaw conventions.
//
// Used by:
//   - core/graph.ts, core/route.ts, core/anchors.ts,
//     tools/svgToGraph.ts, testing/sampleBuilding.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface GraphNode {
  id: string;
  level: string;
  x: number;
  y: number;
  kind: NodeKind;
  // The room this node stands in / at the door of
  roomId?: string | null;
  // The panorama shot AT this node and the plan-space bearing
  // its centre column faces (degrees, 0 = up the drawing, which
  // is towards SMALLER y since y grows down; 90 = right;
  // clockwise) — the stage derives the marker yaw from these
  pano?: string | null;
  panoYaw?: number | null;
  // What the photo covers — absent means a full sphere, or, for
  // a photo whose aspect says otherwise, a full turn with the
  // vertical range the aspect gives (a phone sweep)
  panoGeometry?: PanoGeometry | null;
  // Where panoYaw came from, so a compass guess is never
  // mistaken for an admin's alignment
  panoHeading?: PanoHeading | null;
  // Authored hotspots to other panoramas; absent → the host
  // derives them from adjacency
  panoLinks?: PanoLink[] | null;
  // A QR anchor payload physically posted here
  qr?: string | null;
  // A named feature nearby worth saying ("towards the library")
  landmark?: string | null;
}







// -----------------------------------------------------------
// PanoGeometry
// -----------------------------------------------------------
//
// The part of the sphere a panorama covers, in degrees. A full
// equirectangular photo is 360 × 180 centred on the horizon; a
// phone sweep is 360 × (360 · height / width); a single frame
// is the camera's own field of view.
//
// Used by:
//   - GraphNode (above) — the panoGeometry field
//   - src/index.ts — the public surface; the UI kit mirrors
//     it structurally as KitPanoGeometry
// -----------------------------------------------------------

export interface PanoGeometry {
  hfovDeg: number;
  vfovDeg: number;
  // Yaw of the photo's centre column inside the sphere, when
  // the photo is not a full turn (0 = straight ahead)
  centreYawDeg?: number | null;
  // Pitch of the photo's centre row above the horizon
  vOffsetDeg?: number | null;
}







// -----------------------------------------------------------
// PanoHeadingSource
// -----------------------------------------------------------
//
// Where a node's panoYaw came from, ranked by trust: an
// admin's manual/aligned value over a compass or path guess.
//
// Used by:
//   - PanoHeading (below) — the source field
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type PanoHeadingSource = 'manual' | 'aligned' | 'compass' | 'path' | 'auto';







// -----------------------------------------------------------
// PanoHeading
// -----------------------------------------------------------
//
// The provenance kept beside a derived panoYaw, so a compass
// guess is never mistaken for an admin's alignment.
//
// Used by:
//   - GraphNode (above) — the panoHeading field
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface PanoHeading {
  source: PanoHeadingSource;
  // The sensor reading at capture, degrees clockwise from
  // magnetic north, kept beside the derived panoYaw
  rawDeg?: number | null;
  // 0..1, from the sensor's own calibration state
  confidence?: number | null;
}







// -----------------------------------------------------------
// PanoLink
// -----------------------------------------------------------
//
// An authored hotspot: where the target sits in THIS panorama
// and, optionally, which way the walker faces on arrival.
//
// Used by:
//   - GraphNode (above) — the panoLinks field
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface PanoLink {
  targetNodeId: string;
  yaw: number;
  pitch?: number | null;
  arrivalYaw?: number | null;
}







// -----------------------------------------------------------
// EdgeKind
// -----------------------------------------------------------
//
// What a walk over an edge IS — indexes the router's speed
// table, so the vocabulary is closed.
//
// Used by:
//   - GraphEdge / RoutingOptions (below), core/graph.ts,
//     core/route.ts, core/instructions.ts,
//     provider/index.tsx, tools/svgToGraph.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type EdgeKind = 'hallway' | 'door' | 'stairs' | 'elevator' | 'ramp';







// -----------------------------------------------------------
// GraphEdge
// -----------------------------------------------------------
//
// One walkable connection; field comments carry the length,
// one-way and closure contracts the router prices by.
//
// Used by:
//   - core/graph.ts, core/route.ts, core/instructions.ts,
//     tools/svgToGraph.ts, testing/invariants.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface GraphEdge {
  // Optional — an editor and the server address an edge by it;
  // the router only ever reads a, b and kind
  id?: string | null;
  a: string;
  b: string;
  kind: EdgeKind;
  // Explicit walking length; omitted → the plan distance between
  // the endpoints (only valid for same-level edges)
  lengthM?: number | null;
  // Walk only a → b (a one-way turnstile, an exit-only door)
  oneWay?: boolean;
  // Free-form authoring tags ("card-access", "staff-only",
  // "steps:3") — routing ignores them, hosts and editors read them
  tags?: string[] | null;
  // Seconds the walker loses here beyond walking it — a badge
  // reader, a queue, a heavy door
  delaySeconds?: number | null;
  // Epoch milliseconds until which the edge is shut (a closed
  // stairwell); refused while RoutingOptions.at is before it
  closedUntil?: number | null;
}







// -----------------------------------------------------------
// RoomCategory
// -----------------------------------------------------------
//
// The known categories plus any host string — (string & {})
// keeps autocomplete on the knowns without closing the union.
//
// Used by:
//   - Room (below), core/search.ts — nearestRoomByCategory
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type RoomCategory = 'wc' | 'exit' | 'lecture' | 'office' | 'service' | 'food' | 'other' | (string & {});







// -----------------------------------------------------------
// Room
// -----------------------------------------------------------
//
// One destination as search and arrival know it — the node a
// route ends at, the names searched, and the display facts
// the host renders; field comments carry each contract.
//
// Used by:
//   - core/graph.ts, core/search.ts, core/instructions.ts,
//     tools/svgToGraph.ts, testing files
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Room {
  id: string;
  name: string;
  // Host-side translation key, when the name is localised
  nameKey?: string | null;
  level: string;
  // The node a route to this room ends at
  nodeId: string;
  polygon?: [number, number][] | null;
  category?: RoomCategory | null;
  // Extra search words (old numbers, nicknames)
  aliases?: string[] | null;
  // Second-language name, searched beside `name`
  nameEn?: string | null;
  // Opening hours as a text rule the host renders / evaluates
  // ("Mo-Fr 08:00-20:00")
  hours?: string | null;
  // Who may enter: everyone, students, staff, by card
  access?: 'public' | 'students' | 'staff' | 'card' | null;
  // Step-free / wide-door facts the accessible route cares about
  accessibility?: { stepFree?: boolean; wideDoor?: boolean; note?: string | null } | null;
  // Photo references the host resolves, like Level.plan
  photos?: string[] | null;
  // Any further typed facts (capacity, unit, phone)
  details?: Record<string, string | number | boolean> | null;
}







// -----------------------------------------------------------
// BuildingGraph
// -----------------------------------------------------------
//
// The whole building as one plain-JSON document — what a host
// hands the provider and the server publishes.
//
// Used by:
//   - core/graph.ts — validated and indexed
//   - provider/index.tsx, tools/svgToGraph.ts, testing files
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface BuildingGraph {
  version: 1;
  building: string;
  levels: Level[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  rooms: Room[];
  // The node the "route from the entrance" default starts at
  entranceNodeId?: string | null;
  // Building-wide compass bearing of plan "up", inherited by
  // levels without their own
  northDeg?: number | null;
  // Set by the server on publish; the host's cache keys on it
  revision?: number | null;
  publishedAt?: string | null;
}







// -----------------------------------------------------------
// AccessibilityMode
// -----------------------------------------------------------
//
// 'shortest' walks anything; 'accessible' never uses stairs
// (ramps and elevators only); 'noInaccessibleFloorChanges'
// allows stairs on one level (a few steps) but changes level
// only by elevator or ramp.
//
// Used by:
//   - RoutingOptions (below), testing/invariants.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type AccessibilityMode = 'shortest' | 'accessible' | 'noInaccessibleFloorChanges';







// -----------------------------------------------------------
// RoutingOptions
// -----------------------------------------------------------
//
// Every knob a route search takes; field comments carry each
// contract. The provider canonicalises these into a key (see
// provider/index.tsx routingKey).
//
// Used by:
//   - core/route.ts — findRoute's options
//   - provider/index.tsx, hooks/useRoute.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface RoutingOptions {
  accessibility?: AccessibilityMode;
  // Extra cost per level change, so the router prefers one
  // stairwell over zig-zagging between floors
  minimizeFloorChanges?: boolean;
  // Edge kinds to refuse outright (a closed stairwell today)
  avoid?: EdgeKind[];
  // Metres per second per edge kind for the ETA — defaults in
  // core/route.ts
  walkingSpeeds?: Partial<Record<EdgeKind, number>>;
  // "Now" for closedUntil checks, epoch milliseconds; omitted →
  // the wall clock at search time
  at?: number;
}







// -----------------------------------------------------------
// RoutePoint
// -----------------------------------------------------------
//
// One node of the walked route with the metres accumulated to
// reach it — the navigation cursor advances on atM.
//
// Used by:
//   - Route (below), core/route.ts, core/instructions.ts,
//     core/geometry.ts, testing/invariants.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface RoutePoint {
  nodeId: string;
  level: string;
  x: number;
  y: number;
  // Metres walked from the start to reach this point
  atM: number;
}







// -----------------------------------------------------------
// RouteFloorSegment
// -----------------------------------------------------------
//
// The polyline of one level's stretch of the route, in plan
// pixels — a plan renderer draws exactly these.
//
// Used by:
//   - Route (below), core/route.ts — assembleRoute
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface RouteFloorSegment {
  level: string;
  points: [number, number][];
  // How the walker ARRIVES on this level ('start' for the first)
  enteredBy: 'start' | EdgeKind;
}







// -----------------------------------------------------------
// Route
// -----------------------------------------------------------
//
// What the router answers: the points, the per-floor
// polylines, the totals and the derived instructions.
//
// Used by:
//   - core/route.ts, core/navigation.ts, core/instructions.ts
//   - hooks/useRoute.ts, hooks/useNavigation.ts,
//     provider/index.tsx, testing/invariants.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Route {
  fromNodeId: string;
  toNodeId: string;
  points: RoutePoint[];
  floors: RouteFloorSegment[];
  distanceM: number;
  etaSeconds: number;
  // The levels the route touches, in walking order, deduplicated
  levels: string[];
  steps: Instruction[];
}







// -----------------------------------------------------------
// TurnDirection
// -----------------------------------------------------------
//
// The turn vocabulary the geometry helpers speak — 'straight'
// exists so a corner-free bend still has a name.
//
// Used by:
//   - Instruction (below), core/geometry.ts,
//     core/instructions.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type TurnDirection = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'u-turn';







// -----------------------------------------------------------
// Instruction
// -----------------------------------------------------------
//
// One derived step of the route, in ids — the UI kit's
// KitInstruction is this with names instead.
//
// Used by:
//   - core/instructions.ts — buildInstructions' output
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type Instruction =
  | { type: 'depart'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'continue'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'turn'; atNodeId: string; direction: TurnDirection; distanceM: number; towardsRoomId?: string | null; landmark?: string | null }
  | { type: 'door'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'connector'; atNodeId: string; via: 'stairs' | 'elevator' | 'ramp'; fromLevel: string; toLevel: string; direction: 'up' | 'down'; distanceM: number }
  | { type: 'arrive'; atNodeId: string; roomId?: string | null; side?: 'left' | 'right' | 'ahead' | null };







// -----------------------------------------------------------
// NavigationState
// -----------------------------------------------------------
//
// What a screen renders while walking — the cursor's whole
// answer; field comments carry each value's contract.
//
// Used by:
//   - core/navigation.ts — the state() answer
//   - hooks/useNavigation.ts — the hook's state
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface NavigationState {
  // Index into route.points of the node the walker stands at
  index: number;
  currentNodeId: string;
  nextNodeId: string | null;
  currentLevel: string;
  prevLevel: string | null;
  nextLevel: string | null;
  isStartFloor: boolean;
  isEndFloor: boolean;
  // The step whose action the walker performs NEXT
  stepIndex: number;
  step: Instruction | null;
  progressM: number;
  remainingM: number;
  remainingSeconds: number;
  // Plan-space bearing from the current node to the next one
  // (degrees, 0 = up the drawing towards smaller y, clockwise);
  // null at the destination and ahead of a level change
  bearingToNext: number | null;
  // The yaw inside the current node's panorama where the next
  // node sits — bearingToNext minus the node's panoYaw, folded
  // into [0, 360); null whenever bearingToNext is, or the node
  // carries no panorama or no panoYaw
  panoYawToNext: number | null;
  arrived: boolean;
  // The room the walker is in / passing (for "You are in …")
  currentRoomId: string | null;
}
