// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine navigation
//
//  A hand-built two-level route (entrance → corridor → a
//  pass-through point → stairs up → corridor → room door)
//  drives the cursor every way it moves and checks every
//  derived field: level transitions in prevLevel / nextLevel
//  and the floor flags, stepIndex tracking through the
//  connector (the pass-through point shows the connector
//  AHEAD), progress / remaining arithmetic, bearings and pano
//  yaws including the wrap-around into [0, 360) and every
//  null case,
//  clamping at both ends, on/off-route snaps, the pedometer
//  odometer stepping exactly on a point's atM and never past
//  the end, listener firing + unsubscribe, and state identity
//  that holds between changes.
// -----------------------------------------------------------

import { indexGraph } from '../graph';
import { createNavigation } from '../navigation';
import type { BuildingGraph, Route } from '../types';


// Plan space: x right, y DOWN. L1: a (0,100) → b (100,100)
// → b2 (100,50) → c (100,0) stairs; L2: d (100,0) → e (200,0)
// → f (200,80) at room R2's door. 0.1 m per pixel, 6 m of
// stairs, 44 m in all.
const graph: BuildingGraph = {
  version: 1,
  building: 'test',
  levels: [
    { id: 'L1', label: '1', viewBox: [0, 0, 300, 200], metersPerPixel: 0.1, ordinal: 1 },
    { id: 'L2', label: '2', viewBox: [0, 0, 300, 200], metersPerPixel: 0.1, ordinal: 2 },
  ],
  nodes: [
    { id: 'a', level: 'L1', x: 0, y: 100, kind: 'entrance', pano: 'p-a', panoYaw: 90 },
    { id: 'b', level: 'L1', x: 100, y: 100, kind: 'corridor', pano: 'p-b', panoYaw: 300 },
    { id: 'b2', level: 'L1', x: 100, y: 50, kind: 'corridor' },
    { id: 'c', level: 'L1', x: 100, y: 0, kind: 'stairs', pano: 'p-c', panoYaw: 0 },
    { id: 'd', level: 'L2', x: 100, y: 0, kind: 'stairs', pano: 'p-d', panoYaw: null },
    { id: 'e', level: 'L2', x: 200, y: 0, kind: 'corridor', pano: 'p-e', panoYaw: 45, landmark: 'library' },
    { id: 'f', level: 'L2', x: 200, y: 80, kind: 'door', roomId: 'R2' },
  ],
  edges: [
    { a: 'a', b: 'b', kind: 'hallway' },
    { a: 'b', b: 'b2', kind: 'hallway' },
    { a: 'b2', b: 'c', kind: 'hallway' },
    { a: 'c', b: 'd', kind: 'stairs', lengthM: 6 },
    { a: 'd', b: 'e', kind: 'hallway' },
    { a: 'e', b: 'f', kind: 'hallway' },
  ],
  rooms: [
    { id: 'R1', name: 'Hall', level: 'L1', nodeId: 'a' },
    { id: 'R2', name: 'Room 2', level: 'L2', nodeId: 'f' },
  ],
  entranceNodeId: 'a',
};

// The ETA is twice the metres so remainingSeconds is easy to
// read off (2 s per metre)
const route: Route = {
  fromNodeId: 'a',
  toNodeId: 'f',
  points: [
    { nodeId: 'a', level: 'L1', x: 0, y: 100, atM: 0 },
    { nodeId: 'b', level: 'L1', x: 100, y: 100, atM: 10 },
    { nodeId: 'b2', level: 'L1', x: 100, y: 50, atM: 15 },
    { nodeId: 'c', level: 'L1', x: 100, y: 0, atM: 20 },
    { nodeId: 'd', level: 'L2', x: 100, y: 0, atM: 26 },
    { nodeId: 'e', level: 'L2', x: 200, y: 0, atM: 36 },
    { nodeId: 'f', level: 'L2', x: 200, y: 80, atM: 44 },
  ],
  floors: [
    { level: 'L1', points: [[0, 100], [100, 100], [100, 50], [100, 0]], enteredBy: 'start' },
    { level: 'L2', points: [[100, 0], [200, 0], [200, 80]], enteredBy: 'stairs' },
  ],
  distanceM: 44,
  etaSeconds: 88,
  levels: ['L1', 'L2'],
  steps: [
    { type: 'depart', atNodeId: 'a', distanceM: 10 },
    { type: 'turn', atNodeId: 'b', direction: 'left', distanceM: 10 },
    { type: 'connector', atNodeId: 'c', via: 'stairs', fromLevel: 'L1', toLevel: 'L2', direction: 'up', distanceM: 6 },
    { type: 'continue', atNodeId: 'd', distanceM: 10 },
    { type: 'turn', atNodeId: 'e', direction: 'right', distanceM: 8, landmark: 'library' },
    { type: 'arrive', atNodeId: 'f', roomId: 'R2', side: 'ahead' },
  ],
};

const index = indexGraph(graph);
const nav = () => createNavigation(index, route);


describe('createNavigation — derived state', () => {
  it('starts at the first point with the depart step and the whole route ahead', () => {
    const s = nav().state();
    expect(s.index).toBe(0);
    expect(s.currentNodeId).toBe('a');
    expect(s.nextNodeId).toBe('b');
    expect(s.currentLevel).toBe('L1');
    expect(s.stepIndex).toBe(0);
    expect(s.step).toEqual(route.steps[0]);
    expect(s.progressM).toBe(0);
    expect(s.remainingM).toBe(44);
    expect(s.remainingSeconds).toBe(88);
    expect(s.arrived).toBe(false);
  });

  it('tracks prevLevel / nextLevel and the floor flags across the connector', () => {
    const n = nav();
    const seen: [string, string | null, string | null, boolean, boolean][] = [];
    for (let i = 0; i < route.points.length; i++) {
      n.jumpTo(i);
      const s = n.state();
      seen.push([s.currentLevel, s.prevLevel, s.nextLevel, s.isStartFloor, s.isEndFloor]);
    }
    expect(seen).toEqual([
      ['L1', null, 'L2', true, false],
      ['L1', null, 'L2', true, false],
      ['L1', null, 'L2', true, false],
      ['L1', null, 'L2', true, false],
      ['L2', 'L1', null, false, true],
      ['L2', 'L1', null, false, true],
      ['L2', 'L1', null, false, true],
    ]);
  });

  it('names the NEAREST different level on a three-level route, not the farthest', () => {
    const tall: Route = {
      ...route,
      points: [
        { nodeId: 'a', level: 'L1', x: 0, y: 0, atM: 0 },
        { nodeId: 'm', level: 'L2', x: 0, y: 0, atM: 5 },
        { nodeId: 'z', level: 'L3', x: 0, y: 0, atM: 10 },
      ],
      distanceM: 10,
      etaSeconds: 10,
      levels: ['L1', 'L2', 'L3'],
      steps: [],
    };
    const n = createNavigation(index, tall);
    expect(n.state().nextLevel).toBe('L2');
    n.jumpTo(2);
    expect(n.state().prevLevel).toBe('L2');
    expect(n.state().nextLevel).toBeNull();
    n.jumpTo(1);
    expect(n.state().prevLevel).toBe('L1');
    expect(n.state().nextLevel).toBe('L3');
    expect(n.state().isStartFloor).toBe(false);
    expect(n.state().isEndFloor).toBe(false);
  });

  it('stepIndex is the step at or after the point — the pass-through point shows the connector ahead', () => {
    const n = nav();
    const indices: number[] = [];
    for (let i = 0; i < route.points.length; i++) {
      n.jumpTo(i);
      indices.push(n.state().stepIndex);
      expect(n.state().step).toBe(route.steps[n.state().stepIndex]);
    }
    // b2 (point 2) has no step of its own → the connector at c
    expect(indices).toEqual([0, 1, 2, 2, 3, 4, 5]);
    expect(n.state().step?.type).toBe('arrive');
  });

  it('a route with no steps answers stepIndex 0 and a null step', () => {
    const n = createNavigation(index, { ...route, steps: [] });
    expect(n.state().stepIndex).toBe(0);
    expect(n.state().step).toBeNull();
    n.jumpTo(6);
    expect(n.state().stepIndex).toBe(0);
    expect(n.state().step).toBeNull();
  });

  it('progressM / remainingM / remainingSeconds follow the point atM', () => {
    const n = nav();
    n.jumpTo(2);
    expect(n.state().progressM).toBe(15);
    expect(n.state().remainingM).toBe(29);
    expect(n.state().remainingSeconds).toBe(58);
    n.jumpTo(6);
    expect(n.state().progressM).toBe(44);
    expect(n.state().remainingM).toBe(0);
    expect(n.state().remainingSeconds).toBe(0);
  });

  it('bearingToNext follows plan space and panoYawToNext wraps around the node panoYaw', () => {
    const n = nav();
    const seen: [number | null, number | null][] = [];
    for (let i = 0; i < route.points.length; i++) {
      n.jumpTo(i);
      seen.push([n.state().bearingToNext, n.state().panoYawToNext]);
    }
    expect(seen).toEqual([
      // a → b points right; a's pano faces right → dead ahead
      [90, 0],
      // b → b2 points up; b's pano faces 300 → (0 − 300 + 360)
      [0, 60],
      // b2 has no pano
      [0, null],
      // c → d changes level: no bearing, so no yaw despite a pano
      [null, null],
      // d has a pano but no panoYaw
      [90, null],
      // e → f points down; e's pano faces 45
      [180, 135],
      // the destination has nothing ahead
      [null, null],
    ]);
  });

  it('panoYawToNext lands in [0, 360) whatever number the author wrote for panoYaw', () => {
    // a → b bears 90; the yaw is that bearing measured from the
    // pano's centre column, so a column past the bearing reads
    // as the long way round and an authored 450 / -30 is folded
    const facing = (panoYaw: number) => {
      const turned = indexGraph({ ...graph, nodes: graph.nodes.map((n) => (n.id === 'a' ? { ...n, panoYaw } : n)) });
      return createNavigation(turned, route).state().panoYawToNext;
    };
    expect(facing(90)).toBe(0);
    expect(Object.is(facing(90), 0)).toBe(true);
    expect(facing(100)).toBe(350);
    expect(facing(270)).toBe(180);
    expect(facing(450)).toBe(0);
    expect(facing(-30)).toBe(120);
    expect(facing(0)).toBe(90);
  });

  it('currentRoomId names the room whose own node this is', () => {
    const n = nav();
    expect(n.state().currentRoomId).toBe('R1');
    n.jumpTo(1);
    expect(n.state().currentRoomId).toBeNull();
    n.jumpTo(6);
    expect(n.state().currentRoomId).toBe('R2');
    expect(n.state().arrived).toBe(true);
    expect(n.state().nextNodeId).toBeNull();
  });

  it('a single-point route has arrived before it starts', () => {
    const still: Route = {
      ...route,
      toNodeId: 'a',
      points: [route.points[0]],
      floors: [{ level: 'L1', points: [[0, 100]], enteredBy: 'start' }],
      distanceM: 0,
      etaSeconds: 0,
      levels: ['L1'],
      steps: [{ type: 'arrive', atNodeId: 'a', roomId: 'R1' }],
    };
    const s = createNavigation(index, still).state();
    expect(s.arrived).toBe(true);
    expect(s.remainingM).toBe(0);
    expect(s.remainingSeconds).toBe(0);
    expect(s.bearingToNext).toBeNull();
    expect(s.panoYawToNext).toBeNull();
    expect(s.step?.type).toBe('arrive');
  });

  it('refuses a route with no points', () => {
    expect(() => createNavigation(index, { ...route, points: [] })).toThrow(/at least one point/);
  });
});


describe('createNavigation — moving the cursor', () => {
  it('next() and back() clamp at both ends without waking listeners', () => {
    const n = nav();
    const listener = jest.fn();
    n.subscribe(listener);

    n.back();
    expect(n.state().index).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    for (let i = 0; i < 10; i++) n.next();
    expect(n.state().index).toBe(6);
    expect(n.state().arrived).toBe(true);
    // Six real moves, four clamped no-ops
    expect(listener).toHaveBeenCalledTimes(6);

    n.back();
    expect(n.state().index).toBe(5);
    expect(listener).toHaveBeenCalledTimes(7);
  });

  it('jumpTo clamps, floors and ignores a non-finite index', () => {
    const n = nav();
    n.jumpTo(-5);
    expect(n.state().index).toBe(0);
    n.jumpTo(99);
    expect(n.state().index).toBe(6);
    n.jumpTo(2.9);
    expect(n.state().index).toBe(2);
    n.jumpTo(Number.NaN);
    expect(n.state().index).toBe(2);
    n.jumpTo(Number.POSITIVE_INFINITY);
    expect(n.state().index).toBe(2);
  });

  it('snapTo places the walker on a route node and leaves everything alone off it', () => {
    const n = nav();
    const listener = jest.fn();
    n.subscribe(listener);

    expect(n.snapTo('b2')).toBe('on-route');
    expect(n.state().index).toBe(2);
    expect(n.state().currentNodeId).toBe('b2');
    expect(listener).toHaveBeenCalledTimes(1);

    const before = n.state();
    expect(n.snapTo('nowhere')).toBe('off-route');
    expect(n.state()).toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);

    // Snapping backwards is a real placement, not a clamp
    expect(n.snapTo('a')).toBe('on-route');
    expect(n.state().index).toBe(0);
  });

  it('advanceByDistance steps exactly when a point atM is reached', () => {
    const n = nav();
    n.advanceByDistance(9.99);
    expect(n.state().index).toBe(0);
    n.advanceByDistance(0.01);
    expect(n.state().index).toBe(1);
    n.advanceByDistance(4.999);
    expect(n.state().index).toBe(1);
    n.advanceByDistance(0.001);
    expect(n.state().index).toBe(2);
  });

  it('advanceByDistance carries the overshoot and can pass several points at once', () => {
    const n = nav();
    // 12 m: past b (10) with 2 m in hand
    n.advanceByDistance(12);
    expect(n.state().index).toBe(1);
    // 16 m: past b2 (15) only because the 2 m were kept
    n.advanceByDistance(4);
    expect(n.state().index).toBe(2);
    // 37 m: past c (20), d (26), e (36) in one nudge, short of f
    n.advanceByDistance(21);
    expect(n.state().index).toBe(5);
  });

  it('advanceByDistance never passes the end and never walks backwards', () => {
    const n = nav();
    const listener = jest.fn();
    n.subscribe(listener);

    n.advanceByDistance(1000);
    expect(n.state().index).toBe(6);
    expect(n.state().arrived).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    n.advanceByDistance(1000);
    expect(n.state().index).toBe(6);
    expect(listener).toHaveBeenCalledTimes(1);

    n.jumpTo(3);
    n.advanceByDistance(-100);
    n.advanceByDistance(Number.NaN);
    expect(n.state().index).toBe(3);
  });

  it('an explicit placement re-bases the odometer to the point it lands on', () => {
    const n = nav();
    // 19 m walked from the start, then a scan says "you are at b"
    n.advanceByDistance(19);
    expect(n.state().index).toBe(2);
    n.snapTo('b');
    expect(n.state().index).toBe(1);
    // From b the next point is 5 m on — the old 19 must not count
    n.advanceByDistance(4);
    expect(n.state().index).toBe(1);
    n.advanceByDistance(1);
    expect(n.state().index).toBe(2);
  });
});


describe('createNavigation — listeners and identity', () => {
  it('fires every listener once per change and stops after unsubscribe', () => {
    const n = nav();
    const one = jest.fn();
    const two = jest.fn();
    const offOne = n.subscribe(one);
    n.subscribe(two);

    n.next();
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);

    offOne();
    // A second unsubscribe is harmless
    offOne();
    n.next();
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(2);
  });

  it('a listener unsubscribing itself mid-notify does not skip its neighbour', () => {
    const n = nav();
    const late = jest.fn();
    const offSelf = n.subscribe(() => offSelf());
    n.subscribe(late);
    n.next();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('listeners read the settled state when they fire', () => {
    const n = nav();
    const indices: number[] = [];
    n.subscribe(() => indices.push(n.state().index));
    n.next();
    n.jumpTo(4);
    n.back();
    expect(indices).toEqual([1, 4, 3]);
  });

  it('state() is the same object between changes and a fresh one after', () => {
    const n = nav();
    const s1 = n.state();
    expect(n.state()).toBe(s1);
    n.advanceByDistance(1);
    // A nudge short of the next point is not a change
    expect(n.state()).toBe(s1);

    n.next();
    const s2 = n.state();
    expect(s2).not.toBe(s1);
    expect(n.state()).toBe(s2);
    expect(s1.index).toBe(0);
    expect(s2.index).toBe(1);
  });
});
