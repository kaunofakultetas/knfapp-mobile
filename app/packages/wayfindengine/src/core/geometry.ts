// -----------------------------------------------------------
//  [*] wayfindengine — geometry
//
//  Plan-space trigonometry, pure. Plans are drawings: x grows
//  to the right and y grows DOWN, so a bearing of 0 points up
//  the page, 90 points right, and the wheel turns clockwise —
//  the frame a compass rose printed on the drawing shows,
//  which is why every bearing the engine reports lives in it.
//  A turn is the signed shortest arc between two successive
//  bearings: negative is left, positive is right, and the
//  thresholds (25 / 70 / 135 degrees) are the ones spoken
//  directions need — a corridor kink is "straight", a fork is
//  "slight", a corner is a "turn", anything sharper is a
//  u-turn.
//
//  Used by:
//    - core/instructions.ts — the turn at every corner, the
//      corridor nodes that are not corners, the arrival side
//    - core/navigation.ts — bearingToNext / panoYawToNext
//    - src/index.ts — public surface, for a host's own plan
//      renderer (the UI kit imports nothing from the engine
//      and draws every point the host hands it)
// -----------------------------------------------------------

import type { TurnDirection } from './types';


export interface PlanPoint {
  x: number;
  y: number;
}

// The turn vocabulary's boundaries on the ABSOLUTE arc: under
// the first it is no turn at all, under the second a fork, up
// to and including the third a corner, beyond it a reversal
const STRAIGHT_BELOW_DEG = 25;
const SLIGHT_BELOW_DEG = 70;
const TURN_UP_TO_DEG = 135;







// -----------------------------------------------------------
// bearingDeg
// -----------------------------------------------------------
//
// The direction from a to b in 0..360: 0 up the drawing, 90
// right, clockwise. atan2 takes (dx, -dy) instead of the
// textbook (dy, dx) so that "up" is the zero and the sweep is
// clockwise in a y-down frame. Two coincident points have no
// direction and answer 0 — left to atan2, the negative zero in
// -dy would make 180 of them.
//
// Used by:
//   - compressPath (below)
//   - core/instructions.ts — the bearing into and out of a node
//   - core/navigation.ts — bearingToNext
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function bearingDeg(a: PlanPoint, b: PlanPoint): number {

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;


  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}







// -----------------------------------------------------------
// shortestArcDeg
// -----------------------------------------------------------
//
// The signed turn from one bearing to another, the short way
// round, in (-180, 180]: negative is left, positive is right.
// 350 → 10 is +20, not -340. A reversal is +180 from either
// side, so a u-turn is never reported as "left" by accident.
//
// Used by:
//   - turnBetween / compressPath (below)
//   - core/instructions.ts — the arrival side at a room polygon
//   - core/navigation.ts — panoYawToNext, the signed arc from
//     the panorama's centre column unfolded into [0, 360)
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function shortestArcDeg(from: number, to: number): number {

  // JS % keeps the dividend's sign, so the raw delta lands in
  // (-360, 360) and one correction each way folds it into range
  let delta = (to - from) % 360;
  if (delta <= -180) delta += 360;
  else if (delta > 180) delta -= 360;


  // 360 → 0 leaves a negative zero behind, which Object.is (and
  // every strict test) tells apart from 0
  return delta === 0 ? 0 : delta;
}







// -----------------------------------------------------------
// turnBetween
// -----------------------------------------------------------
//
// The spoken turn from the bearing a walker arrives on to the
// one they leave on. Thresholds on the absolute arc, sign for
// the side: |δ| < 25 straight, 25 ≤ |δ| < 70 slight, 70 ≤ |δ|
// ≤ 135 a turn, beyond 135 a u-turn (which has no side).
//
// Used by:
//   - core/instructions.ts — one 'turn' step per corner
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function turnBetween(bearingA: number, bearingB: number): TurnDirection {

  const delta = shortestArcDeg(bearingA, bearingB);
  const size = Math.abs(delta);


  if (size < STRAIGHT_BELOW_DEG) return 'straight';
  if (size > TURN_UP_TO_DEG) return 'u-turn';
  const left = delta < 0;
  if (size < SLIGHT_BELOW_DEG) return left ? 'slight-left' : 'slight-right';
  return left ? 'left' : 'right';
}







// -----------------------------------------------------------
// compressPath
// -----------------------------------------------------------
//
// The same polyline with the points that add no direction
// removed: an interior point stays only when the bearing in
// and the bearing out differ by at least the tolerance. The
// first and last points always stay. Objects are passed
// through, not copied, so a RoutePoint keeps its node id.
//
// Used by:
//   - core/instructions.ts — the corridor nodes that are not
//     corners
//   - src/index.ts — public surface, for a host that thins a
//     floor segment before drawing it
// -----------------------------------------------------------

export function compressPath<P extends PlanPoint>(points: P[], toleranceDeg = 10): P[] {

  // Consecutive duplicates go first: a zero-length segment has
  // no bearing, and a corner with a doubled vertex must still
  // be recognised as a corner
  const distinct: P[] = [];
  for (const point of points) {
    const last = distinct[distinct.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    distinct.push(point);
  }
  if (distinct.length < 3) return distinct;


  // The incoming bearing is measured from the last KEPT point,
  // not the previous raw one: a long gentle arc of tiny bends
  // would otherwise flatten to a chord, every bend under the
  // tolerance on its own while their sum is a whole corner
  const kept: P[] = [distinct[0]];
  for (let i = 1; i < distinct.length - 1; i++) {
    const anchor = kept[kept.length - 1];
    const incoming = bearingDeg(anchor, distinct[i]);
    const outgoing = bearingDeg(distinct[i], distinct[i + 1]);
    if (Math.abs(shortestArcDeg(incoming, outgoing)) < toleranceDeg) continue;
    kept.push(distinct[i]);
  }
  kept.push(distinct[distinct.length - 1]);
  return kept;
}
