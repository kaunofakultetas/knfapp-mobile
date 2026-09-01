// -----------------------------------------------------------
//  [*] wayfindcapture — plan
//
//  The target plan a guided capture walks: fixed directions on
//  the sphere, in tracker yaw (yaw zero is wherever
//  calibration ended — the plan is relative, the admin aligns
//  the stitched result afterwards). Two modes, pinned by the
//  Phase 2 contract:
//
//    'full'  — rows at pitch 0, +40, -40 with 12 targets each
//              at 30° yaw steps from 0, plus 4 at +70 and 4
//              at -70 at 45° steps from 0 = 44 targets
//    'walls' — just the three 12-target rows = 36
//
//  Ids are 'r<pitch>-<n>' (r0-0, r40-3, r-70-2); the returned
//  order is row 0 first (yaw ascending), then +40, then -40,
//  then +70, then -70. The stitcher and the server's expected
//  count are built against exactly these lists — changing a
//  row is a contract change, not a tweak.
//
//  Used by:
//    - core/session.ts — nearest-target selection via
//      angularDistanceDeg
//    - src/index.ts — public surface; the capture screen
//      builds its session and the server's capture body from
//      planTargets
// -----------------------------------------------------------

export type PlanMode = 'full' | 'walls';

export interface CaptureTarget {
  id: string;
  yawDeg: number;
  pitchDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;

// The three wall rows every mode has, then the two pole caps
// 'full' adds — order here IS the contract's returned order
const WALL_ROWS = [
  { pitchDeg: 0, count: 12, stepDeg: 30 },
  { pitchDeg: 40, count: 12, stepDeg: 30 },
  { pitchDeg: -40, count: 12, stepDeg: 30 },
];
const CAP_ROWS = [
  { pitchDeg: 70, count: 4, stepDeg: 45 },
  { pitchDeg: -70, count: 4, stepDeg: 45 },
];








// -----------------------------------------------------------
// planTargets
// -----------------------------------------------------------
//
//   planTargets({ mode: 'full' })   — 44 targets, caps included
//   planTargets({ mode: 'walls' })  — 36, the three rows only
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function planTargets({ mode }: { mode: PlanMode }): CaptureTarget[] {

  const rows = mode === 'full' ? [...WALL_ROWS, ...CAP_ROWS] : WALL_ROWS;


  return rows.flatMap((row) =>
    Array.from({ length: row.count }, (_, n) => ({
      id: `r${row.pitchDeg}-${n}`,
      yawDeg: n * row.stepDeg,
      pitchDeg: row.pitchDeg,
    })),
  );
}








// -----------------------------------------------------------
// angularDistanceDeg
// -----------------------------------------------------------
//
// The great-circle angle between two yaw/pitch directions on
// the sphere, in degrees — the spherical law of cosines, with
// the cosine clamped so float error at coincident or
// antipodal points never feeds acos a value beyond ±1. This,
// not a flat yaw/pitch delta, is what "nearest target" means:
// near the poles a large yaw difference is a small turn.
//
// Used by:
//   - core/session.ts — the current target and the aim's
//     distanceDeg
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function angularDistanceDeg(
  a: { yawDeg: number; pitchDeg: number },
  b: { yawDeg: number; pitchDeg: number },
): number {

  const pitchA = a.pitchDeg * DEG_TO_RAD;
  const pitchB = b.pitchDeg * DEG_TO_RAD;
  const dYaw = (a.yawDeg - b.yawDeg) * DEG_TO_RAD;


  const cosine = Math.sin(pitchA) * Math.sin(pitchB) + Math.cos(pitchA) * Math.cos(pitchB) * Math.cos(dYaw);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG_TO_RAD;
}
