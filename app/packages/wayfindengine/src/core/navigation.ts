// -----------------------------------------------------------
//  [*] wayfindengine — navigation
//
//  Walking a route: a cursor over route.points and the state a
//  screen renders for the point under it. Pure and React-free
//  — hooks/useNavigation.ts subscribes and re-renders, tests
//  drive it directly.
//
//  The cursor moves four ways. next() / back() / jumpTo() are
//  the host's taps and clamp to the route. snapTo(nodeId) is a
//  QR scan: a node on the route places the walker there, a
//  node off it changes nothing and answers 'off-route' so the
//  host re-routes from that node. advanceByDistance(m) is the
//  pedometer nudge: an odometer of walked metres that carries
//  the cursor forward every time it reaches the NEXT point's
//  atM — never backwards, never past the end, and it keeps the
//  overshoot (12 m walked past a point at 10 m still counts 2
//  towards the one after). Every explicit placement re-bases
//  the odometer to the point it lands on, so a step count that
//  trickles in after a jump measures from the jump, not from
//  wherever the walker was before.
//
//  The state is derived, never patched: each index change
//  builds one fresh NavigationState and keeps it until the
//  next change, so `state()` is memo-friendly (identical object
//  between changes, a different object after one). A call that
//  leaves the index where it was — next() at the end, a nudge
//  short of the next point, an off-route snap — builds nothing
//  and wakes no listener.
//
//  Derivation rules worth knowing:
//    - stepIndex is the step whose action happens AT or AFTER
//      the current point (a corridor point between two turns
//      shows the turn ahead); at the destination it is the
//      arrive step. A route with no steps answers 0 / null.
//    - prevLevel / nextLevel are the nearest DIFFERENT levels
//      behind and ahead — null on the first / last floor.
//    - bearingToNext is a plan-space bearing and only exists
//      while the next point shares the level; a level change
//      and the destination answer null. panoYawToNext turns
//      that bearing into a yaw inside the node's panorama —
//      the geometry helpers' signed arc from the panorama's
//      centre column, unfolded into [0, 360) like every yaw a
//      stage reads — and needs both a pano and a panoYaw on
//      the node.
//    - remainingSeconds is the route ETA scaled by the metres
//      left — the engine keeps no per-segment clock.
//    - currentRoomId is the room whose own node this is (the
//      index's roomByNode); a node merely AT a room's door
//      does not count as being in it.
//
//  Used by:
//    - hooks/useNavigation.ts — one instance per route
//    - src/index.ts — public surface, for hosts driving a
//      route without the hook
// -----------------------------------------------------------

import { bearingDeg, shortestArcDeg } from './geometry';
import type { GraphIndex } from './graph';
import type { NavigationState, Route } from './types';


export interface Navigation {
  state(): NavigationState;
  next(): void;
  back(): void;
  jumpTo(index: number): void;
  // 'on-route' moved the cursor; 'off-route' changed nothing —
  // the host re-routes from that node
  snapTo(nodeId: string): 'on-route' | 'off-route';
  advanceByDistance(metres: number): void;
  subscribe(listener: () => void): () => void;
}


// Float noise in atM sums (the router adds edge lengths) must
// not hold a walker a micrometre short of a point
const REACH_EPSILON_M = 1e-6;







// -----------------------------------------------------------
// stepIndexByPoint
// -----------------------------------------------------------
//
// One step index per route point, precomputed once. Steps come
// in walking order and each names the node its action happens
// at, so walking the steps forward against the points forward
// pins every step to a point index; a point's step is then the
// first step pinned at or after it, and the last step (arrive)
// covers everything past the final pin. A step naming a node
// the route never visits (an authoring slip) pins where the
// previous step did, which keeps the sequence monotone.
//
// Used by:
//   - createNavigation (below)
// -----------------------------------------------------------

function stepIndexByPoint(route: Route): number[] {

  const { points, steps } = route;
  const pinned: number[] = [];
  let cursor = 0;
  for (const step of steps) {
    // Scanning from the cursor (not past it) lets two steps at
    // one node — a door then a turn — share the pin
    for (let i = cursor; i < points.length; i++) {
      if (points[i].nodeId === step.atNodeId) {
        cursor = i;
        break;
      }
    }
    pinned.push(cursor);
  }


  const result: number[] = [];
  let step = 0;
  for (let i = 0; i < points.length; i++) {
    while (step < pinned.length - 1 && pinned[step] < i) step++;
    result.push(step);
  }
  return result;
}







// -----------------------------------------------------------
// deriveState
// -----------------------------------------------------------
//
// The whole NavigationState for one point index. Pure — built
// once per index change, never on read, so a screen may hold
// the object and compare it by identity.
//
// Used by:
//   - createNavigation (below)
// -----------------------------------------------------------

function deriveState(index: GraphIndex, route: Route, stepAt: number[], at: number): NavigationState {

  const { points, steps } = route;
  const last = points.length - 1;
  const point = points[at];
  const nextPoint = at < last ? points[at + 1] : null;


  let prevLevel: string | null = null;
  for (let i = at - 1; i >= 0; i--) {
    if (points[i].level !== point.level) {
      prevLevel = points[i].level;
      break;
    }
  }
  let nextLevel: string | null = null;
  for (let i = at + 1; i <= last; i++) {
    if (points[i].level !== point.level) {
      nextLevel = points[i].level;
      break;
    }
  }


  // A bearing needs plan space shared with the next point; the
  // pano yaw additionally needs the node to carry a panorama
  // and the bearing its centre column faces. The yaw is the
  // short signed arc from that column to the bearing, unfolded
  // into [0, 360): a yaw is a position on the wheel, so a turn
  // to the left reads as the long way round, and whatever the
  // author wrote for panoYaw (450, -30) lands in range
  const bearingToNext = nextPoint && nextPoint.level === point.level ? bearingDeg(point, nextPoint) : null;
  const node = index.nodes.get(point.nodeId);
  let panoYawToNext: number | null = null;
  if (bearingToNext !== null && node?.pano && node.panoYaw != null) {
    const arc = shortestArcDeg(node.panoYaw, bearingToNext);
    panoYawToNext = arc < 0 ? arc + 360 : arc;
  }


  // A zero-length route (from = to) has no ETA to scale
  const remainingM = Math.max(0, route.distanceM - point.atM);
  const remainingSeconds = route.distanceM > 0 ? (route.etaSeconds * remainingM) / route.distanceM : 0;
  const stepIndex = stepAt[at];


  return {
    index: at,
    currentNodeId: point.nodeId,
    nextNodeId: nextPoint ? nextPoint.nodeId : null,
    currentLevel: point.level,
    prevLevel,
    nextLevel,
    isStartFloor: point.level === points[0].level,
    isEndFloor: point.level === points[last].level,
    stepIndex,
    step: steps[stepIndex] ?? null,
    progressM: point.atM,
    remainingM,
    remainingSeconds,
    bearingToNext,
    panoYawToNext,
    arrived: at === last,
    currentRoomId: index.roomByNode.get(point.nodeId)?.id ?? null,
  };
}







// -----------------------------------------------------------
// createNavigation
// -----------------------------------------------------------
//
//   const nav = createNavigation(index, route)
//   nav.state()                 — the current NavigationState
//   nav.next() / nav.back()     — one point, clamped
//   nav.jumpTo(i)               — clamped, floored
//   nav.snapTo('n12')           — 'on-route' | 'off-route'
//   nav.advanceByDistance(0.7)  — the pedometer nudge
//   const off = nav.subscribe(() => setState(nav.state()))
//
// A route with no points cannot be walked and is refused up
// front — the router never answers one, so this only guards a
// hand-built route.
//
// Used by:
//   - hooks/useNavigation.ts — one instance per route
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function createNavigation(index: GraphIndex, route: Route): Navigation {

  if (route.points.length === 0) throw new Error('createNavigation: a route needs at least one point');
  const { points } = route;
  const last = points.length - 1;
  const stepAt = stepIndexByPoint(route);
  // A router's route never repeats a node, so the first index
  // is the only one; a hand-built loop snaps to its first pass
  const indexByNode = new Map<string, number>();
  points.forEach((point, i) => {
    if (!indexByNode.has(point.nodeId)) indexByNode.set(point.nodeId, i);
  });


  let at = 0;
  // The pedometer odometer, in the route's own atM metres
  let walkedM = points[0].atM;
  let current = deriveState(index, route, stepAt, at);
  const listeners = new Set<() => void>();


  // Every move funnels through here: the same index builds no
  // state and wakes nobody. Listeners are iterated over a copy
  // so one unsubscribing mid-notify cannot skip its neighbour
  const settle = (next: number) => {
    if (next === at) return;
    at = next;
    current = deriveState(index, route, stepAt, at);
    for (const listener of [...listeners]) listener();
  };

  // An explicit placement (tap, jump, scan) re-bases the
  // odometer; the odometer path itself keeps its overshoot
  const place = (next: number) => {
    walkedM = points[next].atM;
    settle(next);
  };


  return {
    state: () => current,

    next: () => place(Math.min(last, at + 1)),

    back: () => place(Math.max(0, at - 1)),

    jumpTo: (i) => {
      if (!Number.isFinite(i)) return;
      place(Math.max(0, Math.min(last, Math.floor(i))));
    },

    snapTo: (nodeId) => {
      const i = indexByNode.get(nodeId);
      if (i === undefined) return 'off-route';
      place(i);
      return 'on-route';
    },

    advanceByDistance: (metres) => {
      // A negative or NaN nudge is not a step backwards, it is
      // no step at all
      if (!(metres > 0)) return;
      walkedM = Math.min(points[last].atM, walkedM + metres);
      let i = at;
      while (i < last && walkedM + REACH_EPSILON_M >= points[i + 1].atM) i++;
      settle(i);
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
