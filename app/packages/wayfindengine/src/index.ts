// -----------------------------------------------------------
//  [*] @knf/wayfindengine — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// The building vocabulary, routes, instructions, navigation state
export type {
  Level,
  NodeKind,
  GraphNode,
  EdgeKind,
  GraphEdge,
  RoomCategory,
  Room,
  BuildingGraph,
  AccessibilityMode,
  RoutingOptions,
  RoutePoint,
  RouteFloorSegment,
  Route,
  TurnDirection,
  Instruction,
  NavigationState,
} from './core/types';

// The index and the authoring checks
export { indexGraph, validateGraph, edgeLengthM, type GraphIndex, type GraphIssue, type Neighbour } from './core/graph';

// Geometry helpers, pure
export { bearingDeg, turnBetween, shortestArcDeg, compressPath, type PlanPoint } from './core/geometry';

// Routing (A* over typed edges, accessibility modes, ETA) — the
// edge pricing is public so a host can quote a leg the way the
// ETA does
export { findRoute, edgeSeconds, DEFAULT_WALKING_SPEEDS, ELEVATOR_WAIT_S, type RouteResult } from './core/route';

// Instructions (turns with landmarks, collapsed connectors)
export { buildInstructions } from './core/instructions';

// Walking a route
export { createNavigation, type Navigation } from './core/navigation';

// Anchors: QR payloads, nearest node, room → node
export { parseAnchor, formatAnchor, nearestNode, nodeForRoom, type Anchor } from './core/anchors';

// Room search (diacritic-folded, every token) and nearest-by-category
export { foldForSearch, searchRooms, nearestRoomByCategory, type RoomMatch, type SearchRoomsOptions } from './core/search';

// The provider every hook reads
export { WayfindProvider, useWayfind, type WayfindEnv } from './provider';

// Hooks
export { useRoute, type UseRouteResult } from './hooks/useRoute';
export { useNavigation, type UseNavigationResult } from './hooks/useNavigation';
export { useRoomSearch, type UseRoomSearchResult } from './hooks/useRoomSearch';

// Test doubles + invariants for graph authors
export { sampleBuilding } from './testing/sampleBuilding';
export { assertRouteInvariants, describeGraphContract } from './testing/invariants';

// The plan-to-graph authoring tool (pure, no filesystem):
// svgToGraph per drawing, mergeLevels across them
export {
  svgToGraph,
  mergeLevels,
  type SvgToGraphOptions,
  type SvgToGraphResult,
  type SvgToGraphIssue,
  type SvgIssueCode,
  type LevelConnector,
  type MergeLevelsOptions,
  type MergeLevelsResult,
} from './tools/svgToGraph';
