// -----------------------------------------------------------
//  [*] @knf/wayfindcapture — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for the capture screen and the import
//  flow.
// -----------------------------------------------------------

// The frames and the quaternion helpers behind them — device
// frame and P1 pose convention documented in core/quat.ts
export { identity, fromAxisAngle, multiply, normalize, rotateVector, poseFromQuat, type Quat, type Vec3, type Pose } from './core/quat';

// The gyro-only pose tracker (stillness calibration, bias
// refinement, gravity-pinned pitch/roll)
export { createPoseTracker, type PoseTracker, type TrackerSample, type TrackerState } from './core/pose';

// The target plan and the sphere metric the session steers by
export { planTargets, angularDistanceDeg, type PlanMode, type CaptureTarget } from './core/plan';

// The auto-shutter session: aim, one shoot per attempt,
// accept/fail/retake, the upload manifest
export {
  createCaptureSession,
  type CaptureSession,
  type CaptureSessionOptions,
  type CapturePhase,
  type CaptureEvent,
  type CaptureAim,
  type CaptureSnapshot,
  type ShotRecord,
  type CaptureManifest,
} from './core/session';

// The React view of one session
export { useCaptureSession, type UseCaptureSessionResult } from './hooks/useCaptureSession';

// The imported-panorama metadata reader (JPEG dimensions + XMP
// GPano coverage) — core/metadata.ts is a parallel builder's
// file; it surfaces here and nowhere else
export { parsePanoMetadata, type PanoMetadata, type PanoMetadataGeometry, type PanoMetadataKind } from './core/metadata';
