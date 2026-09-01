// -----------------------------------------------------------
//  [*] Tests — wayfindcapture pose
//
//  The tracker driven with synthetic sensor streams: the
//  settle → freeze → track life cycle (a loud sample restarts
//  the calibration wait), a 90° turn at 100 Hz landing within
//  a degree with the P1 sign (turning right reads a NEGATIVE
//  gyro y on an upright device), a constant bias swallowed by
//  the calibration so 30 s of stillness drifts yaw under half
//  a degree, the gravity correction righting a pitch error
//  without touching yaw, and dt jitter.
// -----------------------------------------------------------

import { createPoseTracker, type PoseTracker, type TrackerSample } from '../pose';
import type { Vec3 } from '../quat';


const UPRIGHT_ACCEL: Vec3 = { x: 0, y: 9.81, z: 0 };

const still = (dtMs = 10): TrackerSample => ({ gyro: { x: 0, y: 0, z: 0 }, accel: UPRIGHT_ACCEL, dtMs });

const feed = (tracker: PoseTracker, sample: TrackerSample, count: number) => {
  let pose = tracker.push(sample);
  for (let i = 1; i < count; i++) pose = tracker.push(sample);
  return pose;
};

// 1500 ms of stillness at 100 Hz — enough to freeze the bias
const settle = (tracker: PoseTracker, gyro: Vec3 = { x: 0, y: 0, z: 0 }) =>
  feed(tracker, { gyro, accel: UPRIGHT_ACCEL, dtMs: 10 }, 150);


describe('settling', () => {
  it('needs 1500 ms of stillness and answers a zero pose meanwhile', () => {
    const tracker = createPoseTracker();
    expect(tracker.state()).toBe('settling');

    const during = feed(tracker, still(), 149); // 1490 ms
    expect(tracker.state()).toBe('settling');
    expect(during).toEqual({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });

    tracker.push(still());
    expect(tracker.state()).toBe('tracking');
  });

  it('a loud sample restarts the calibration wait', () => {
    const tracker = createPoseTracker();
    feed(tracker, still(), 100); // 1000 ms of quiet
    tracker.push({ gyro: { x: 0.5, y: 0, z: 0 }, accel: UPRIGHT_ACCEL, dtMs: 10 });
    feed(tracker, still(), 149); // 1490 ms since the shake
    expect(tracker.state()).toBe('settling');

    tracker.push(still());
    expect(tracker.state()).toBe('tracking');
  });

  it('reports the running still-window mean as biasDps while settling', () => {
    const tracker = createPoseTracker();
    feed(tracker, { gyro: { x: 0.01, y: 0, z: 0 }, accel: UPRIGHT_ACCEL, dtMs: 10 }, 50);
    expect(tracker.biasDps().x).toBeCloseTo(0.01 * (180 / Math.PI), 6);
    expect(tracker.biasDps().y).toBeCloseTo(0, 6);
  });
});


describe('integration', () => {
  it('a 90° right turn in 1 s at 100 Hz lands within 1°', () => {
    const tracker = createPoseTracker();
    settle(tracker);

    // Clockwise from above = NEGATIVE gyro y on an upright device
    const pose = feed(tracker, { gyro: { x: 0, y: -Math.PI / 2, z: 0 }, accel: UPRIGHT_ACCEL, dtMs: 10 }, 100);
    expect(Math.abs(pose.yawDeg - 90)).toBeLessThan(1);
    expect(Math.abs(pose.pitchDeg)).toBeLessThan(1);
    expect(Math.abs(pose.rollDeg)).toBeLessThan(1);
  });

  it('a left turn winds yaw the other way round the circle', () => {
    const tracker = createPoseTracker();
    settle(tracker);

    const pose = feed(tracker, { gyro: { x: 0, y: Math.PI / 2, z: 0 }, accel: UPRIGHT_ACCEL, dtMs: 10 }, 100);
    expect(Math.abs(pose.yawDeg - 270)).toBeLessThan(1);
  });

  it('dt jitter does not bend a constant-rate turn', () => {
    const tracker = createPoseTracker();
    settle(tracker);

    // The same 90° turn, delivered in ragged slices summing 1000 ms
    const slices = [5, 15, 10, 30, 20, 10, 5, 5];
    let elapsed = 0;
    let pose = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    while (elapsed < 1000) {
      const dtMs = Math.min(slices[Math.floor(elapsed / 10) % slices.length], 1000 - elapsed);
      pose = tracker.push({ gyro: { x: 0, y: -Math.PI / 2, z: 0 }, accel: UPRIGHT_ACCEL, dtMs });
      elapsed += dtMs;
    }
    expect(Math.abs(pose.yawDeg - 90)).toBeLessThan(1);
  });
});


describe('bias', () => {
  it('a constant 0.01 rad/s bias frozen at calibration holds yaw within 0.5° over 30 s', () => {
    const tracker = createPoseTracker();
    const biased: TrackerSample = { gyro: { x: 0.01, y: 0.01, z: 0.01 }, accel: UPRIGHT_ACCEL, dtMs: 10 };
    feed(tracker, biased, 150);
    expect(tracker.state()).toBe('tracking');

    const pose = feed(tracker, biased, 3000); // 30 s more of the same
    expect(Math.abs(pose.yawDeg > 180 ? pose.yawDeg - 360 : pose.yawDeg)).toBeLessThan(0.5);
    expect(Math.abs(pose.pitchDeg)).toBeLessThan(0.5);
    expect(tracker.biasDps().x).toBeCloseTo(0.01 * (180 / Math.PI), 4);
  });
});


describe('gravity correction', () => {
  it('rights a pitch error at 2% per sample while yaw stays put', () => {
    const tracker = createPoseTracker();
    settle(tracker);

    // The device is really pitched up 20° but the gyro said
    // nothing — only the accel direction knows
    const rad = (20 * Math.PI) / 180;
    const pitchedAccel: Vec3 = { x: 0, y: 9.81 * Math.cos(rad), z: -9.81 * Math.sin(rad) };
    const pose = feed(tracker, { gyro: { x: 0, y: 0, z: 0 }, accel: pitchedAccel, dtMs: 10 }, 600);
    expect(Math.abs(pose.pitchDeg - 20)).toBeLessThan(0.5);
    expect(Math.abs(pose.yawDeg > 180 ? pose.yawDeg - 360 : pose.yawDeg)).toBeLessThan(0.5);
    expect(Math.abs(pose.rollDeg)).toBeLessThan(0.5);
  });

  it('leaves a gyro-true turn alone when accel agrees with the pose', () => {
    const tracker = createPoseTracker();
    settle(tracker);

    // Upright yaw turns keep gravity on device y — the corrector
    // must not fight them
    const pose = feed(tracker, { gyro: { x: 0, y: -Math.PI / 4, z: 0 }, accel: UPRIGHT_ACCEL, dtMs: 10 }, 200);
    expect(Math.abs(pose.yawDeg - 90)).toBeLessThan(1);
    expect(Math.abs(pose.pitchDeg)).toBeLessThan(0.5);
  });
});
