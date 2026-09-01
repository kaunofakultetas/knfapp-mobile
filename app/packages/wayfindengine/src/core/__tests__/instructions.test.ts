// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine turn-by-turn instructions
//
//  One case per rule of buildInstructions: the empty and the
//  one-point route, the depart and where it points, the turn
//  thresholds on both sides and what a corner names (room,
//  landmark, destination), a gentle arc adding up to one turn,
//  the door step and its exceptions, a stairs run of three
//  edges collapsing into one connector with the zig-zag inside
//  silenced (up and down, opening a route, closing one), the
//  continue after a connector and on a long empty corridor,
//  the arrival side, and the invariant that every step
//  measures the way to the next one.
// -----------------------------------------------------------

import { edgeLengthM, indexGraph, type GraphIndex } from '../graph';
import { buildInstructions } from '../instructions';
import type { BuildingGraph, EdgeKind, GraphEdge, GraphNode, Instruction, Level, Room, RoutePoint } from '../types';


// Half a metre per plan pixel: 20 px = 10 m, every product exact
const MPP = 0.5;

const level = (id: string, ordinal: number): Level => ({ id, label: id, viewBox: [0, 0, 1000, 1000], metersPerPixel: MPP, ordinal });

const node = (id: string, lvl: string, x: number, y: number, over: Partial<GraphNode> = {}): GraphNode => ({ id, level: lvl, x, y, kind: 'corridor', ...over });

const edge = (a: string, b: string, kind: EdgeKind = 'hallway', lengthM?: number): GraphEdge => (lengthM == null ? { a, b, kind } : { a, b, kind, lengthM });

const room = (id: string, lvl: string, nodeId: string, polygon: [number, number][] | null = null): Room => ({ id, name: id, level: lvl, nodeId, polygon });

const building = (over: Partial<BuildingGraph>): GraphIndex =>
  indexGraph({ version: 1, building: 'test', levels: [level('L1', 1), level('L2', 2)], nodes: [], edges: [], rooms: [], ...over });


// The route through the named nodes, its edges looked up in the
// graph in either orientation, atM accumulated the router's way
const walk = (index: GraphIndex, ids: string[]): { points: RoutePoint[]; edges: GraphEdge[] } => {
  const points: RoutePoint[] = [];
  const edges: GraphEdge[] = [];
  let atM = 0;
  ids.forEach((id, i) => {
    const at = index.nodes.get(id);
    if (!at) throw new Error(`no node '${id}'`);
    if (i > 0) {
      const prev = ids[i - 1];
      const joins = index.graph.edges.find((e) => (e.a === prev && e.b === id) || (e.a === id && e.b === prev));
      if (!joins) throw new Error(`no edge ${prev}-${id}`);
      edges.push(joins);
      atM += edgeLengthM(index, joins);
    }
    points.push({ nodeId: id, level: at.level, x: at.x, y: at.y, atM });
  });
  return { points, edges };
};

const stepsThrough = (index: GraphIndex, ids: string[]): Instruction[] => {
  const { points, edges } = walk(index, ids);
  return buildInstructions(index, points, edges);
};

const kinds = (steps: Instruction[]): string[] => steps.map((s) => s.type);


// One corner: 15 m up the drawing to b, then 15 m off at theta
// degrees (positive = clockwise = right) — short enough that a
// straight run through b never earns a continue
const corner = (theta: number, over: { b?: Partial<GraphNode>; rooms?: Room[] } = {}): GraphIndex => {
  const rad = (theta * Math.PI) / 180;
  return building({
    nodes: [node('a', 'L1', 0, 0), node('b', 'L1', 0, -30, over.b), node('c', 'L1', 30 * Math.sin(rad), -30 - 30 * Math.cos(rad))],
    edges: [edge('a', 'b'), edge('b', 'c')],
    rooms: over.rooms ?? [room('r-c', 'L1', 'c')],
  });
};


// A stairwell between two floors: 20 m of corridor to the foot,
// three stairs edges (a landing on each plan, both of them a
// sharp zig-zag), 45 m of corridor with a mid node, a right turn
// to the door of r-2
const stairwell = (): GraphIndex =>
  building({
    nodes: [
      node('h1', 'L1', 0, 0),
      node('s1', 'L1', 0, -40, { kind: 'stairs' }),
      node('p1', 'L1', 20, -40, { kind: 'stairs' }),
      node('p2', 'L2', 20, -60, { kind: 'stairs' }),
      node('s2', 'L2', 0, -60, { kind: 'stairs' }),
      node('m', 'L2', 0, -100),
      node('h2', 'L2', 0, -150),
      node('d', 'L2', 40, -150, { kind: 'door' }),
    ],
    edges: [
      edge('h1', 's1'),
      edge('s1', 'p1', 'stairs', 3),
      edge('p1', 'p2', 'stairs', 4),
      edge('p2', 's2', 'stairs', 3),
      edge('s2', 'm'),
      edge('m', 'h2'),
      edge('h2', 'd'),
    ],
    rooms: [room('r-2', 'L2', 'd')],
  });


// A straight corridor of 10 m hops
const corridor = (hops: number): GraphIndex =>
  building({
    nodes: Array.from({ length: hops + 1 }, (_, i) => node(`n${i}`, 'L1', 0, -20 * i)),
    edges: Array.from({ length: hops }, (_, i) => edge(`n${i}`, `n${i + 1}`)),
  });

const corridorIds = (hops: number): string[] => Array.from({ length: hops + 1 }, (_, i) => `n${i}`);


// 10 m of corridor, a door edge, 10 m more to the room; plus a
// door edge straight from the door node to the room
const doorway = (rooms: Room[] = [room('r-c', 'L1', 'c')]): GraphIndex =>
  building({
    nodes: [node('a', 'L1', 0, 0), node('d', 'L1', 0, -20, { kind: 'door' }), node('e', 'L1', 0, -40), node('c', 'L1', 0, -60)],
    edges: [edge('a', 'd'), edge('d', 'e', 'door'), edge('e', 'c'), edge('d', 'c', 'door')],
    rooms,
  });


describe('buildInstructions', () => {
  describe('the ends of a route', () => {
    it('answers nothing for no points', () => {
      expect(buildInstructions(corner(90), [], [])).toEqual([]);
    });

    it('a one-point route is the arrival alone', () => {
      const index = corner(90);
      const { points } = walk(index, ['c']);
      expect(buildInstructions(index, points, [])).toEqual([{ type: 'arrive', atNodeId: 'c', roomId: 'r-c', side: null }]);
    });

    it('a one-point route to a corridor node arrives nowhere in particular', () => {
      const index = corner(90);
      const { points } = walk(index, ['a']);
      expect(buildInstructions(index, points, [])).toEqual([{ type: 'arrive', atNodeId: 'a', roomId: null, side: null }]);
    });
  });


  describe('depart', () => {
    it('comes first and measures the way to the first event', () => {
      const steps = stepsThrough(corner(90, { rooms: [room('r-b', 'L1', 'b'), room('r-c', 'L1', 'c')] }), ['a', 'b', 'c']);
      expect(steps[0]).toEqual({ type: 'depart', atNodeId: 'a', distanceM: 15, towardsRoomId: 'r-b' });
    });

    it('points at the destination when the first event node is no door', () => {
      const steps = stepsThrough(corner(90), ['a', 'b', 'c']);
      expect(steps[0]).toEqual({ type: 'depart', atNodeId: 'a', distanceM: 15, towardsRoomId: 'r-c' });
    });

    it('points nowhere when neither the event nor the destination is a room', () => {
      const steps = stepsThrough(corner(90, { rooms: [] }), ['a', 'b', 'c']);
      expect(steps[0]).toEqual({ type: 'depart', atNodeId: 'a', distanceM: 15, towardsRoomId: null });
    });

    it('measures the whole straight route when nothing happens on it', () => {
      expect(stepsThrough(corner(0), ['a', 'b', 'c'])).toEqual([
        { type: 'depart', atNodeId: 'a', distanceM: 30, towardsRoomId: 'r-c' },
        { type: 'arrive', atNodeId: 'c', roomId: 'r-c', side: null },
      ]);
    });
  });


  describe('turns', () => {
    it.each([
      [24, null],
      [-24, null],
      [26, 'slight-right'],
      [69, 'slight-right'],
      [71, 'right'],
      [134, 'right'],
      [136, 'u-turn'],
      [180, 'u-turn'],
      [-26, 'slight-left'],
      [-90, 'left'],
      [-150, 'u-turn'],
    ])('a heading change of %s° is %s', (theta, direction) => {
      const steps = stepsThrough(corner(theta), ['a', 'b', 'c']);
      if (direction === null) {
        expect(kinds(steps)).toEqual(['depart', 'arrive']);
      } else {
        expect(kinds(steps)).toEqual(['depart', 'turn', 'arrive']);
        expect(steps[1]).toMatchObject({ type: 'turn', atNodeId: 'b', direction, distanceM: 15 });
      }
    });

    it('names the room whose door the corner is', () => {
      const steps = stepsThrough(corner(90, { rooms: [room('r-b', 'L1', 'b'), room('r-c', 'L1', 'c')] }), ['a', 'b', 'c']);
      expect(steps[1]).toEqual({ type: 'turn', atNodeId: 'b', direction: 'right', distanceM: 15, towardsRoomId: 'r-b', landmark: null });
    });

    it('names the landmark when the corner is no door', () => {
      const steps = stepsThrough(corner(90, { b: { landmark: 'library' } }), ['a', 'b', 'c']);
      expect(steps[1]).toEqual({ type: 'turn', atNodeId: 'b', direction: 'right', distanceM: 15, towardsRoomId: null, landmark: 'library' });
    });

    it('falls back to the destination room', () => {
      const steps = stepsThrough(corner(-90), ['a', 'b', 'c']);
      expect(steps[1]).toEqual({ type: 'turn', atNodeId: 'b', direction: 'left', distanceM: 15, towardsRoomId: 'r-c', landmark: null });
    });

    it('a gentle arc of bends under the threshold still adds up to one turn', () => {
      // Headings 0, 15, 30, 45 over 10 m legs: no single bend
      // reaches 25°, but measured from the last corner the third
      // one does
      const step = (deg: number): [number, number] => [20 * Math.sin((deg * Math.PI) / 180), -20 * Math.cos((deg * Math.PI) / 180)];
      const heading = [0, 15, 30, 45].map(step);
      const xs = [0];
      const ys = [0];
      for (const [dx, dy] of heading) {
        xs.push(xs[xs.length - 1] + dx);
        ys.push(ys[ys.length - 1] + dy);
      }
      const index = building({
        nodes: xs.map((x, i) => node(`p${i}`, 'L1', x, ys[i])),
        edges: xs.slice(1).map((_, i) => edge(`p${i}`, `p${i + 1}`)),
      });
      const steps = stepsThrough(index, ['p0', 'p1', 'p2', 'p3', 'p4']);
      expect(kinds(steps)).toEqual(['depart', 'turn', 'arrive']);
      expect(steps[1]).toMatchObject({ atNodeId: 'p3', direction: 'slight-right' });
    });
  });


  describe('doors', () => {
    it('a door edge becomes a door step measuring to the next event', () => {
      expect(stepsThrough(doorway(), ['a', 'd', 'e', 'c'])).toEqual([
        { type: 'depart', atNodeId: 'a', distanceM: 10, towardsRoomId: 'r-c' },
        { type: 'door', atNodeId: 'd', distanceM: 20, towardsRoomId: 'r-c' },
        { type: 'arrive', atNodeId: 'c', roomId: 'r-c', side: null },
      ]);
    });

    it('a door right before the arrival says nothing', () => {
      expect(stepsThrough(doorway(), ['a', 'd', 'c'])).toEqual([
        { type: 'depart', atNodeId: 'a', distanceM: 30, towardsRoomId: 'r-c' },
        { type: 'arrive', atNodeId: 'c', roomId: 'r-c', side: null },
      ]);
    });

    it('a door names the room it is the door of', () => {
      const steps = stepsThrough(doorway([room('r-d', 'L1', 'd'), room('r-c', 'L1', 'c')]), ['a', 'd', 'e', 'c']);
      expect(steps[1]).toEqual({ type: 'door', atNodeId: 'd', distanceM: 20, towardsRoomId: 'r-d' });
    });

    it('a door at the very start is folded into the depart', () => {
      expect(stepsThrough(doorway(), ['d', 'e', 'c'])).toEqual([
        { type: 'depart', atNodeId: 'd', distanceM: 20, towardsRoomId: 'r-c' },
        { type: 'arrive', atNodeId: 'c', roomId: 'r-c', side: null },
      ]);
    });
  });


  describe('connectors', () => {
    const upstairs = ['h1', 's1', 'p1', 'p2', 's2', 'm', 'h2', 'd'];

    it('a stairs run of three edges is one step up with the total length', () => {
      const steps = stepsThrough(stairwell(), upstairs);
      expect(kinds(steps)).toEqual(['depart', 'connector', 'continue', 'turn', 'arrive']);
      expect(steps[1]).toEqual({ type: 'connector', atNodeId: 's1', via: 'stairs', fromLevel: 'L1', toLevel: 'L2', direction: 'up', distanceM: 10 });
    });

    it('no turn is spoken at the landings inside the run', () => {
      const steps = stepsThrough(stairwell(), upstairs);
      expect(steps.filter((s) => s.type === 'turn')).toEqual([
        { type: 'turn', atNodeId: 'h2', direction: 'right', distanceM: 20, towardsRoomId: 'r-2', landmark: null },
      ]);
      expect(steps.some((s) => s.atNodeId === 'p1' || s.atNodeId === 'p2')).toBe(false);
    });

    it('the exit node resumes with a continue measuring to the next event', () => {
      const steps = stepsThrough(stairwell(), upstairs);
      expect(steps[2]).toEqual({ type: 'continue', atNodeId: 's2', distanceM: 45, towardsRoomId: 'r-2' });
    });

    it('walked back down it says down', () => {
      // Downhill the 45 m between the turn and the stairs has no
      // exit continue covering it, so m speaks up on the way
      const steps = stepsThrough(stairwell(), [...upstairs].reverse());
      expect(steps).toEqual([
        { type: 'depart', atNodeId: 'd', distanceM: 20, towardsRoomId: null },
        { type: 'turn', atNodeId: 'h2', direction: 'left', distanceM: 25, towardsRoomId: null, landmark: null },
        { type: 'continue', atNodeId: 'm', distanceM: 20, towardsRoomId: null },
        { type: 'connector', atNodeId: 's2', via: 'stairs', fromLevel: 'L2', toLevel: 'L1', direction: 'down', distanceM: 10 },
        { type: 'continue', atNodeId: 's1', distanceM: 20, towardsRoomId: null },
        { type: 'arrive', atNodeId: 'h1', roomId: null, side: null },
      ]);
    });

    it('a run opening the route stands right after a 0 m depart', () => {
      expect(stepsThrough(stairwell(), ['s1', 'p1', 'p2', 's2', 'm'])).toEqual([
        { type: 'depart', atNodeId: 's1', distanceM: 0, towardsRoomId: null },
        { type: 'connector', atNodeId: 's1', via: 'stairs', fromLevel: 'L1', toLevel: 'L2', direction: 'up', distanceM: 10 },
        { type: 'continue', atNodeId: 's2', distanceM: 20, towardsRoomId: null },
        { type: 'arrive', atNodeId: 'm', roomId: null, side: null },
      ]);
    });

    it('a route closing on the run arrives straight off it', () => {
      expect(stepsThrough(stairwell(), ['h1', 's1', 'p1', 'p2', 's2'])).toEqual([
        { type: 'depart', atNodeId: 'h1', distanceM: 20, towardsRoomId: null },
        { type: 'connector', atNodeId: 's1', via: 'stairs', fromLevel: 'L1', toLevel: 'L2', direction: 'up', distanceM: 10 },
        { type: 'arrive', atNodeId: 's2', roomId: null, side: null },
      ]);
    });

    it.each(['elevator', 'ramp'] as const)('via follows the kind: %s', (via) => {
      const index = building({
        nodes: [node('a', 'L1', 0, 0), node('x', 'L1', 0, -40, { kind: via }), node('y', 'L2', 0, -40, { kind: via }), node('b', 'L2', 0, -80)],
        edges: [edge('a', 'x'), edge('x', 'y', via, 5), edge('y', 'b')],
      });
      const steps = stepsThrough(index, ['a', 'x', 'y', 'b']);
      expect(steps[1]).toEqual({ type: 'connector', atNodeId: 'x', via, fromLevel: 'L1', toLevel: 'L2', direction: 'up', distanceM: 5 });
    });

    it('a mixed run is one step named after the kind met first', () => {
      const index = building({
        nodes: [node('a', 'L1', 0, 0), node('x', 'L1', 0, -40, { kind: 'stairs' }), node('y', 'L1', 10, -40, { kind: 'ramp' }), node('z', 'L2', 0, -40), node('b', 'L2', 0, -80)],
        edges: [edge('a', 'x'), edge('x', 'y', 'stairs', 2), edge('y', 'z', 'ramp', 6), edge('z', 'b')],
      });
      const steps = stepsThrough(index, ['a', 'x', 'y', 'z', 'b']);
      expect(kinds(steps)).toEqual(['depart', 'connector', 'continue', 'arrive']);
      expect(steps[1]).toMatchObject({ via: 'stairs', distanceM: 8, fromLevel: 'L1', toLevel: 'L2' });
    });
  });


  describe('continue on a long straight', () => {
    it('a silent stretch over 40 m gets one continue at its first inner node', () => {
      expect(stepsThrough(corridor(5), corridorIds(5))).toEqual([
        { type: 'depart', atNodeId: 'n0', distanceM: 10, towardsRoomId: null },
        { type: 'continue', atNodeId: 'n1', distanceM: 40, towardsRoomId: null },
        { type: 'arrive', atNodeId: 'n5', roomId: null, side: null },
      ]);
    });

    it('a short stretch gets none', () => {
      expect(kinds(stepsThrough(corridor(3), corridorIds(3)))).toEqual(['depart', 'arrive']);
    });

    it('a long single edge has no node to put one on', () => {
      const index = building({ nodes: [node('a', 'L1', 0, 0), node('b', 'L1', 0, -200)], edges: [edge('a', 'b')] });
      expect(stepsThrough(index, ['a', 'b'])).toEqual([
        { type: 'depart', atNodeId: 'a', distanceM: 100, towardsRoomId: null },
        { type: 'arrive', atNodeId: 'b', roomId: null, side: null },
      ]);
    });

    it('a long stretch behind a connector exit is not told twice', () => {
      // s2 → m → h2 is 45 m with m inside it; the exit's own
      // continue already covers it
      const steps = stepsThrough(stairwell(), ['h1', 's1', 'p1', 'p2', 's2', 'm', 'h2', 'd']);
      expect(steps.filter((s) => s.type === 'continue')).toEqual([{ type: 'continue', atNodeId: 's2', distanceM: 45, towardsRoomId: 'r-2' }]);
    });
  });


  describe('arrive', () => {
    // 30 m up the drawing into the door node; the room polygon
    // is placed around it per case
    const arriving = (polygon: [number, number][] | null, lvl = 'L1'): Instruction => {
      const index = building({
        nodes: [node('a', 'L1', 0, 0), node('b', 'L1', 0, -60, { kind: 'door' })],
        edges: [edge('a', 'b')],
        rooms: [room('r', lvl, 'b', polygon)],
      });
      const steps = stepsThrough(index, ['a', 'b']);
      return steps[steps.length - 1];
    };

    it.each([
      ['left', [[-40, -80], [-10, -80], [-10, -40], [-40, -40]]],
      ['right', [[10, -80], [40, -80], [40, -40], [10, -40]]],
      ['ahead', [[-10, -100], [10, -100], [10, -64], [-10, -64]]],
      ['ahead', [[0, -100], [20, -100], [20, -70], [0, -70]]],
      ['left', [[-40, -20], [-10, -20], [-10, 20], [-40, 20]]],
    ] as [string, [number, number][]][])('the room is %s of the final heading', (side, polygon) => {
      expect(arriving(polygon)).toEqual({ type: 'arrive', atNodeId: 'b', roomId: 'r', side });
    });

    it('has no side without a polygon', () => {
      expect(arriving(null)).toEqual({ type: 'arrive', atNodeId: 'b', roomId: 'r', side: null });
    });

    it('has no side when the polygon is drawn on another plan', () => {
      const step = arriving([[-40, -80], [-10, -80], [-10, -40], [-40, -40]], 'L2');
      expect(step).toEqual({ type: 'arrive', atNodeId: 'b', roomId: 'r', side: null });
    });

    it('has no side when the route ends on a connector', () => {
      const index = building({
        nodes: [node('a', 'L1', 0, 0), node('x', 'L1', 0, -40, { kind: 'elevator' }), node('y', 'L2', 0, -40, { kind: 'elevator' })],
        edges: [edge('a', 'x'), edge('x', 'y', 'elevator', 5)],
        rooms: [room('lobby', 'L2', 'y', [[-40, -80], [-10, -80], [-10, -40], [-40, -40]])],
      });
      const steps = stepsThrough(index, ['a', 'x', 'y']);
      expect(steps[steps.length - 1]).toEqual({ type: 'arrive', atNodeId: 'y', roomId: 'lobby', side: null });
    });
  });


  describe('distances', () => {
    it('every step measures the way to the next one and they sum to the route', () => {
      const index = stairwell();
      const ids = ['h1', 's1', 'p1', 'p2', 's2', 'm', 'h2', 'd'];
      const { points, edges } = walk(index, ids);
      const steps = buildInstructions(index, points, edges);
      const atM = (nodeId: string): number => {
        const point = points.find((p) => p.nodeId === nodeId);
        if (!point) throw new Error(`step names '${nodeId}', which the route never visits`);
        return point.atM;
      };


      let total = 0;
      steps.forEach((step, k) => {
        const next = steps[k + 1];
        if (step.type === 'arrive') {
          expect(next).toBeUndefined();
          return;
        }
        expect(step.distanceM).toBeCloseTo(atM(next.atNodeId) - atM(step.atNodeId));
        total += step.distanceM;
      });
      expect(total).toBeCloseTo(points[points.length - 1].atM);
    });
  });
});
