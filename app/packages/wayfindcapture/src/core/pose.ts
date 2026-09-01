// -----------------------------------------------------------
//  [*] wayfindcapture — pose
//
//  The gyro-only pose tracker behind a guided capture: feed it
//  raw sensor samples (gyro rad/s and accel m/s² in the device
//  frame of core/quat.ts, plus the sample's dtMs) and it
//  answers the P1 pose. Yaw is pure gyro integration — no
//  magnetometer, so yaw zero is arbitrary and drifts only as
//  fast as the residual bias — while pitch and roll are pinned
//  to gravity.
//
//  Life of a tracker:
//
//    'settling'  — waits for stillness (every |gyro| under
//                  0.02 rad/s) held for 1500 ms; a loud sample
//                  restarts the wait. When the window
//                  completes, the gyro bias freezes as the
//                  mean over it, the pose zeroes to identity,
//                  and the state flips to 'tracking'. The pose
//                  answered while settling is all zeros.
//    'tracking'  — each sample right-multiplies the de-biased
//                  body rates onto the orientation. During any
//                  later stillness held 350 ms the bias
//                  refines 2% per sample toward that stretch's
//                  observed mean, so a warming gyro never
//                  walks away. The accel vector, low-passed
//                  with alpha 0.8, pulls the orientation's
//                  gravity estimate 2% per sample toward the
//                  measured direction — the correction axis is
//                  perpendicular to both, so pitch/roll stop
//                  drifting while yaw stays gyro-true.
//
//  The accelerometer at rest is taken to point along world up
//  (it measures the support force, not gravity itself); hosts
//  feeding G-unit sensors need only consistent units, since
//  the direction is all the correction uses. biasDps reports
//  the bias in deg/s for a HUD — the running still-window mean
//  while settling, the live refined bias after.
//
//  Used by:
//    - src/index.ts — public surface; the capture screen owns
//      the expo sensor subscriptions and pushes here
// -----------------------------------------------------------

import { fromAxisAngle, identity, multiply, normalize, poseFromQuat, rotateVector, type Pose, type Quat, type Vec3 } from './quat';


export type TrackerState = 'settling' | 'tracking';

export interface TrackerSample {
  gyro: Vec3;
  accel: Vec3;
  dtMs: number;
}

export interface PoseTracker {
  push(sample: TrackerSample): Pose;
  state(): TrackerState;
  biasDps(): Vec3;
}

const RAD_TO_DEG = 180 / Math.PI;

// Stillness is a raw-gyro judgement — the bias is unknown while
// judging, so the threshold must swallow bias plus hand tremor
const STILL_RATE_RAD = 0.02;
const CALIBRATE_MS = 1500;
const REFINE_AFTER_MS = 350;
const REFINE_RATE = 0.02;
const GRAVITY_RATE = 0.02;
const ACCEL_LP_ALPHA = 0.8;

const ZERO_POSE: Pose = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };








// -----------------------------------------------------------
// createPoseTracker
// -----------------------------------------------------------
//
//   const tracker = createPoseTracker()
//   const pose = tracker.push({ gyro, accel, dtMs })
//   tracker.state()     — 'settling' | 'tracking', for the HUD's
//                         "hold still" gate
//   tracker.biasDps()   — the gyro bias in deg/s
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function createPoseTracker(): PoseTracker {

  let q: Quat = identity();
  let trackerState: TrackerState = 'settling';
  let pose: Pose = ZERO_POSE;
  let bias: Vec3 = { x: 0, y: 0, z: 0 };


  // The current unbroken stillness stretch: duration and the
  // running per-axis mean it would freeze or refine the bias to
  let stillMs = 0;
  let stillCount = 0;
  let stillSum: Vec3 = { x: 0, y: 0, z: 0 };
  let accelLP: Vec3 | null = null;


  const stillMean = (): Vec3 => ({ x: stillSum.x / stillCount, y: stillSum.y / stillCount, z: stillSum.z / stillCount });


  const push = (sample: TrackerSample): Pose => {

    // Track the stillness stretch on the RAW rates — one loud
    // axis resets it, settling and refinement both read it
    const still =
      Math.abs(sample.gyro.x) < STILL_RATE_RAD &&
      Math.abs(sample.gyro.y) < STILL_RATE_RAD &&
      Math.abs(sample.gyro.z) < STILL_RATE_RAD;
    if (still) {
      stillMs += Math.max(0, sample.dtMs);
      stillCount += 1;
      stillSum = { x: stillSum.x + sample.gyro.x, y: stillSum.y + sample.gyro.y, z: stillSum.z + sample.gyro.z };
    } else {
      stillMs = 0;
      stillCount = 0;
      stillSum = { x: 0, y: 0, z: 0 };
    }


    // The gravity reference smooths across shutter shakes and
    // footsteps — alpha is retention, so 0.8 keeps ~4 samples
    accelLP = accelLP
      ? {
          x: ACCEL_LP_ALPHA * accelLP.x + (1 - ACCEL_LP_ALPHA) * sample.accel.x,
          y: ACCEL_LP_ALPHA * accelLP.y + (1 - ACCEL_LP_ALPHA) * sample.accel.y,
          z: ACCEL_LP_ALPHA * accelLP.z + (1 - ACCEL_LP_ALPHA) * sample.accel.z,
        }
      : { ...sample.accel };


    // Settling: no integration — the pose stays zero until the
    // calibration window completes and freezes the bias
    if (trackerState === 'settling') {
      if (still && stillCount > 0 && stillMs >= CALIBRATE_MS) {
        bias = stillMean();
        q = identity();
        trackerState = 'tracking';
      }
      return pose;
    }


    // De-biased body rates, integrated as one axis-angle step on
    // the right (body frame) — exact for a constant-rate sample
    const rate: Vec3 = { x: sample.gyro.x - bias.x, y: sample.gyro.y - bias.y, z: sample.gyro.z - bias.z };
    const angleRad = Math.hypot(rate.x, rate.y, rate.z) * (Math.max(0, sample.dtMs) / 1000);
    if (angleRad > 0) q = multiply(q, fromAxisAngle(rate, angleRad));


    // A held stillness keeps teaching the bias, gently — 2% per
    // sample toward the stretch's mean
    if (still && stillCount > 0 && stillMs >= REFINE_AFTER_MS) {
      const mean = stillMean();
      bias = {
        x: bias.x + REFINE_RATE * (mean.x - bias.x),
        y: bias.y + REFINE_RATE * (mean.y - bias.y),
        z: bias.z + REFINE_RATE * (mean.z - bias.z),
      };
    }


    // Gravity correction: rotate 2% of the way from the predicted
    // world-up-in-device-frame toward the measured one. The axis
    // measured×predicted (body frame, right-multiplied) is what
    // moves predicted TOWARD measured; it is perpendicular to
    // gravity, so yaw is untouched
    const accelLen = Math.hypot(accelLP.x, accelLP.y, accelLP.z);
    if (accelLen > 1e-6) {
      const measured: Vec3 = { x: accelLP.x / accelLen, y: accelLP.y / accelLen, z: accelLP.z / accelLen };
      const predicted = rotateVector({ w: q.w, x: -q.x, y: -q.y, z: -q.z }, WORLD_UP);
      const axis: Vec3 = {
        x: measured.y * predicted.z - measured.z * predicted.y,
        y: measured.z * predicted.x - measured.x * predicted.z,
        z: measured.x * predicted.y - measured.y * predicted.x,
      };
      const axisLen = Math.hypot(axis.x, axis.y, axis.z);
      if (axisLen > 1e-9) {
        const dot = measured.x * predicted.x + measured.y * predicted.y + measured.z * predicted.z;
        const errorRad = Math.atan2(axisLen, Math.min(1, Math.max(-1, dot)));
        q = multiply(q, fromAxisAngle(axis, GRAVITY_RATE * errorRad));
      }
    }


    q = normalize(q);
    pose = poseFromQuat(q);
    return pose;
  };


  return {
    push,
    state: () => trackerState,
    // While settling the freeze has not happened yet — show the
    // running still-window mean so the HUD's number moves
    biasDps: () => {
      const current = trackerState === 'settling' && stillCount > 0 ? stillMean() : bias;
      return { x: current.x * RAD_TO_DEG, y: current.y * RAD_TO_DEG, z: current.z * RAD_TO_DEG };
    },
  };
}
