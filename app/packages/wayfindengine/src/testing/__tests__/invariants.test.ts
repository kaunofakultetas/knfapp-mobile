// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine route invariants
//
//  A sound route passes; a route broken one way at a time
//  trips exactly the invariant it breaks, with the message
//  that names the point, edge or step at fault. Routes come
//  from the router over the sample building and are deep-
//  copied before breaking, so the index's cached graph stays
//  intact; the one invariant the sample cannot break (a level
//  change over a hallway) uses a tiny graph of its own.
// -----------------------------------------------------------

import { indexGraph, type GraphIndex } from '../../core/graph';
import { findRoute } from '../../core/route';
import type { BuildingGraph, Route } from '../../core/types';
import { assertRouteInvariants } from '../invariants';
import { sampleBuilding } from '../sampleBuilding';


const index = indexGraph(sampleBuilding());

// A route the router answers, copied deep enough to break
const routeTo = (from: string, to: string, accessible = false): Route => {
  const { route } = findRoute(index, from, to, accessible ? { accessibility: 'accessible' } : {});
  if (!route) throw new Error(`no route ${from} → ${to}`);
  return JSON.parse(JSON.stringify(route)) as Route;
};

// The invariant failure for a broken route, as its message
const failure = (route: Route, idx: GraphIndex = index, accessibility?: 'accessible' | 'noInaccessibleFloorChanges'): string => {
  try {
    assertRouteInvariants(idx, route, accessibility ? { accessibility } : {});
  } catch (err) {
    return (err as Error).message;
  }
  return '';
};


describe('assertRouteInvariants — sound routes', () => {
  it('passes a same-level route, a route over the stairs, and a one-point route', () => {
    expect(() => assertRouteInvariants(index, routeTo('n-entrance', 'n-cafe'))).not.toThrow();
    expect(() => assertRouteInvariants(index, routeTo('n-entrance', 'n-d201'))).not.toThrow();
    expect(() => assertRouteInvariants(index, routeTo('n-c2', 'n-c2'))).not.toThrow();
  });

  it('passes an accessible route under the accessible option', () => {
    expect(() => assertRouteInvariants(index, routeTo('n-entrance', 'n-d201', true), { accessibility: 'accessible' })).not.toThrow();
  });
});


describe('assertRouteInvariants — one break at a time', () => {
  it('the ends must be the first and last point', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.fromNodeId = 'n-lobby';
    expect(failure(route)).toBe("route 'n-lobby' → 'n-cafe': fromNodeId is 'n-lobby' but points[0] is 'n-entrance'");
  });

  it('a point naming an unknown node', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.points[1].nodeId = 'n-ghost';
    expect(failure(route)).toMatch("points[1] names unknown node 'n-ghost'");
  });

  it('a point claiming the wrong level', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.points[2].level = 'L2';
    expect(failure(route)).toMatch("points[2] ('n-c1') claims level 'L2' but the node sits on 'L1'");
  });

  it('consecutive points not joined by an edge', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    // n-lobby and n-c2 are two hops apart
    route.points.splice(2, 1);
    expect(failure(route)).toMatch("no edge joins 'n-lobby' to 'n-c2' (points[1] → points[2])");
  });

  it('a one-way door walked backwards is not joined either', () => {
    const route = routeTo('n-c6', 'n-exit');
    route.points.reverse();
    route.fromNodeId = 'n-exit';
    route.toNodeId = 'n-c6';
    route.points[0].atM = 0;
    route.points[1].atM = 5;
    expect(failure(route)).toMatch("no edge joins 'n-exit' to 'n-c6'");
  });

  it('a level change that is not over a connector', () => {
    const hallwayBetweenFloors: BuildingGraph = {
      version: 1,
      building: 'broken',
      levels: [
        { id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 1 },
        { id: 'L2', label: '2', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 2 },
      ],
      nodes: [
        { id: 'a', level: 'L1', x: 0, y: 0, kind: 'corridor' },
        { id: 'b', level: 'L2', x: 0, y: 0, kind: 'corridor' },
      ],
      edges: [{ a: 'a', b: 'b', kind: 'hallway', lengthM: 3 }],
      rooms: [],
    };
    const broken = indexGraph(hallwayBetweenFloors);
    const { route } = findRoute(broken, 'a', 'b');
    expect(route).not.toBeNull();
    expect(failure(route as Route, broken)).toMatch("points[0] → points[1] changes level 'L1' → 'L2' over a 'hallway' edge, not a connector");
  });

  it('atM that goes backwards', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.points[2].atM = route.points[1].atM - 1;
    expect(failure(route)).toMatch(`atM goes backwards at points[2]: ${route.points[2].atM} after ${route.points[1].atM} at points[1]`);
  });

  it('atM that does not grow by the edge walked', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.points[1].atM += 1;
    expect(failure(route)).toMatch('atM grows by 7 from points[0] to points[1] but edge n-entrance-n-lobby measures 6 m');
  });

  it('a stairs edge under the accessible option, and a stairs floor change under the middle mode', () => {
    const route = routeTo('n-entrance', 'n-d201');
    expect(failure(route, index, 'accessible')).toMatch('walks stairs edge n-st1-n-st2 in accessible mode');
    expect(failure(route, index, 'noInaccessibleFloorChanges')).toMatch('changes level over stairs edge n-st1-n-st2 in noInaccessibleFloorChanges mode');
    expect(failure(route)).toBe('');
  });

  it('distanceM off the last point', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.distanceM += 0.5;
    expect(failure(route)).toMatch(`distanceM is ${route.distanceM} but the last point is at ${route.points[route.points.length - 1].atM} m`);
  });

  it('floors that skip a point', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.floors[0].points.splice(1, 1);
    expect(failure(route)).toMatch("floors[0].points[1] is (300, 600) but points[1] ('n-lobby') is (100, 600)");
  });

  it('floors that stop short', () => {
    const route = routeTo('n-entrance', 'n-cafe');
    route.floors[0].points.pop();
    expect(failure(route)).toMatch(`floors cover ${route.points.length - 1} points but the route has ${route.points.length}`);
  });

  it('floors that do not split at the level change, or split where there is none', () => {
    const over = routeTo('n-entrance', 'n-d201');
    const [first, second] = over.floors;
    over.floors = [{ level: first.level, enteredBy: 'start', points: [...first.points, ...second.points] }];
    expect(failure(over)).toMatch("floors[0] is on 'L1' but points[5] ('n-st2') is on 'L2'");

    const flat = routeTo('n-entrance', 'n-cafe');
    const [only] = flat.floors;
    flat.floors = [
      { level: only.level, enteredBy: 'start', points: only.points.slice(0, 2) },
      { level: only.level, enteredBy: 'door', points: only.points.slice(2) },
    ];
    expect(failure(flat)).toMatch("floors[0] and floors[1] are both on 'L1' — a segment splits only at a level change");
  });

  it('a floor entered by the wrong kind', () => {
    const route = routeTo('n-entrance', 'n-d201');
    route.floors[1].enteredBy = 'elevator';
    expect(failure(route)).toMatch("floors[1] says it was entered by 'elevator' but the edge walked in is a 'stairs'");
  });

  it('levels that are not the walking order', () => {
    const route = routeTo('n-entrance', 'n-d201');
    route.levels = ['L2', 'L1'];
    expect(failure(route)).toMatch('levels is [L2, L1] but the points walk [L1, L2]');
  });

  it('steps missing, not opening with depart, not closing with arrive', () => {
    const none = routeTo('n-entrance', 'n-cafe');
    none.steps = [];
    expect(failure(none)).toMatch('has no steps');

    const noDepart = routeTo('n-entrance', 'n-cafe');
    noDepart.steps[0] = { type: 'continue', atNodeId: 'n-entrance', distanceM: noDepart.steps[0].type === 'depart' ? noDepart.steps[0].distanceM : 0 };
    expect(failure(noDepart)).toMatch("steps start with 'continue', not 'depart'");

    const noArrive = routeTo('n-entrance', 'n-cafe');
    noArrive.steps.pop();
    expect(failure(noArrive)).toMatch(/steps end with '\w+', not 'arrive'/);

    // A lone depart is not "a single arrive"
    const lone = routeTo('n-c2', 'n-c2');
    lone.steps = [{ type: 'depart', atNodeId: 'n-c2', distanceM: 0 }];
    expect(failure(lone)).toMatch("steps end with 'depart', not 'arrive'");
  });

  it('a step standing off the route, or out of order, or not summing to the route', () => {
    const off = routeTo('n-entrance', 'n-cafe');
    off.steps[0].atNodeId = 'n-k1';
    expect(failure(off)).toMatch("steps[0] ('depart') stands at 'n-k1', which the route does not visit at or after points[0]");

    const short = routeTo('n-entrance', 'n-cafe');
    const depart = short.steps[0];
    if (depart.type === 'depart') depart.distanceM -= 1;
    expect(failure(short)).toMatch(`steps measure ${short.distanceM - 1} m in total but the route is ${short.distanceM} m`);
  });
});
