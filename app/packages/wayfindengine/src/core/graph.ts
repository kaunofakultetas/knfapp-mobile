// -----------------------------------------------------------
//  [*] wayfindengine — graph
//
//  The building graph, indexed for the hooks and the router:
//  nodes and rooms by id, adjacency per node, levels by id in
//  ordinal order, and the heuristic scale the router needs to
//  stay optimal on a plan whose explicit lengths undercut the
//  drawing. Built once per graph object (hosts hand in an
//  immutable graph; the index is memoised on identity).
//
//  validateGraph is the authoring safety net: an edge whose
//  endpoint does not exist, a node on an unknown level, a
//  cross-level edge that is not a connector kind, a connector
//  between floors without a length, an edge kind outside the
//  vocabulary, a lengthM that is not a finite non-negative
//  number, a room pointing at a missing node, a duplicate id —
//  every one of these is a silent routing failure later (a
//  free teleport between floors, a NaN cost, a route walked
//  backwards), so the check runs at build time and in the
//  plan-to-graph tool. A node kind outside the vocabulary and
//  a same-level length below its chord are warnings: neither
//  breaks the router's arithmetic. Issues are reported, never
//  thrown: an authoring tool shows them all at once.
//
//  Split into:
//
//    GraphIssue / validateGraph — the authoring checks
//    GraphIndex / indexGraph    — lookups + adjacency + heuristic scale
//    edgeLengthM                — the metre length of one edge
// -----------------------------------------------------------

import type { BuildingGraph, EdgeKind, GraphEdge, GraphNode, Level, NodeKind, Room } from './types';


export interface GraphIssue {
  severity: 'error' | 'warning';
  code:
    | 'duplicate_id'
    | 'unknown_level'
    | 'dangling_edge'
    | 'cross_level_hallway'
    | 'connector_without_length'
    | 'unknown_kind'
    | 'bad_length'
    | 'length_under_chord'
    | 'bad_pano_geometry'
    | 'pano_link_unknown'
    | 'room_without_node'
    | 'unreachable_node'
    | 'missing_entrance'
    | 'zero_length_edge';
  message: string;
  // The offending id (node, edge "a-b", room, level)
  ref: string;
}


// The graph is plain JSON a host may hand-write, so the type
// unions guard nothing at runtime — the kinds are checked by
// value. An edge kind indexes the router's speed table, a node
// kind never reaches any arithmetic
const EDGE_KINDS = new Set<string>(['hallway', 'door', 'stairs', 'elevator', 'ramp'] satisfies EdgeKind[]);
const NODE_KINDS = new Set<string>(['corridor', 'door', 'stairs', 'elevator', 'ramp', 'entrance', 'room'] satisfies NodeKind[]);

// An explicit same-level length may sit this far under its
// plan chord before it counts as a mis-measure — hand-measured
// tapes and rounded plan scales disagree by less
const CHORD_TOLERANCE = 0.005;


// The plan chord between two same-level nodes in metres, at 1 m
// per pixel on a level the map does not know — exactly as
// edgeLengthM measures. A cross-level pair has no chord at all:
// its ends share no plan space
const chordM = (levels: Map<string, Level>, a: GraphNode, b: GraphNode): number =>
  Math.hypot(b.x - a.x, b.y - a.y) * (levels.get(a.level)?.metersPerPixel ?? 1);

const isGoodLength = (lengthM: number): boolean => Number.isFinite(lengthM) && lengthM >= 0;







// -----------------------------------------------------------
// validateGraph
// -----------------------------------------------------------
//
// Used by:
//   - tools/svgToGraph.ts — mergeLevels folds its issues in beside the emitted graph
//   - provider/index.tsx — dev-time warning once per graph
//   - testing/invariants.ts
// -----------------------------------------------------------

export function validateGraph(graph: BuildingGraph): GraphIssue[] {

  const issues: GraphIssue[] = [];
  const levels = new Map<string, Level>();
  const nodes = new Map<string, GraphNode>();


  for (const level of graph.levels) {
    if (levels.has(level.id)) issues.push({ severity: 'error', code: 'duplicate_id', message: `level '${level.id}' is defined twice`, ref: level.id });
    levels.set(level.id, level);
  }


  for (const node of graph.nodes) {
    if (nodes.has(node.id)) issues.push({ severity: 'error', code: 'duplicate_id', message: `node '${node.id}' is defined twice`, ref: node.id });
    nodes.set(node.id, node);
    if (!levels.has(node.level)) {
      issues.push({ severity: 'error', code: 'unknown_level', message: `node '${node.id}' sits on unknown level '${node.level}'`, ref: node.id });
    }
    if (!NODE_KINDS.has(node.kind)) {
      issues.push({ severity: 'warning', code: 'unknown_kind', message: `node '${node.id}' has unknown kind '${node.kind}'`, ref: node.id });
    }
  }


  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    const ref = `${edge.a}-${edge.b}`;
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) {
      issues.push({ severity: 'error', code: 'dangling_edge', message: `edge ${ref} references a missing node`, ref });
      continue;
    }
    const key = edge.oneWay ? ref : [edge.a, edge.b].sort().join('-');
    if (seenEdges.has(key)) issues.push({ severity: 'warning', code: 'duplicate_id', message: `edge ${ref} is defined twice`, ref });
    seenEdges.add(key);
    // An unknown edge kind has no walking speed — the router
    // would price it NaN and never stop searching
    if (!EDGE_KINDS.has(edge.kind)) {
      issues.push({ severity: 'error', code: 'unknown_kind', message: `edge ${ref} has unknown kind '${edge.kind}'`, ref });
    }
    // A length is checked by value before it is compared with
    // anything: a negative one walks a route backwards, NaN and
    // Infinity poison every metre after it
    const hasLength = edge.lengthM != null;
    const goodLength = hasLength && isGoodLength(edge.lengthM as number);
    if (hasLength && !goodLength) {
      issues.push({ severity: 'error', code: 'bad_length', message: `edge ${ref} has lengthM ${edge.lengthM}`, ref });
    }
    // A level change is a connector by definition; a hallway or a
    // door drawn between floors is an authoring slip. A connector
    // has no plan chord to fall back on, so without a length it
    // would be walked for 0 m
    if (a.level !== b.level) {
      if (edge.kind !== 'stairs' && edge.kind !== 'elevator' && edge.kind !== 'ramp') {
        issues.push({ severity: 'error', code: 'cross_level_hallway', message: `edge ${ref} changes level but is a '${edge.kind}'`, ref });
      } else if (!hasLength) {
        issues.push({ severity: 'error', code: 'connector_without_length', message: `edge ${ref} changes level but carries no lengthM`, ref });
      }
      continue;
    }
    if (a.x === b.x && a.y === b.y && !edge.lengthM) {
      issues.push({ severity: 'warning', code: 'zero_length_edge', message: `edge ${ref} joins two nodes at the same point`, ref });
    }
    // The straight line is the shortest walk between two points
    // on one plan, so an explicit length under it is a
    // mis-measure (the router stays optimal regardless — see
    // heuristicScale)
    const chord = levels.has(a.level) ? chordM(levels, a, b) : 0;
    if (goodLength && (edge.lengthM as number) < chord * (1 - CHORD_TOLERANCE)) {
      issues.push({ severity: 'warning', code: 'length_under_chord', message: `edge ${ref} has lengthM ${edge.lengthM} below its plan chord of ${chord.toFixed(2)} m`, ref });
    }
  }


  // Panorama facts are display-only, so both are warnings: a
  // sphere the stage cannot draw and a hotspot to nowhere
  for (const node of graph.nodes) {
    const g = node.panoGeometry;
    if (g && !(g.hfovDeg > 0 && g.hfovDeg <= 360 && g.vfovDeg > 0 && g.vfovDeg <= 180)) {
      issues.push({ severity: 'warning', code: 'bad_pano_geometry', message: `node '${node.id}' has a panorama geometry of ${g.hfovDeg}° × ${g.vfovDeg}°`, ref: node.id });
    }
    for (const link of node.panoLinks ?? []) {
      if (!nodes.has(link.targetNodeId) || link.targetNodeId === node.id) {
        issues.push({ severity: 'warning', code: 'pano_link_unknown', message: `node '${node.id}' links its panorama to '${link.targetNodeId}'`, ref: node.id });
      }
    }
  }


  const rooms = new Set<string>();
  for (const room of graph.rooms) {
    if (rooms.has(room.id)) issues.push({ severity: 'error', code: 'duplicate_id', message: `room '${room.id}' is defined twice`, ref: room.id });
    rooms.add(room.id);
    if (!nodes.has(room.nodeId)) {
      issues.push({ severity: 'error', code: 'room_without_node', message: `room '${room.id}' points at missing node '${room.nodeId}'`, ref: room.id });
    }
    if (!levels.has(room.level)) {
      issues.push({ severity: 'error', code: 'unknown_level', message: `room '${room.id}' sits on unknown level '${room.level}'`, ref: room.id });
    }
  }


  if (graph.entranceNodeId && !nodes.has(graph.entranceNodeId)) {
    issues.push({ severity: 'error', code: 'missing_entrance', message: `entranceNodeId '${graph.entranceNodeId}' is not a node`, ref: graph.entranceNodeId });
  }


  // Reachability from the entrance (or the first node): an
  // island the router can never reach is almost always a
  // forgotten edge
  const start = graph.entranceNodeId ?? graph.nodes[0]?.id;
  if (start && nodes.has(start)) {
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!nodes.has(edge.a) || !nodes.has(edge.b)) continue;
      adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b]);
      if (!edge.oneWay) adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a]);
    }
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of nodes.values()) {
      if (!seen.has(node.id)) {
        issues.push({ severity: 'warning', code: 'unreachable_node', message: `node '${node.id}' cannot be reached from '${start}'`, ref: node.id });
      }
    }
  }


  return issues;
}







// -----------------------------------------------------------
// GraphIndex / indexGraph
// -----------------------------------------------------------
//
// Used by:
//   - core/route.ts — adjacency for the search, heuristicScale
//     for its straight-line estimate
//   - core/navigation.ts, core/anchors.ts, core/search.ts
//   - provider/index.tsx — memoised on the graph object
// -----------------------------------------------------------

export interface Neighbour {
  nodeId: string;
  edge: GraphEdge;
}

export interface GraphIndex {
  graph: BuildingGraph;
  nodes: Map<string, GraphNode>;
  rooms: Map<string, Room>;
  levels: Map<string, Level>;
  // Levels in ordinal order (lowest first)
  orderedLevels: Level[];
  // Outgoing neighbours per node — one-way edges appear once
  adjacency: Map<string, Neighbour[]>;
  // Room whose node this is (first match), for "you are in …"
  roomByNode: Map<string, Room>;
  // The smallest lengthM-to-plan-chord ratio over the same-level
  // edges that carry an explicit length, capped at 1 (1 when
  // none do). A straight-line estimate times this never
  // overshoots a walk, however the plan was measured
  heuristicScale: number;
}

const indexes = new WeakMap<BuildingGraph, GraphIndex>();

export function indexGraph(graph: BuildingGraph): GraphIndex {
  const cached = indexes.get(graph);
  if (cached) return cached;


  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const rooms = new Map(graph.rooms.map((room) => [room.id, room]));
  const levels = new Map(graph.levels.map((level) => [level.id, level]));
  const orderedLevels = [...graph.levels].sort((a, b) => a.ordinal - b.ordinal);


  const adjacency = new Map<string, Neighbour[]>();
  const push = (from: string, to: string, edge: GraphEdge) => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const list = adjacency.get(from) ?? [];
    list.push({ nodeId: to, edge });
    adjacency.set(from, list);
  };
  for (const edge of graph.edges) {
    push(edge.a, edge.b, edge);
    if (!edge.oneWay) push(edge.b, edge.a, edge);
  }


  const roomByNode = new Map<string, Room>();
  for (const room of graph.rooms) {
    if (!roomByNode.has(room.nodeId)) roomByNode.set(room.nodeId, room);
  }


  // Only a usable length can undercut a chord; a bad one is the
  // validator's business and the router skips it anyway
  let heuristicScale = 1;
  for (const edge of graph.edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b || a.level !== b.level || edge.lengthM == null || !isGoodLength(edge.lengthM)) continue;
    const chord = chordM(levels, a, b);
    if (chord > 0) heuristicScale = Math.min(heuristicScale, edge.lengthM / chord);
  }


  const index: GraphIndex = { graph, nodes, rooms, levels, orderedLevels, adjacency, roomByNode, heuristicScale };
  indexes.set(graph, index);
  return index;
}







// -----------------------------------------------------------
// edgeLengthM
// -----------------------------------------------------------
//
// An explicit lengthM always wins (connectors MUST carry one —
// two stair nodes on different floors share no plan space);
// otherwise the plan distance between the endpoints scaled by
// the level's metersPerPixel. A cross-level edge without a
// length answers 0 — validateGraph reports that edge as an
// error ('connector_without_length'), so it only reaches the
// router on a graph nobody validated.
//
// Used by:
//   - core/route.ts — edge costs and the ETA
//   - core/instructions.ts — per-step distances
// -----------------------------------------------------------

export function edgeLengthM(index: GraphIndex, edge: GraphEdge): number {
  if (edge.lengthM != null) return edge.lengthM;
  const a = index.nodes.get(edge.a);
  const b = index.nodes.get(edge.b);
  if (!a || !b || a.level !== b.level) return 0;
  const level = index.levels.get(a.level);
  const scale = level?.metersPerPixel ?? 1;
  return Math.hypot(b.x - a.x, b.y - a.y) * scale;
}
