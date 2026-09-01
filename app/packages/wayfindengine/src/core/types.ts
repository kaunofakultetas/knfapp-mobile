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

export type NodeKind = 'corridor' | 'door' | 'stairs' | 'elevator' | 'ramp' | 'entrance' | 'room';

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

// The part of the sphere a panorama covers, in degrees. A full
// equirectangular photo is 360 × 180 centred on the horizon; a
// phone sweep is 360 × (360 · height / width); a single frame
// is the camera's own field of view
export interface PanoGeometry {
  hfovDeg: number;
  vfovDeg: number;
  // Yaw of the photo's centre column inside the sphere, when
  // the photo is not a full turn (0 = straight ahead)
  centreYawDeg?: number | null;
  // Pitch of the photo's centre row above the horizon
  vOffsetDeg?: number | null;
}

export type PanoHeadingSource = 'manual' | 'aligned' | 'compass' | 'path' | 'auto';

export interface PanoHeading {
  source: PanoHeadingSource;
  // The sensor reading at capture, degrees clockwise from
  // magnetic north, kept beside the derived panoYaw
  rawDeg?: number | null;
  // 0..1, from the sensor's own calibration state
  confidence?: number | null;
}

// An authored hotspot: where the target sits in THIS panorama
// and, optionally, which way the walker faces on arrival
export interface PanoLink {
  targetNodeId: string;
  yaw: number;
  pitch?: number | null;
  arrivalYaw?: number | null;
}

export type EdgeKind = 'hallway' | 'door' | 'stairs' | 'elevator' | 'ramp';

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

export type RoomCategory = 'wc' | 'exit' | 'lecture' | 'office' | 'service' | 'food' | 'other' | (string & {});

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
// Routing
// -----------------------------------------------------------

// 'shortest' walks anything; 'accessible' never uses stairs
// (ramps and elevators only); 'noInaccessibleFloorChanges'
// allows stairs on one level (a few steps) but changes level
// only by elevator or ramp
export type AccessibilityMode = 'shortest' | 'accessible' | 'noInaccessibleFloorChanges';

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

export interface RoutePoint {
  nodeId: string;
  level: string;
  x: number;
  y: number;
  // Metres walked from the start to reach this point
  atM: number;
}

// The polyline of one level's stretch of the route, in plan
// pixels — a plan renderer draws exactly these
export interface RouteFloorSegment {
  level: string;
  points: [number, number][];
  // How the walker ARRIVES on this level ('start' for the first)
  enteredBy: 'start' | EdgeKind;
}

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
// Instructions
// -----------------------------------------------------------

export type TurnDirection = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'u-turn';

export type Instruction =
  | { type: 'depart'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'continue'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'turn'; atNodeId: string; direction: TurnDirection; distanceM: number; towardsRoomId?: string | null; landmark?: string | null }
  | { type: 'door'; atNodeId: string; distanceM: number; towardsRoomId?: string | null }
  | { type: 'connector'; atNodeId: string; via: 'stairs' | 'elevator' | 'ramp'; fromLevel: string; toLevel: string; direction: 'up' | 'down'; distanceM: number }
  | { type: 'arrive'; atNodeId: string; roomId?: string | null; side?: 'left' | 'right' | 'ahead' | null };

// -----------------------------------------------------------
// Navigation
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
