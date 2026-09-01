// -----------------------------------------------------------
//  [*] wayfindengine — testing: invariants
//
//  What a Route must be true of, and the conformance suite a
//  graph author runs over a building. A route is plain data
//  the router assembles from a search; a screen trusts every
//  field of it (the floor picker reads `levels`, the plan
//  draws `floors`, the walker reads `atM` off the points, the
//  voice reads `steps`), so a slip in the assembly — or a
//  hand-built route from a host — is caught here with a
//  message that names the point, the edge or the step at
//  fault, never a bare "expected true".
//
//  assertRouteInvariants checks, in this order:
//    - fromNodeId / toNodeId name the first and last point
//    - every point names a known node on the level it claims
//    - consecutive points are joined by an edge the index's
//      adjacency knows (a one-way edge only in its direction)
//    - a level change is walked over a connector edge only
//    - atM starts at 0, never decreases, and grows by exactly
//      the joining edge's metres; distanceM is the last atM
//    - floors cover every point in order, split exactly at
//      the level changes, and say how each was entered
//    - levels is the deduplicated walking order of the points'
//      levels
//    - steps are at least an arrive, open with a depart when
//      there is more, stand on the route in walking order and
//      sum to the route's metres
//    - under { accessibility: 'accessible' } no stairs edge is
//      walked; under 'noInaccessibleFloorChanges' no stairs
//      edge changes level
//
//  Where two edges join the same pair of nodes the one whose
//  length explains the atM step is taken as the one walked (a
//  Route carries points, not edges).
//
//  describeGraphContract is a jest describe-factory: given a
//  graph maker it proves validateGraph is clean, every room is
//  reachable from the entrance in every mode (minus the rooms
//  declared inaccessible), room pairs route both ways at the
//  same distance where no one-way edge is involved, every
//  route found passes the invariants, and every printed code
//  round-trips through parseAnchor / formatAnchor.
//
//  Used by:
//    - src/__tests__/contract.test.ts — the sample building's run
//    - any host's own graph test file
// -----------------------------------------------------------

import { formatAnchor, nodeForRoom, parseAnchor } from '../core/anchors';
import { edgeLengthM, indexGraph, validateGraph, type GraphIndex } from '../core/graph';
import { findRoute } from '../core/route';
import type { AccessibilityMode, BuildingGraph, EdgeKind, GraphEdge, Room, Route, RoutePoint } from '../core/types';


export interface RouteInvariantOptions {
  accessibility?: AccessibilityMode;
}

export interface GraphContractOptions {
  // Rooms with no accessible route on purpose (up a few steps
  // with no lift) — the suite proves they really have none
  expectInaccessible?: string[];
  // The scheme the graph's qr payloads carry, when not knf://
  anchorScheme?: string;
}


// Float noise in a sum of edge lengths is far below this; a
// wrong metersPerPixel or a stale lengthM is far above it
const EPSILON_M = 1e-6;

// At most this many room pairs are routed both ways — a large
// building has thousands, and a spread of sixty finds the same
// slips
const MAX_PAIRS = 60;

const isConnector = (kind: EdgeKind): boolean => kind === 'stairs' || kind === 'elevator' || kind === 'ramp';







// -----------------------------------------------------------
// joiningEdge
// -----------------------------------------------------------
//
// The edge a route walked between two consecutive points: an
// adjacency entry from the first to the second (so a one-way
// edge only counts forwards). Two edges between one pair of
// nodes is legal — a hallway beside a few steps — and the one
// whose metres explain the atM step is the one walked; across
// a level change only connector kinds are candidates unless
// none joins, in which case the wrong-kind edge is answered so
// the caller can name it.
//
// Used by:
//   - assertRouteInvariants / walkedEdges (below)
// -----------------------------------------------------------

function joiningEdge(index: GraphIndex, from: RoutePoint, to: RoutePoint): GraphEdge | null {

  const joins = (index.adjacency.get(from.nodeId) ?? []).filter((n) => n.nodeId === to.nodeId).map((n) => n.edge);
  if (joins.length === 0) return null;


  const connectors = joins.filter((edge) => isConnector(edge.kind));
  const candidates = from.level !== to.level && connectors.length > 0 ? connectors : joins;
  const delta = to.atM - from.atM;
  let best = candidates[0];
  for (const edge of candidates) {
    if (Math.abs(edgeLengthM(index, edge) - delta) < Math.abs(edgeLengthM(index, best) - delta)) best = edge;
  }
  return best;
}


// Every edge a valid route walked, in order — for a route that
// has passed the invariants, so a missing join cannot happen
const walkedEdges = (index: GraphIndex, route: Route): GraphEdge[] => {
  const edges: GraphEdge[] = [];
  for (let i = 1; i < route.points.length; i++) {
    const edge = joiningEdge(index, route.points[i - 1], route.points[i]);
    if (edge) edges.push(edge);
  }
  return edges;
};







// -----------------------------------------------------------
// assertRouteInvariants
// -----------------------------------------------------------
//
//   assertRouteInvariants(index, route)
//   assertRouteInvariants(index, route, { accessibility: 'accessible' })
//
// Throws an Error whose message names the first thing wrong;
// returns nothing when the route is sound.
//
// Used by:
//   - describeGraphContract (below) — over every route it finds
//   - src/testing/__tests__/invariants.test.ts
//   - hosts asserting over a hand-built route
// -----------------------------------------------------------

export function assertRouteInvariants(index: GraphIndex, route: Route, options: RouteInvariantOptions = {}): void {

  // Typed on the binding, not the arrow: that is what lets the
  // checker treat a call as an assertion and narrow after it
  const fail: (message: string) => never = (message) => {
    throw new Error(`route '${route.fromNodeId}' → '${route.toNodeId}': ${message}`);
  };
  const { points, floors, steps } = route;
  const last = points.length - 1;
  if (points.length === 0) fail('has no points');
  if (points[0].nodeId !== route.fromNodeId) fail(`fromNodeId is '${route.fromNodeId}' but points[0] is '${points[0].nodeId}'`);
  if (points[last].nodeId !== route.toNodeId) fail(`toNodeId is '${route.toNodeId}' but points[${last}] is '${points[last].nodeId}'`);
  if (points[0].atM !== 0) fail(`points[0].atM is ${points[0].atM}, not 0`);


  // The hops, each against the edge that must explain it
  const walked: GraphEdge[] = [];
  for (let i = 0; i <= last; i++) {
    const point = points[i];
    const node = index.nodes.get(point.nodeId);
    if (!node) fail(`points[${i}] names unknown node '${point.nodeId}'`);
    if (node.level !== point.level) fail(`points[${i}] ('${point.nodeId}') claims level '${point.level}' but the node sits on '${node.level}'`);
    if (i === 0) continue;


    const prev = points[i - 1];
    if (point.atM < prev.atM) fail(`atM goes backwards at points[${i}]: ${point.atM} after ${prev.atM} at points[${i - 1}]`);
    const edge = joiningEdge(index, prev, point);
    if (!edge) fail(`no edge joins '${prev.nodeId}' to '${point.nodeId}' (points[${i - 1}] → points[${i}])`);
    if (prev.level !== point.level && !isConnector(edge.kind)) {
      fail(`points[${i - 1}] → points[${i}] changes level '${prev.level}' → '${point.level}' over a '${edge.kind}' edge, not a connector`);
    }
    const metres = edgeLengthM(index, edge);
    const delta = point.atM - prev.atM;
    if (Math.abs(delta - metres) > EPSILON_M) fail(`atM grows by ${delta} from points[${i - 1}] to points[${i}] but edge ${edge.a}-${edge.b} measures ${metres} m`);


    if (options.accessibility === 'accessible' && edge.kind === 'stairs') fail(`walks stairs edge ${edge.a}-${edge.b} in accessible mode`);
    if (options.accessibility === 'noInaccessibleFloorChanges' && edge.kind === 'stairs' && prev.level !== point.level) {
      fail(`changes level over stairs edge ${edge.a}-${edge.b} in noInaccessibleFloorChanges mode`);
    }
    walked.push(edge);
  }
  if (Math.abs(route.distanceM - points[last].atM) > EPSILON_M) fail(`distanceM is ${route.distanceM} but the last point is at ${points[last].atM} m`);


  // Floors: a cursor over the points, advanced by every drawn
  // vertex, must end exactly on the route's last point
  let cursor = 0;
  floors.forEach((floor, k) => {
    if (floor.points.length === 0) fail(`floors[${k}] has no points`);
    if (k === 0 && floor.enteredBy !== 'start') fail(`floors[0] is entered by '${floor.enteredBy}', not 'start'`);
    if (k > 0 && floor.enteredBy === 'start') fail(`floors[${k}] is entered by 'start' — only the first floor is`);
    if (k > 0 && floor.level === floors[k - 1].level) fail(`floors[${k - 1}] and floors[${k}] are both on '${floor.level}' — a segment splits only at a level change`);
    floor.points.forEach(([x, y], j) => {
      const point = points[cursor];
      if (!point) fail(`floors[${k}].points[${j}] runs past the route's ${points.length} points`);
      if (point.level !== floor.level) fail(`floors[${k}] is on '${floor.level}' but points[${cursor}] ('${point.nodeId}') is on '${point.level}'`);
      if (x !== point.x || y !== point.y) fail(`floors[${k}].points[${j}] is (${x}, ${y}) but points[${cursor}] ('${point.nodeId}') is (${point.x}, ${point.y})`);
      if (k > 0 && j === 0 && floor.enteredBy !== walked[cursor - 1].kind) {
        fail(`floors[${k}] says it was entered by '${floor.enteredBy}' but the edge walked in is a '${walked[cursor - 1].kind}'`);
      }
      cursor++;
    });
  });
  if (cursor !== points.length) fail(`floors cover ${cursor} points but the route has ${points.length}`);


  const expectedLevels: string[] = [];
  for (const point of points) {
    if (!expectedLevels.includes(point.level)) expectedLevels.push(point.level);
  }
  if (route.levels.length !== expectedLevels.length || route.levels.some((level, i) => level !== expectedLevels[i])) {
    fail(`levels is [${route.levels.join(', ')}] but the points walk [${expectedLevels.join(', ')}]`);
  }


  if (steps.length === 0) fail('has no steps — a route ends with an arrive step at the least');
  const closing = steps[steps.length - 1];
  if (closing.type !== 'arrive') fail(`steps end with '${closing.type}', not 'arrive'`);
  if (steps.length > 1 && steps[0].type !== 'depart') fail(`steps start with '${steps[0].type}', not 'depart'`);
  if (closing.atNodeId !== route.toNodeId) fail(`the arrive step stands at '${closing.atNodeId}', not at the destination '${route.toNodeId}'`);


  // Steps stand on the route in walking order — two may share a
  // node (a depart and the stairs opening there), none may go
  // back — and measure the whole route between them
  let at = 0;
  let measured = 0;
  steps.forEach((step, k) => {
    const i = points.findIndex((point, j) => j >= at && point.nodeId === step.atNodeId);
    if (i < 0) fail(`steps[${k}] ('${step.type}') stands at '${step.atNodeId}', which the route does not visit at or after points[${at}]`);
    at = i;
    if (step.type !== 'arrive') measured += step.distanceM;
  });
  if (Math.abs(measured - route.distanceM) > EPSILON_M) fail(`steps measure ${measured} m in total but the route is ${route.distanceM} m`);
}







// -----------------------------------------------------------
// describeGraphContract
// -----------------------------------------------------------
//
//   describeGraphContract('faculty', () => require('./graph.json'))
//   describeGraphContract('annex', makeAnnex, { expectInaccessible: ['r-attic'] })
//
// Call it inside a jest file. The graph is built once for the
// suite; every failure names the room, the pair or the node at
// fault.
//
// Used by:
//   - src/__tests__/contract.test.ts — the sample building
//   - any host's own graph test file
// -----------------------------------------------------------

export function describeGraphContract(name: string, makeGraph: () => BuildingGraph, options: GraphContractOptions = {}): void {
  describe(`BuildingGraph contract — ${name}`, () => {
    let graph: BuildingGraph;
    let index: GraphIndex;
    let entrance: string;
    const inaccessible = new Set(options.expectInaccessible ?? []);

    beforeAll(() => {
      graph = makeGraph();
      index = indexGraph(graph);
      entrance = graph.entranceNodeId ?? '';
    });


    // A route the suite expects to exist, or a message that says
    // which one is missing and why
    const routeOrFail = (from: string, to: string, what: string, accessibility: AccessibilityMode = 'shortest'): Route => {
      const result = findRoute(index, from, to, { accessibility });
      if (!result.route) throw new Error(`${what}: no '${accessibility}' route from '${from}' to '${to}' (${result.reason})`);
      return result.route;
    };


    it('validateGraph reports no errors', () => {
      const errors = validateGraph(graph).filter((issue) => issue.severity === 'error');
      expect(errors).toEqual([]);
    });

    it('names an entrance node the default routes start from', () => {
      expect(typeof graph.entranceNodeId).toBe('string');
      expect(index.nodes.has(entrance)).toBe(true);
    });

    it('lists only real rooms as inaccessible', () => {
      for (const roomId of inaccessible) {
        if (!index.rooms.has(roomId)) throw new Error(`expectInaccessible names '${roomId}', which is not a room`);
      }
    });


    it('reaches every room from the entrance', () => {
      for (const room of graph.rooms) {
        const route = routeOrFail(entrance, room.nodeId, `room '${room.id}'`);
        expect(route.toNodeId).toBe(room.nodeId);
        assertRouteInvariants(index, route);
      }
    });

    it('reaches every room in accessible mode, except those declared inaccessible', () => {
      for (const room of graph.rooms) {
        if (inaccessible.has(room.id)) {
          const result = findRoute(index, entrance, room.nodeId, { accessibility: 'accessible' });
          if (result.route) throw new Error(`room '${room.id}' is declared inaccessible but an accessible route exists`);
          continue;
        }
        const route = routeOrFail(entrance, room.nodeId, `room '${room.id}'`, 'accessible');
        assertRouteInvariants(index, route, { accessibility: 'accessible' });
      }
    });

    it('reaches every accessible room without a stairs floor change too', () => {
      // The mode sits between shortest and accessible, so an
      // accessible room must be reachable under it as well
      for (const room of graph.rooms) {
        if (inaccessible.has(room.id)) continue;
        const route = routeOrFail(entrance, room.nodeId, `room '${room.id}'`, 'noInaccessibleFloorChanges');
        assertRouteInvariants(index, route, { accessibility: 'noInaccessibleFloorChanges' });
      }
    });


    it('routes room pairs both ways at the same distance where no one-way edge is involved', () => {
      // A room that cannot route back to the entrance sits behind
      // a one-way edge; pairs with it are skipped outright — the
      // entrance test already proved the way in
      const locked = new Set(graph.rooms.filter((room) => findRoute(index, room.nodeId, entrance).route === null).map((room) => room.id));
      for (const [a, b] of samplePairs(graph.rooms.filter((room) => !locked.has(room.id)))) {
        const forward = routeOrFail(a.nodeId, b.nodeId, `rooms '${a.id}' → '${b.id}'`);
        const backward = routeOrFail(b.nodeId, a.nodeId, `rooms '${b.id}' → '${a.id}'`);
        assertRouteInvariants(index, forward);
        assertRouteInvariants(index, backward);
        const oneWay = [...walkedEdges(index, forward), ...walkedEdges(index, backward)].some((edge) => edge.oneWay);
        if (oneWay) continue;
        if (Math.abs(forward.distanceM - backward.distanceM) > EPSILON_M) {
          throw new Error(`rooms '${a.id}' ↔ '${b.id}': ${forward.distanceM} m one way, ${backward.distanceM} m back`);
        }
      }
    });

    it('every route from the entrance passes the invariants in every mode', () => {
      const modes: AccessibilityMode[] = ['shortest', 'accessible', 'noInaccessibleFloorChanges'];
      for (const node of graph.nodes) {
        for (const accessibility of modes) {
          for (const minimizeFloorChanges of [false, true]) {
            const { route } = findRoute(index, entrance, node.id, { accessibility, minimizeFloorChanges });
            if (route) assertRouteInvariants(index, route, { accessibility });
          }
        }
      }
    });


    it('round-trips every posted code through parseAnchor / formatAnchor', () => {
      const scheme = options.anchorScheme;
      for (const node of graph.nodes) {
        if (!node.qr) continue;
        const anchor = parseAnchor(node.qr, scheme);
        if (!anchor) throw new Error(`node '${node.id}' carries qr '${node.qr}', which parseAnchor does not recognise`);
        // A code at a door may name the room rather than the node;
        // either way it must land on the node it is posted at
        const lands = anchor.kind === 'node' ? anchor.nodeId : nodeForRoom(index, anchor.roomId);
        if (lands !== node.id) throw new Error(`node '${node.id}' carries qr '${node.qr}', which resolves to '${lands}'`);
        expect(formatAnchor(anchor, scheme)).toBe(node.qr.trim());
        expect(parseAnchor(formatAnchor({ kind: 'node', nodeId: node.id }, scheme), scheme)).toEqual({ kind: 'node', nodeId: node.id });
      }
    });
  });
}


// Every unordered pair when there are few rooms, an even spread
// of MAX_PAIRS over them when there are many — deterministic, so
// a failure reproduces
const samplePairs = (rooms: Room[]): [Room, Room][] => {
  const all: [Room, Room][] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) all.push([rooms[i], rooms[j]]);
  }
  if (all.length <= MAX_PAIRS) return all;
  const stride = all.length / MAX_PAIRS;
  return Array.from({ length: MAX_PAIRS }, (_, k) => all[Math.floor(k * stride)]);
};
