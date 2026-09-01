// -----------------------------------------------------------
//  [*] wayfindengine — route
//
//  The router: A* over the indexed graph, costed in SECONDS
//  rather than metres so that stairs, doors and an elevator's
//  wait all weigh what they cost a walker — the shortest line
//  through a building is rarely the quickest walk. Every edge
//  kind has a walking speed (hosts may override any of them)
//  and an elevator edge also pays a fixed wait per hop, which
//  is why a one-floor hop by elevator loses to the stairs for
//  anyone who can take them while a long ride still wins.
//
//  Accessibility is a FILTER, not a cost: 'accessible' never
//  expands a stairs edge, 'noInaccessibleFloorChanges' refuses
//  only the stairs edges that change level (a few steps along
//  one corridor stay allowed), and `avoid` refuses kinds
//  outright. A route that needs a refused edge does not exist
//  — the answer is 'no_path', never a route that quietly
//  breaks the promise. One-way edges are already directional
//  in the index's adjacency, so the search sees nothing of
//  them.
//
//  The heuristic is straight-line metres on the goal's level
//  over the fastest speed, and zero from any other level. The
//  straight line is the shortest walk only on a plan drawn to
//  scale — an explicit lengthM may undercut its chord on a
//  hand-measured plan, and the type lets it — so the estimate
//  is multiplied by the index's heuristicScale (the smallest
//  length-to-chord ratio over the graph's measured same-level
//  edges, capped at 1). That keeps it admissible for every
//  graph, not only the ones validateGraph's 'length_under_chord'
//  warning was heeded on. It is NOT consistent — it drops to
//  zero on leaving the goal's level — so the search keeps no
//  closed set and re-expands a node whenever a cheaper way to
//  it turns up. On a building graph of a few hundred nodes that
//  costs nothing and keeps the answer optimal.
//
//  An edge the search cannot price — an unknown kind has no
//  speed, a NaN or infinite lengthM no metres, a negative one a
//  walk backwards — is skipped, never walked: a NaN cost is
//  false under every comparison, so it would have the search
//  re-push the same neighbours until the heap exhausted memory,
//  and a negative one would lap a cycle for ever. validateGraph
//  reports all three as errors; the router does not rely on it.
//
//  Split into:
//
//    DEFAULT_WALKING_SPEEDS / ELEVATOR_WAIT_S — the assumptions
//    edgeSeconds   — one edge's walking time
//    findRoute     — the search
//    assembleRoute — the Route a screen consumes
// -----------------------------------------------------------

import { edgeLengthM, type GraphIndex } from './graph';
import { buildInstructions } from './instructions';
import type { EdgeKind, GraphEdge, GraphNode, Route, RouteFloorSegment, RoutePoint, RoutingOptions } from './types';


export interface RouteResult {
  route: Route | null;
  // Why route is null: an endpoint the graph does not know, or
  // no walkable way between two known nodes under the options
  reason?: 'unknown_node' | 'no_path';
}

// Metres per second per edge kind — a brisk indoor walk along
// a hallway, slower through doors and on ramps, slower still
// on stairs, and an elevator's ride speed on top of its wait
export const DEFAULT_WALKING_SPEEDS: Record<EdgeKind, number> = {
  hallway: 1.3,
  door: 1.0,
  ramp: 1.0,
  stairs: 0.6,
  elevator: 0.5,
};

// Seconds an elevator edge pays on top of its ride — the call
// and the wait. Charged per edge, so a ride drawn floor by
// floor pays it at every floor
export const ELEVATOR_WAIT_S = 30;

// Seconds added per level change under minimizeFloorChanges: a
// whole minute, so a shortcut through another floor has to save
// real walking before it is worth a second stairwell
const FLOOR_CHANGE_PENALTY_S = 60;


// A host override that is not a positive finite number (0 to
// "switch a kind off", a NaN from a settings field) would turn
// every cost into Infinity or NaN and the search into nonsense;
// such an entry keeps the default. Refusing a kind is what
// `avoid` is for
const resolveSpeeds = (overrides: Partial<Record<EdgeKind, number>> | undefined): Record<EdgeKind, number> => {
  const speeds = { ...DEFAULT_WALKING_SPEEDS };
  if (!overrides) return speeds;
  for (const kind of Object.keys(speeds) as EdgeKind[]) {
    const value = overrides[kind];
    if (value != null && Number.isFinite(value) && value > 0) speeds[kind] = value;
  }
  return speeds;
};


// The open set: a binary min-heap on f. Entries are never
// updated in place — a cheaper way to a node pushes a fresh
// entry, and the stale one is recognised on pop by carrying a
// worse g than the node's best
interface OpenEntry {
  nodeId: string;
  g: number;
  f: number;
}

const createOpenSet = () => {
  const heap: OpenEntry[] = [];

  const push = (entry: OpenEntry) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].f <= heap[i].f) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };

  const pop = (): OpenEntry | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop() as OpenEntry;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left;
        if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  return { push, pop };
};


// One walked edge and the node it arrives at
interface Hop {
  node: GraphNode;
  edge: GraphEdge;
}

// The search's back-pointer: how a node was reached cheapest
interface BackPointer {
  nodeId: string;
  edge: GraphEdge;
}







// -----------------------------------------------------------
// edgeSeconds
// -----------------------------------------------------------
//
// One edge's walking time: its metre length over the speed of
// its kind, plus the wait for an elevator. Takes the resolved
// speed table (defaults with the host's overrides folded in)
// so a search prices every edge by the same assumptions; public
// so a host can price one leg exactly the way the ETA does.
//
// Used by:
//   - findRoute / assembleRoute (below) — edge costs and the ETA
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function edgeSeconds(index: GraphIndex, edge: GraphEdge, speeds: Record<EdgeKind, number> = DEFAULT_WALKING_SPEEDS): number {

  const seconds = edgeLengthM(index, edge) / speeds[edge.kind];
  const wait = edge.kind === 'elevator' ? ELEVATOR_WAIT_S : 0;
  // An authored delay (a badge reader, a queue) is time too; a
  // nonsense value is ignored rather than poisoning the search
  const delay = typeof edge.delaySeconds === 'number' && Number.isFinite(edge.delaySeconds) && edge.delaySeconds > 0 ? edge.delaySeconds : 0;
  return seconds + wait + delay;
}







// -----------------------------------------------------------
// findRoute
// -----------------------------------------------------------
//
//   findRoute(index, 'entrance', 'room-201')
//   findRoute(index, from, to, { accessibility: 'accessible' })
//
// Answers { route } or { route: null, reason }: 'unknown_node'
// when an endpoint is not in the graph, 'no_path' when the two
// are known but no walkable way joins them under the options.
// from === to is a one-point route of zero metres.
//
// Used by:
//   - hooks/useRoute.ts — the memoised route for a from/to pair
//   - testing/invariants.ts — assertRouteInvariants over pairs
// -----------------------------------------------------------

export function findRoute(index: GraphIndex, fromNodeId: string, toNodeId: string, options: RoutingOptions = {}): RouteResult {

  const from = index.nodes.get(fromNodeId);
  const to = index.nodes.get(toNodeId);
  if (!from || !to) return { route: null, reason: 'unknown_node' };


  const speeds = resolveSpeeds(options.walkingSpeeds);
  if (from === to) return { route: assembleRoute(index, from, [], speeds) };


  // The filters, decided BEFORE an edge is expanded — a refused
  // edge is invisible to the search, not merely expensive
  const accessibility = options.accessibility ?? 'shortest';
  const avoid = new Set<EdgeKind>(options.avoid ?? []);
  const at = options.at ?? Date.now();
  const passable = (edge: GraphEdge, a: GraphNode, b: GraphNode): boolean => {
    if (avoid.has(edge.kind)) return false;
    // A shut edge is refused like an avoided kind until it reopens
    if (edge.closedUntil != null && edge.closedUntil > at) return false;
    if (edge.kind !== 'stairs') return true;
    if (accessibility === 'accessible') return false;
    return !(accessibility === 'noInaccessibleFloorChanges' && a.level !== b.level);
  };


  // Straight-line seconds to the goal on its own level, zero
  // from anywhere else, shrunk by heuristicScale so no measured
  // edge undercuts it. A level the index does not know
  // (validateGraph has flagged it) scales at 1 m per pixel,
  // exactly as edgeLengthM does
  const fastest = Math.max(...Object.values(speeds));
  const goalScale = (index.levels.get(to.level)?.metersPerPixel ?? 1) * index.heuristicScale;
  const heuristic = (node: GraphNode): number =>
    node.level === to.level ? (Math.hypot(to.x - node.x, to.y - node.y) * goalScale) / fastest : 0;


  const gScore = new Map<string, number>([[fromNodeId, 0]]);
  const cameFrom = new Map<string, BackPointer>();
  const open = createOpenSet();
  open.push({ nodeId: fromNodeId, g: 0, f: heuristic(from) });


  for (let entry = open.pop(); entry; entry = open.pop()) {
    // A stale entry: the node was reached cheaper after this one
    // was pushed, and the cheaper entry does the expanding
    if (entry.g > (gScore.get(entry.nodeId) ?? Infinity)) continue;
    // Goal test on pop, not on push — with an admissible
    // heuristic the first pop of the goal is the cheapest way
    if (entry.nodeId === toNodeId) return { route: assembleRoute(index, from, traceBack(index, cameFrom, fromNodeId, toNodeId), speeds) };


    const node = index.nodes.get(entry.nodeId) as GraphNode;
    for (const { nodeId: nextId, edge } of index.adjacency.get(entry.nodeId) ?? []) {
      const next = index.nodes.get(nextId);
      if (!next || !passable(edge, node, next)) continue;
      const penalty = options.minimizeFloorChanges && node.level !== next.level ? FLOOR_CHANGE_PENALTY_S : 0;
      // An unpriceable edge is invisible, like a refused one:
      // NaN passes every comparison below and would loop, a
      // negative cost would lap a cycle for ever
      const seconds = edgeSeconds(index, edge, speeds);
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      const g = entry.g + seconds + penalty;
      if (g >= (gScore.get(nextId) ?? Infinity)) continue;
      gScore.set(nextId, g);
      cameFrom.set(nextId, { nodeId: entry.nodeId, edge });
      open.push({ nodeId: nextId, g, f: g + heuristic(next) });
    }
  }


  return { route: null, reason: 'no_path' };
}


// The hops from the start to the goal, read off the
// back-pointers the search left behind
const traceBack = (index: GraphIndex, cameFrom: Map<string, BackPointer>, fromNodeId: string, toNodeId: string): Hop[] => {
  const hops: Hop[] = [];
  for (let cursor = toNodeId; cursor !== fromNodeId; ) {
    const back = cameFrom.get(cursor) as BackPointer;
    hops.push({ node: index.nodes.get(cursor) as GraphNode, edge: back.edge });
    cursor = back.nodeId;
  }
  return hops.reverse();
};







// -----------------------------------------------------------
// assembleRoute
// -----------------------------------------------------------
//
// The Route a screen consumes, from the start node and the
// hops walked: points with the metres accumulated so far, the
// polyline per level (split wherever a hop changes level — the
// connector itself is never drawn, its two ends lie on two
// different plans), the levels in walking order, the ETA as
// the sum of edge seconds WITHOUT the search's preference
// penalties (a penalty steers the choice, it is not time
// spent), and the instructions. No hops is the from === to
// route: one point, zero metres.
//
// Used by:
//   - findRoute (above)
// -----------------------------------------------------------

function assembleRoute(index: GraphIndex, from: GraphNode, hops: Hop[], speeds: Record<EdgeKind, number>): Route {

  const points: RoutePoint[] = [{ nodeId: from.id, level: from.level, x: from.x, y: from.y, atM: 0 }];
  const floors: RouteFloorSegment[] = [{ level: from.level, points: [[from.x, from.y]], enteredBy: 'start' }];
  const edges: GraphEdge[] = [];
  let atM = 0;
  let seconds = 0;


  for (const { node, edge } of hops) {
    atM += edgeLengthM(index, edge);
    seconds += edgeSeconds(index, edge, speeds);
    edges.push(edge);
    points.push({ nodeId: node.id, level: node.level, x: node.x, y: node.y, atM });
    const current = floors[floors.length - 1];
    if (node.level === current.level) current.points.push([node.x, node.y]);
    else floors.push({ level: node.level, points: [[node.x, node.y]], enteredBy: edge.kind });
  }


  // A route that comes back to a floor lists it once, where it
  // was first entered — the floor picker wants a set in order,
  // the polylines above keep the segments apart
  const levels: string[] = [];
  for (const floor of floors) {
    if (!levels.includes(floor.level)) levels.push(floor.level);
  }


  return {
    fromNodeId: from.id,
    toNodeId: points[points.length - 1].nodeId,
    points,
    floors,
    distanceM: atM,
    etaSeconds: Math.round(seconds),
    levels,
    steps: buildInstructions(index, points, edges),
  };
}
