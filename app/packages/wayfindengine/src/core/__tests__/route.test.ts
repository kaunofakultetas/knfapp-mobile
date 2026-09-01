// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine route
//
//  A* over a hand-drawn two-level building, pinned on time not
//  metres: the stairs beat the elevator for anyone who can take
//  them, the accessibility modes filter rather than penalise,
//  minimizeFloorChanges turns a quick zig-zag through the
//  upper floor into a longer walk along one, `avoid` on top of
//  a mode can leave no path at all, one-way doors hold in both
//  directions, an island and an unknown node each answer their
//  own reason, and the assembled Route's points, floors, levels
//  and ETA agree with the graph's explicit lengths. A second,
//  hand-written set of graphs pins the router on data the type
//  never guards: an explicit length under its plan chord still
//  gets the optimal route, and a misspelt kind or a negative
//  length answers instead of looping.
//
//  The plan, in pixels (L1 at 0.5 m/px, L2 at 0.25 m/px):
//
//    L1   a ─ b ─ e1        m sits 40px below a, up a few steps
//         │   │             (a same-level stairs edge)
//         m   s1            b ─ w1 ─ w2 ─ c is the long way to c
//             │             c → dr is a one-way door, dr ─ d beyond
//             w1 ─ w2 ─ c ─ t1      island has no edges at all
//    L2   s2 ─ t2            s1/s2 and t1/t2 are stairwells (6 m)
//         │                  e1/e2 is the elevator (4 m)
//         g ─ e2             g is the usual goal
// -----------------------------------------------------------

import { indexGraph, validateGraph } from '../graph';
import { DEFAULT_WALKING_SPEEDS, ELEVATOR_WAIT_S, findRoute } from '../route';
import type { BuildingGraph, EdgeKind, GraphEdge, GraphNode, NodeKind, Route } from '../types';


// The instruction generator is a sibling with its own suite;
// here it is a stub so this file proves routing alone, and its
// arguments double as the record of the edges a route walked
// (a Route carries points, not edges). Virtual, so the stub
// stands whether or not the sibling file is present
jest.mock('../instructions', () => ({ buildInstructions: jest.fn(() => []) }));
const { buildInstructions: mockBuildInstructions } = jest.requireMock('../instructions') as { buildInstructions: jest.Mock };


const node = (id: string, level: string, x: number, y: number, kind: NodeKind = 'corridor'): GraphNode => ({ id, level, x, y, kind });
const hallway = (a: string, b: string): GraphEdge => ({ a, b, kind: 'hallway' });

const building = (): BuildingGraph => ({
  version: 1,
  building: 'test',
  levels: [
    { id: 'L1', label: '1', viewBox: [0, 0, 300, 300], metersPerPixel: 0.5, ordinal: 1 },
    { id: 'L2', label: '2', viewBox: [0, 0, 300, 300], metersPerPixel: 0.25, ordinal: 2 },
  ],
  nodes: [
    node('a', 'L1', 0, 0),
    node('b', 'L1', 20, 0),
    node('s1', 'L1', 20, 20, 'stairs'),
    node('e1', 'L1', 40, 0, 'elevator'),
    node('w1', 'L1', 20, 100),
    node('w2', 'L1', 60, 100),
    node('c', 'L1', 60, 0),
    node('t1', 'L1', 60, 20, 'stairs'),
    node('dr', 'L1', 80, 0, 'door'),
    node('d', 'L1', 100, 0),
    node('m', 'L1', 0, 40),
    node('island', 'L1', 200, 200),
    node('s2', 'L2', 20, 20, 'stairs'),
    node('e2', 'L2', 40, 0, 'elevator'),
    node('g', 'L2', 20, 60),
    node('t2', 'L2', 60, 20, 'stairs'),
  ],
  edges: [
    hallway('a', 'b'),
    hallway('b', 's1'),
    hallway('b', 'e1'),
    hallway('b', 'w1'),
    hallway('w1', 'w2'),
    hallway('w2', 'c'),
    hallway('c', 't1'),
    { a: 'c', b: 'dr', kind: 'door', oneWay: true },
    hallway('dr', 'd'),
    // A few steps along one level: no lengthM, so the plan distance
    { a: 'a', b: 'm', kind: 'stairs' },
    { a: 's1', b: 's2', kind: 'stairs', lengthM: 6 },
    { a: 'e1', b: 'e2', kind: 'elevator', lengthM: 4 },
    { a: 't1', b: 't2', kind: 'stairs', lengthM: 6 },
    hallway('s2', 'g'),
    hallway('e2', 'g'),
    hallway('s2', 't2'),
  ],
  rooms: [],
  entranceNodeId: 'a',
});

const index = indexGraph(building());


// The nodes a route visits, in order
const visited = (route: Route | null): string[] => (route ? route.points.map((p) => p.nodeId) : []);

// The kinds of the edges the last route walked, as handed to the
// instruction generator
const walked = (): EdgeKind[] => {
  const calls = mockBuildInstructions.mock.calls;
  return (calls[calls.length - 1][2] as GraphEdge[]).map((edge) => edge.kind);
};

// Seconds for metres at a kind's default speed
const walk = (metres: number, kind: EdgeKind) => metres / DEFAULT_WALKING_SPEEDS[kind];


beforeEach(() => {
  mockBuildInstructions.mockClear();
});


describe('findRoute — choosing', () => {
  it('shortest: the stairs beat the elevator for a one-floor hop', () => {
    const { route } = findRoute(index, 'a', 'g');
    expect(visited(route)).toEqual(['a', 'b', 's1', 's2', 'g']);
    expect(walked()).toEqual(['hallway', 'hallway', 'stairs', 'hallway']);
  });

  it("accessible: takes the elevator and never a stairs edge", () => {
    const { route } = findRoute(index, 'a', 'g', { accessibility: 'accessible' });
    expect(visited(route)).toEqual(['a', 'b', 'e1', 'e2', 'g']);
    expect(walked()).toContain('elevator');
    expect(walked()).not.toContain('stairs');
    expect(route?.floors[1].enteredBy).toBe('elevator');
  });

  it('accessible: a destination only reachable up a few steps has no path', () => {
    expect(findRoute(index, 'a', 'm', { accessibility: 'accessible' })).toEqual({ route: null, reason: 'no_path' });
  });

  it('noInaccessibleFloorChanges: a same-level stairs edge is fine, a cross-level one is not', () => {
    const steps = findRoute(index, 'a', 'm', { accessibility: 'noInaccessibleFloorChanges' });
    expect(visited(steps.route)).toEqual(['a', 'm']);
    expect(walked()).toEqual(['stairs']);

    const up = findRoute(index, 'a', 'g', { accessibility: 'noInaccessibleFloorChanges' });
    expect(visited(up.route)).toEqual(['a', 'b', 'e1', 'e2', 'g']);
    expect(walked()).not.toContain('stairs');
  });

  it('minimizeFloorChanges: a quick zig-zag through the upper floor loses to the long way along one', () => {
    const quick = findRoute(index, 'a', 'c');
    expect(visited(quick.route)).toEqual(['a', 'b', 's1', 's2', 't2', 't1', 'c']);
    expect(quick.route?.levels).toEqual(['L1', 'L2']);

    const flat = findRoute(index, 'a', 'c', { minimizeFloorChanges: true });
    expect(visited(flat.route)).toEqual(['a', 'b', 'w1', 'w2', 'c']);
    expect(flat.route?.levels).toEqual(['L1']);
    expect(flat.route?.floors).toHaveLength(1);
    // The penalty steered the choice; it is not time spent
    expect(flat.route?.etaSeconds).toBe(Math.round(walk(10 + 50 + 20 + 50, 'hallway')));
  });

  it('avoid refuses a kind outright; with accessible on top there may be no path', () => {
    const noStairs = findRoute(index, 'a', 'g', { avoid: ['stairs'] });
    expect(visited(noStairs.route)).toEqual(['a', 'b', 'e1', 'e2', 'g']);

    expect(findRoute(index, 'a', 'g', { accessibility: 'accessible', avoid: ['elevator'] })).toEqual({ route: null, reason: 'no_path' });
  });

  it('walkingSpeeds: a host that crawls on stairs is sent to the elevator; a bogus speed keeps the default', () => {
    const crawl = findRoute(index, 'a', 'g', { walkingSpeeds: { stairs: 0.05 } });
    expect(visited(crawl.route)).toEqual(['a', 'b', 'e1', 'e2', 'g']);

    const bogus = findRoute(index, 'a', 'g', { walkingSpeeds: { hallway: 0, stairs: Number.NaN } });
    const plain = findRoute(index, 'a', 'g');
    expect(visited(bogus.route)).toEqual(visited(plain.route));
    expect(bogus.route?.etaSeconds).toBe(plain.route?.etaSeconds);
  });
});


describe('findRoute — refusing', () => {
  it('an endpoint the graph does not know', () => {
    expect(findRoute(index, 'nope', 'a')).toEqual({ route: null, reason: 'unknown_node' });
    expect(findRoute(index, 'a', 'nope')).toEqual({ route: null, reason: 'unknown_node' });
    expect(mockBuildInstructions).not.toHaveBeenCalled();
  });

  it('an island, from either side', () => {
    expect(findRoute(index, 'a', 'island')).toEqual({ route: null, reason: 'no_path' });
    expect(findRoute(index, 'island', 'a')).toEqual({ route: null, reason: 'no_path' });
  });

  it('a one-way door is walked forward and refused backward', () => {
    const forward = findRoute(index, 'c', 'dr');
    expect(visited(forward.route)).toEqual(['c', 'dr']);
    expect(walked()).toEqual(['door']);
    expect(findRoute(index, 'dr', 'c')).toEqual({ route: null, reason: 'no_path' });

    // The same door, seen from further away on both sides
    expect(visited(findRoute(index, 'a', 'd').route)).toEqual(expect.arrayContaining(['c', 'dr', 'd']));
    expect(findRoute(index, 'd', 'a')).toEqual({ route: null, reason: 'no_path' });
  });
});


describe('findRoute — the assembled Route', () => {
  it('points carry cumulative metres at each level\'s own scale, and distanceM is the last of them', () => {
    const { route } = findRoute(index, 'a', 'c');
    expect(route?.points.map((p) => p.atM)).toEqual([0, 10, 20, 26, 36, 42, 52]);
    expect(route?.distanceM).toBe(52);
    expect(route?.fromNodeId).toBe('a');
    expect(route?.toNodeId).toBe('c');
    for (let i = 1; i < (route?.points.length ?? 0); i++) {
      expect(route?.points[i].atM).toBeGreaterThan(route?.points[i - 1].atM ?? Infinity);
    }
  });

  it('floors split at every level change, cover every point, and say how each was entered', () => {
    const { route } = findRoute(index, 'a', 'c');
    expect(route?.floors).toEqual([
      { level: 'L1', enteredBy: 'start', points: [[0, 0], [20, 0], [20, 20]] },
      { level: 'L2', enteredBy: 'stairs', points: [[20, 20], [60, 20]] },
      { level: 'L1', enteredBy: 'stairs', points: [[60, 20], [60, 0]] },
    ]);
    const covered = route?.floors.reduce((n, floor) => n + floor.points.length, 0);
    expect(covered).toBe(route?.points.length);
    // A floor revisited is listed once, in first-entry order
    expect(route?.levels).toEqual(['L1', 'L2']);
  });

  it('etaSeconds sums the edge seconds, elevator wait included', () => {
    const { route } = findRoute(index, 'a', 'g', { accessibility: 'accessible' });
    const legs = walk(10, 'hallway') + walk(10, 'hallway') + walk(4, 'elevator') + walk(Math.hypot(20, 60) * 0.25, 'hallway');
    expect(route?.etaSeconds).toBe(Math.round(legs + ELEVATOR_WAIT_S));
    expect(route?.etaSeconds).toBeGreaterThanOrEqual(Math.round(legs) + ELEVATOR_WAIT_S - 1);
  });

  it('hands the instruction generator the index, the points and the edges walked, and keeps its answer', () => {
    mockBuildInstructions.mockReturnValueOnce([{ type: 'arrive', atNodeId: 'g' }]);
    const { route } = findRoute(index, 'a', 'g');
    expect(mockBuildInstructions).toHaveBeenCalledTimes(1);
    const [calledIndex, calledPoints, calledEdges] = mockBuildInstructions.mock.calls[0];
    expect(calledIndex).toBe(index);
    expect(calledPoints).toBe(route?.points);
    expect(calledEdges).toHaveLength((route?.points.length ?? 0) - 1);
    expect(route?.steps).toEqual([{ type: 'arrive', atNodeId: 'g' }]);
  });

  it('from === to is a one-point route of zero metres', () => {
    const { route } = findRoute(index, 'a', 'a');
    expect(route).toEqual({
      fromNodeId: 'a',
      toNodeId: 'a',
      points: [{ nodeId: 'a', level: 'L1', x: 0, y: 0, atM: 0 }],
      floors: [{ level: 'L1', enteredBy: 'start', points: [[0, 0]] }],
      distanceM: 0,
      etaSeconds: 0,
      levels: ['L1'],
      steps: [],
    });
    expect(mockBuildInstructions).toHaveBeenCalledWith(index, route?.points, []);
  });
});


// One level at 1 m/px, nodes and edges as given — the graphs a
// host hand-writes, validated or not
const flat = (nodes: GraphNode[], edges: GraphEdge[]): BuildingGraph => ({
  version: 1,
  building: 'test',
  levels: [{ id: 'L1', label: '1', viewBox: [0, 0, 300, 300], metersPerPixel: 1, ordinal: 1 }],
  nodes,
  edges,
  rooms: [],
  entranceNodeId: nodes[0].id,
});


describe('findRoute — data the type never guards', () => {
  it('an explicit length under the plan chord still gets the optimal route, not the first goal pop', () => {
    const graph = flat(
      [node('a', 'L1', 0, 0), node('b', 'L1', 100, 0), node('c', 'L1', 50, 200)],
      [
        { a: 'a', b: 'b', kind: 'hallway', lengthM: 100 },
        { a: 'a', b: 'c', kind: 'hallway', lengthM: 10 },
        { a: 'c', b: 'b', kind: 'hallway', lengthM: 10 },
      ],
    );
    expect(validateGraph(graph).map((issue) => `${issue.code}:${issue.ref}`)).toEqual(['length_under_chord:a-c', 'length_under_chord:c-b']);
    const under = indexGraph(graph);
    expect(under.heuristicScale).toBeCloseTo(10 / Math.hypot(50, 200), 9);
    const { route } = findRoute(under, 'a', 'b');
    expect(visited(route)).toEqual(['a', 'c', 'b']);
    expect(route?.distanceM).toBe(20);
    expect(route?.etaSeconds).toBe(Math.round(walk(20, 'hallway')));
  });

  it("a misspelt edge kind is reported by validateGraph, and the unvalidated graph still answers", () => {
    const graph = flat(
      [node('a', 'L1', 0, 0), node('b', 'L1', 10, 0), node('c', 'L1', 20, 0), node('d', 'L1', 30, 0)],
      [{ a: 'a', b: 'b', kind: 'corridor' as EdgeKind }, hallway('b', 'c'), hallway('c', 'd')],
    );
    expect(validateGraph(graph)).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', code: 'unknown_kind', ref: 'a-b' })]));

    const misspelt = indexGraph(graph);
    // The unpriceable edge is invisible, so nothing joins a to the rest
    expect(findRoute(misspelt, 'a', 'b')).toEqual({ route: null, reason: 'no_path' });
    expect(findRoute(misspelt, 'a', 'd')).toEqual({ route: null, reason: 'no_path' });
    // The rest of the chain is priced as ever
    const { route } = findRoute(misspelt, 'b', 'd');
    expect(visited(route)).toEqual(['b', 'c', 'd']);
    expect(Number.isFinite(route?.etaSeconds)).toBe(true);
  }, 5000);

  it('a negative lengthM is reported by validateGraph, and the router never walks a route backwards or laps the cycle', () => {
    const graph = flat(
      [node('a', 'L1', 0, 0), node('b', 'L1', 10, 0), node('c', 'L1', 20, 0), node('d', 'L1', 30, 0)],
      [{ a: 'a', b: 'b', kind: 'hallway', lengthM: -8 }, { a: 'b', b: 'c', kind: 'hallway', lengthM: 100 }, hallway('c', 'd')],
    );
    expect(validateGraph(graph)).toEqual([expect.objectContaining({ severity: 'error', code: 'bad_length', ref: 'a-b' })]);

    const negative = indexGraph(graph);
    expect(findRoute(negative, 'a', 'd')).toEqual({ route: null, reason: 'no_path' });
    const { route } = findRoute(negative, 'b', 'd');
    expect(route?.points.map((p) => p.atM)).toEqual([0, 100, 110]);
  }, 5000);
});
