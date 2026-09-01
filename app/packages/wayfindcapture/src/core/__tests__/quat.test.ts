// -----------------------------------------------------------
//  [*] Tests — wayfindcapture quat
//
//  The frame contract, pinned in numbers: the P1 pose read out
//  of hand-built rotations about the world axes — the eight
//  compass yaws, pitch both ways, roll both ways, composed
//  yaw+pitch and yaw+roll — plus the algebra (multiply order,
//  normalize, rotateVector against hand-rotated vectors) and
//  the gimbal edges at pitch ±90, which must stay finite.
//
//  The world axes in device terms (upright portrait): +y up,
//  camera along -z. Positive P1 yaw is a device rotation about
//  world -y; positive pitch about +x; positive roll about -z.
// -----------------------------------------------------------

import { fromAxisAngle, identity, multiply, normalize, poseFromQuat, rotateVector, type Quat, type Vec3 } from '../quat';


const DEG = Math.PI / 180;
const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };

// A device turned to P1 yaw ψ: rotation about world -y by ψ
const yawQ = (deg: number): Quat => fromAxisAngle(Y, -deg * DEG);
// Pitched up by φ: rotation about device/world +x
const pitchQ = (deg: number): Quat => fromAxisAngle(X, deg * DEG);
// Rolled clockwise by θ (user's view): rotation about -z
const rollQ = (deg: number): Quat => fromAxisAngle(Z, -deg * DEG);

const expectPose = (q: Quat, yawDeg: number, pitchDeg: number, rollDeg: number) => {
  const pose = poseFromQuat(q);
  expect(pose.yawDeg).toBeCloseTo(yawDeg, 6);
  expect(pose.pitchDeg).toBeCloseTo(pitchDeg, 6);
  expect(pose.rollDeg).toBeCloseTo(rollDeg, 6);
};


describe('poseFromQuat', () => {
  it('reads all zeros at identity', () => {
    expectPose(identity(), 0, 0, 0);
  });

  it('reads the eight compass yaws from clockwise-from-above turns', () => {
    for (const yaw of [45, 90, 135, 180, 225, 270, 315]) expectPose(yawQ(yaw), yaw, 0, 0);
    // 360 folds back to the zero of [0, 360)
    expect(poseFromQuat(yawQ(360)).yawDeg).toBeCloseTo(0, 6);
  });

  it('reads pitch positive up and negative down, yaw and roll untouched', () => {
    expectPose(pitchQ(30), 0, 30, 0);
    expectPose(pitchQ(-50), 0, -50, 0);
  });

  it('reads roll positive clockwise and negative counter-clockwise', () => {
    expectPose(rollQ(20), 0, 0, 20);
    expectPose(rollQ(-35), 0, 0, -35);
    // The seam: +180 stays in (-180, 180], never -180
    expect(poseFromQuat(rollQ(180)).rollDeg).toBeCloseTo(180, 6);
  });

  it('reads a yaw-then-pitch composition without cross-talk', () => {
    expectPose(multiply(yawQ(60), pitchQ(25)), 60, 25, 0);
  });

  it('reads a yaw-then-roll composition without cross-talk', () => {
    expectPose(multiply(yawQ(300), rollQ(-15)), 300, 0, -15);
  });

  it('stays finite and near ±90 pitch at the gimbal edges', () => {
    for (const sign of [1, -1]) {
      const exact = poseFromQuat(pitchQ(sign * 90));
      expect(exact.pitchDeg).toBeCloseTo(sign * 90, 5);
      expect(Number.isFinite(exact.yawDeg)).toBe(true);
      expect(Number.isFinite(exact.rollDeg)).toBe(true);

      const near = poseFromQuat(multiply(yawQ(120), pitchQ(sign * 89.9)));
      expect(near.pitchDeg).toBeCloseTo(sign * 89.9, 4);
      expect(near.yawDeg).toBeCloseTo(120, 3);
    }
  });
});


describe('the algebra', () => {
  it('multiply applies the right factor first', () => {
    // Pitch in the yawed body frame ≠ pitch in the world frame:
    // only the (yaw · pitch) order keeps the camera's elevation
    const pose = poseFromQuat(multiply(pitchQ(40), yawQ(90)));
    expect(pose.pitchDeg).not.toBeCloseTo(40, 1);
    expectPose(multiply(yawQ(90), pitchQ(40)), 90, 40, 0);
  });

  it('rotateVector matches hand-rotated axes', () => {
    // Yaw 90 (clockwise from above) carries the camera ray -z
    // onto world +x
    const forward = rotateVector(yawQ(90), { x: 0, y: 0, z: -1 });
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.y).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(0, 6);

    // Pitch up 90 carries it onto world +y
    const up = rotateVector(pitchQ(90), { x: 0, y: 0, z: -1 });
    expect(up.y).toBeCloseTo(1, 6);
  });

  it('fromAxisAngle ignores axis length and survives degenerate input', () => {
    const scaled = poseFromQuat(fromAxisAngle({ x: 0, y: -7, z: 0 }, 90 * DEG));
    expect(scaled.yawDeg).toBeCloseTo(90, 6);
    expect(fromAxisAngle({ x: 0, y: 0, z: 0 }, 1)).toEqual(identity());
  });

  it('normalize restores unit length and answers identity for the zero quaternion', () => {
    const drifted = { w: 2, x: 0, y: 0, z: 0 };
    expect(normalize(drifted)).toEqual(identity());
    expect(normalize({ w: 0, x: 0, y: 0, z: 0 })).toEqual(identity());

    const q = normalize(multiply(yawQ(33), pitchQ(21)));
    expect(Math.hypot(q.w, q.x, q.y, q.z)).toBeCloseTo(1, 10);
  });
});
