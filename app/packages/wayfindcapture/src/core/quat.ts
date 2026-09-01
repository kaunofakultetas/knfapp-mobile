// -----------------------------------------------------------
//  [*] wayfindcapture — quat
//
//  Minimal pure quaternion helpers, and the ONE place the
//  capture stack's frames are defined. DEVICE frame (right-
//  handed, the standard mobile sensor frame): x to the
//  device's right as the user looks at the screen, y up the
//  screen, z out of the screen toward the user — so the back
//  camera looks along -z. WORLD frame: the device frame of an
//  upright portrait device at the identity quaternion — world
//  y is up (against gravity), the camera faces world -z at
//  yaw 0.
//
//  A quaternion here is the device's orientation IN the world:
//  rotateVector(q, v) carries a device-frame vector into world
//  coordinates. multiply(a, b) composes so that R(a·b) =
//  R(a)·R(b) — b turns first — which is why body-frame gyro
//  steps are RIGHT-multiplied onto the running orientation.
//
//  poseFromQuat reads the capture pose convention out of a
//  quaternion: yawDeg in [0, 360) growing clockwise as seen
//  from above (the facing swings from -z toward +x), pitchDeg
//  in [-90, 90] positive up, rollDeg in (-180, 180] positive
//  when the device is tilted clockwise from upright portrait
//  as the user sees it. Yaw zero is wherever the tracker's
//  calibration ended — arbitrary until the admin aligns the
//  stitched panorama.
//
//  Used by:
//    - core/pose.ts — gyro integration, gravity correction
//    - src/index.ts — public surface, for a host's own tests
//      and synthetic poses
// -----------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

const RAD_TO_DEG = 180 / Math.PI;

// asin feeds on rotateVector output, which float error can push
// a hair beyond ±1 — clamp or pitch turns NaN at the poles
const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

// The inverse rotation of a unit quaternion — world into device
const conjugate = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });








// -----------------------------------------------------------
// identity
// -----------------------------------------------------------
//
// The upright-portrait orientation: device frame equals world
// frame, the camera faces world -z, pose all zeros.
//
// Used by:
//   - core/pose.ts — the tracker's start and its calibration
//     zeroing
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function identity(): Quat {

  return { w: 1, x: 0, y: 0, z: 0 };
}








// -----------------------------------------------------------
// fromAxisAngle
// -----------------------------------------------------------
//
// The rotation of angleRad radians about the given axis,
// right-handed (thumb along the axis, fingers curl the way
// the rotation goes). The axis need not be unit length; a
// zero axis or zero angle is the identity, not NaN.
//
// Used by:
//   - core/pose.ts — one gyro step and one gravity nudge per
//     sample
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function fromAxisAngle(axis: Vec3, angleRad: number): Quat {

  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length === 0 || angleRad === 0) return identity();


  const s = Math.sin(angleRad / 2) / length;
  return { w: Math.cos(angleRad / 2), x: axis.x * s, y: axis.y * s, z: axis.z * s };
}








// -----------------------------------------------------------
// multiply
// -----------------------------------------------------------
//
// Hamilton product a·b: the rotation that applies b FIRST,
// then a. A body-frame delta therefore goes on the right of
// the running orientation, a world-frame one on the left.
//
// Used by:
//   - core/pose.ts — integration and correction
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function multiply(a: Quat, b: Quat): Quat {

  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}








// -----------------------------------------------------------
// normalize
// -----------------------------------------------------------
//
// Back to unit length — thousands of multiplies per second
// drift the norm, and rotateVector assumes a unit quaternion.
// A degenerate zero quaternion answers identity rather than
// dividing by zero.
//
// Used by:
//   - core/pose.ts — once per pushed sample
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function normalize(q: Quat): Quat {

  const length = Math.hypot(q.w, q.x, q.y, q.z);
  if (length === 0) return identity();


  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}








// -----------------------------------------------------------
// rotateVector
// -----------------------------------------------------------
//
// q v q* without building intermediate quaternions: with the
// vector part u, t = 2 u×v and v' = v + w t + u×t. Carries a
// DEVICE-frame vector into WORLD coordinates when q is the
// device's orientation; feed conjugate(q) for the other way.
//
// Used by:
//   - poseFromQuat (below) — the camera ray and world up
//   - core/pose.ts — the predicted gravity direction
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function rotateVector(q: Quat, v: Vec3): Vec3 {

  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);


  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}








// -----------------------------------------------------------
// poseFromQuat
// -----------------------------------------------------------
//
// The capture pose read out of an orientation. Yaw and pitch
// come from the camera ray (device -z in world): pitch is its
// elevation, yaw its clockwise-from-above compass angle,
// atan2(x, -z) so that -z is zero and the sweep runs toward
// +x. Roll comes from where the device frame sees world up:
// upright it is (0, 1, 0); tilted clockwise by θ it swings to
// (-sin θ, cos θ, 0), so atan2(-up.x, up.y) recovers θ with
// the P1 sign. At pitch ±90 both atan2 calls read (≈0, ≈0) —
// they answer 0 rather than NaN, so the gimbal edge degrades
// to a defined (if arbitrary) yaw and roll.
//
// Used by:
//   - core/pose.ts — the pose every push answers
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function poseFromQuat(q: Quat): Pose {

  // Where the camera looks, in world coordinates
  const forward = rotateVector(q, { x: 0, y: 0, z: -1 });
  const pitchDeg = Math.asin(clamp1(forward.y)) * RAD_TO_DEG;


  const yawRaw = Math.atan2(forward.x, -forward.z) * RAD_TO_DEG;
  const yawDeg = ((yawRaw % 360) + 360) % 360;


  // World up as the device sees it — the roll reference
  const up = rotateVector(conjugate(q), { x: 0, y: 1, z: 0 });
  let rollDeg = Math.atan2(-up.x, up.y) * RAD_TO_DEG;
  if (rollDeg <= -180) rollDeg += 360;


  return { yawDeg, pitchDeg, rollDeg };
}
