// -----------------------------------------------------------
//  [*] wayfindcapture — session
//
//  The auto-shutter state machine of a guided capture. The
//  host owns the camera and the sensors; the session is fed
//  the tracker's pose plus the raw gyro rates and decides WHEN
//  to shoot WHAT: the current target is the nearest not-yet-
//  accepted one by great-circle distance, 'aligned' means
//  within alignToleranceDeg of it with |roll| inside
//  rollToleranceDeg, 'stable' means every fed gyro component
//  stayed under stillRateRad for the last settleMs. When
//  aligned AND stable it emits ONE 'shoot' per attempt —
//  the emission latches until the host answers accept(id,
//  pose) or fail(id), so threshold jitter can never double-
//  fire the shutter. fail re-arms shooting only 500 ms later
//  (the camera needs a beat and so does the user); accept
//  records the shot, and the last accept flips the phase to
//  'done'. retake un-accepts a target and reopens the phase.
//
//  finish() answers the upload manifest: the target list as
//  handed in, the accepted frames in accept order, and
//  firstYawDeg — the first accepted frame's yaw, which the
//  stitcher puts on the panorama's CENTRE COLUMN (P1).
//
//  subscribe(listener) delivers the contract events { type:
//  'shoot' | 'accepted', targetId } and { type: 'done' }; the
//  listener is ALSO invoked with no event on every other state
//  change (begin, feed, fail, retake), which is what lets
//  useCaptureSession be a plain external-store subscription.
//  snapshot() is identity-stable between changes for the same
//  reason.
//
//  Used by:
//    - src/hooks/useCaptureSession.ts — the React view of one
//      session
//    - src/index.ts — public surface; the capture screen feeds
//      sensors in and answers shoots with camera results
// -----------------------------------------------------------

import { angularDistanceDeg, type CaptureTarget } from './plan';
import type { Pose, Vec3 } from './quat';


export type CapturePhase = 'idle' | 'capturing' | 'done';

export type CaptureEvent = { type: 'shoot'; targetId: string } | { type: 'accepted'; targetId: string } | { type: 'done' };

export interface CaptureAim {
  dYawDeg: number;
  dPitchDeg: number;
  distanceDeg: number;
  aligned: boolean;
  stable: boolean;
}

export interface ShotRecord {
  targetId: string;
  pose: Pose;
  at: number;
}

export interface CaptureManifest {
  targets: CaptureTarget[];
  frames: ShotRecord[];
  firstYawDeg: number;
}

export interface CaptureSnapshot {
  phase: CapturePhase;
  targets: (CaptureTarget & { done: boolean })[];
  currentId: string | null;
  aim: CaptureAim | null;
  shots: ShotRecord[];
  shotsDone: number;
  shotsTotal: number;
}

export interface CaptureSessionOptions {
  targets: CaptureTarget[];
  alignToleranceDeg?: number;
  rollToleranceDeg?: number;
  stillRateRad?: number;
  settleMs?: number;
  // Injectable clock for tests; stability and re-arm windows
  // are measured on it
  now?: () => number;
}

export interface CaptureSession {
  begin(): void;
  feed(pose: Pose, gyroRates: Vec3): CaptureAim | null;
  accept(targetId: string, pose: Pose): void;
  fail(targetId: string): void;
  retake(targetId: string): void;
  shots(): ShotRecord[];
  finish(): CaptureManifest;
  phase(): CapturePhase;
  current(): string | null;
  snapshot(): CaptureSnapshot;
  subscribe(listener: (event?: CaptureEvent) => void): () => void;
}

// A failed attempt re-arms only after this pause — the camera
// pipeline and the user's hand both need the beat
const REARM_MS = 500;

// The shortest signed arc from one yaw to another, in
// (-180, 180] — the aim's dYawDeg, so "turn left 10°" never
// reads as "turn right 350°"
const shortestArcDeg = (fromDeg: number, toDeg: number): number => {
  let delta = (toDeg - fromDeg) % 360;
  if (delta <= -180) delta += 360;
  else if (delta > 180) delta -= 360;
  return delta === 0 ? 0 : delta;
};








// -----------------------------------------------------------
// createCaptureSession
// -----------------------------------------------------------
//
//   const session = createCaptureSession({ targets })
//   session.begin()
//   session.feed(pose, gyro)      — every sensor frame
//   … on { type: 'shoot', targetId }: take the photo, then
//   session.accept(targetId, pose) or session.fail(targetId)
//   session.finish()              — the upload manifest
//
// Defaults are the P3 contract: align 6°, roll 8°, stillness
// under 0.05 rad/s held 300 ms.
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function createCaptureSession(options: CaptureSessionOptions): CaptureSession {

  const targets = options.targets;
  const alignToleranceDeg = options.alignToleranceDeg ?? 6;
  const rollToleranceDeg = options.rollToleranceDeg ?? 8;
  const stillRateRad = options.stillRateRad ?? 0.05;
  const settleMs = options.settleMs ?? 300;
  const now = options.now ?? Date.now;


  let phase: CapturePhase = 'idle';
  const accepted = new Map<string, ShotRecord>();
  let order: ShotRecord[] = [];
  let lastAim: CaptureAim | null = null;
  let currentId: string | null = null;
  // The latch: while an attempt waits for accept/fail no second
  // shoot can fire, whatever the aim does
  let pendingId: string | null = null;
  let rearmUntil = 0;
  let quietSince: number | null = null;


  let listeners: ((event?: CaptureEvent) => void)[] = [];
  let cachedSnapshot: CaptureSnapshot | null = null;


  const emit = (event?: CaptureEvent) => {
    cachedSnapshot = null;
    for (const listener of [...listeners]) listener(event);
  };


  const nearestUnaccepted = (pose: Pose): CaptureTarget | null => {
    let best: CaptureTarget | null = null;
    let bestDistance = Infinity;
    for (const target of targets) {
      if (accepted.has(target.id)) continue;
      const distance = angularDistanceDeg(pose, target);
      // Strict < keeps ties on the plan's own order
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  };


  const feed = (pose: Pose, gyroRates: Vec3): CaptureAim | null => {

    // Stability is measured over the FED history: a loud sample
    // restarts the clock, and the first quiet one starts it
    const t = now();
    const quiet = Math.abs(gyroRates.x) < stillRateRad && Math.abs(gyroRates.y) < stillRateRad && Math.abs(gyroRates.z) < stillRateRad;
    if (!quiet) quietSince = null;
    else if (quietSince === null) quietSince = t;
    const stable = quietSince !== null && t - quietSince >= settleMs;


    const target = nearestUnaccepted(pose);
    currentId = target ? target.id : null;
    if (!target) {
      lastAim = null;
      emit();
      return null;
    }


    const distanceDeg = angularDistanceDeg(pose, target);
    const aligned = distanceDeg <= alignToleranceDeg && Math.abs(pose.rollDeg) <= rollToleranceDeg;
    lastAim = {
      dYawDeg: shortestArcDeg(pose.yawDeg, target.yawDeg),
      dPitchDeg: target.pitchDeg - pose.pitchDeg,
      distanceDeg,
      aligned,
      stable,
    };


    // The shoot decision — once per attempt: nothing fires while
    // a shot is pending or inside a fail's re-arm pause
    if (phase === 'capturing' && aligned && stable && pendingId === null && t >= rearmUntil) {
      pendingId = target.id;
      emit({ type: 'shoot', targetId: target.id });
      return lastAim;
    }


    emit();
    return lastAim;
  };


  const accept = (targetId: string, pose: Pose) => {
    if (pendingId === targetId) pendingId = null;
    const known = targets.some((target) => target.id === targetId);
    if (!known || accepted.has(targetId)) return;


    const record: ShotRecord = { targetId, pose, at: now() };
    accepted.set(targetId, record);
    order = [...order, record];
    emit({ type: 'accepted', targetId });


    if (accepted.size === targets.length && phase === 'capturing') {
      phase = 'done';
      emit({ type: 'done' });
    }
  };


  const fail = (targetId: string) => {
    if (pendingId !== targetId) return;
    pendingId = null;
    rearmUntil = now() + REARM_MS;
    emit();
  };


  const retake = (targetId: string) => {
    const record = accepted.get(targetId);
    if (!record) return;
    accepted.delete(targetId);
    order = order.filter((shot) => shot !== record);
    if (phase === 'done') phase = 'capturing';
    emit();
  };


  const snapshot = (): CaptureSnapshot => {
    cachedSnapshot ??= {
      phase,
      targets: targets.map((target) => ({ ...target, done: accepted.has(target.id) })),
      currentId,
      aim: lastAim,
      shots: [...order],
      shotsDone: accepted.size,
      shotsTotal: targets.length,
    };
    return cachedSnapshot;
  };


  return {
    begin: () => {
      if (phase !== 'idle') return;
      phase = 'capturing';
      emit();
    },
    feed,
    accept,
    fail,
    retake,
    shots: () => [...order],
    // An empty capture has no centre column — 0 is the harmless
    // stand-in, and the server refuses under-filled captures
    // anyway
    finish: () => ({ targets: [...targets], frames: [...order], firstYawDeg: order[0]?.pose.yawDeg ?? 0 }),
    phase: () => phase,
    current: () => currentId,
    snapshot,
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((held) => held !== listener);
      };
    },
  };
}
