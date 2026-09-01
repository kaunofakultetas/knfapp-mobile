// -----------------------------------------------------------
//  [*] wayfinduikit — CaptureHud
//
//  The guided-capture overlay: the dots an admin sweeps the
//  phone across while photographing a panorama, laid over the
//  host's camera preview. The HUD is PURE — no camera, no
//  sensors, no session: the capture session owns the aim/shoot
//  rule and hands the HUD its verdicts (`aligned`, `stable`)
//  along with the pose, so the overlay never disagrees with
//  the thing that actually accepts a shot. It re-renders per
//  pose sample, which is why every child is a leaf view and
//  the maths is the same pure projectToScreen the panorama
//  stages already pay for.
//
//  Each not-yet-done target in view is a dot placed by the
//  pinhole projection with the pose as the camera; a target
//  behind the camera or off the viewport is HIDDEN, not
//  clamped — a capture HUD wants only what the lens sees, a
//  wall of pinned dots at the edges would read as targets in
//  their own right. The one exception is the CURRENT target:
//  losing the thing being aimed at is worse than an edge pin,
//  so its ring clamps to the edge with an arrow leaning the
//  way the phone must turn (the route marker's own clampToEdge
//  rule). The ring fills success-coloured only when the
//  session says aligned AND stable — the exact moment it will
//  emit shoot — and a done target stays faintly, a memory of
//  coverage rather than an instruction. A fixed reticle marks
//  the aim point, the progress line counts the shots, and the
//  roll hint appears exactly where the session starts refusing
//  shots (|roll| past 8°).
//
//  Used by:
//    - the host app, through the root export — the admin
//      capture screen lays it over its camera preview at the
//      preview's measured size and the tracker's frame fov
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { clampToEdge, projectToScreen } from '../pano/projection';
import { useKitLabels, useKitTheme } from '../provider';


export interface CaptureHudTarget {
  id: string;
  yawDeg: number;
  pitchDeg: number;
  done: boolean;
}

// The tracker's pose: yaw [0, 360) clockwise from above,
// pitch positive up, roll positive tilted clockwise from
// upright portrait — the capture frame conventions as they are
export interface CaptureHudPose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface CaptureHudProps {
  targets: CaptureHudTarget[];
  currentId: string | null;
  pose: CaptureHudPose;
  fovDeg: number;
  aligned: boolean;
  stable: boolean;
  shotsDone: number;
  shotsTotal: number;
  width: number;
  height: number;
}


// The ring's footprint and its breathing room from the edges
const RING_SIZE = 56;
const RING_EDGE_INSET = 8;

const DOT_SIZE = 10;

// A done target is a memory of coverage, not an instruction
const DONE_OPACITY = 0.35;

// The session refuses a shot past ±8° of roll, so the hint
// appears exactly where the refusal begins
const ROLL_HINT_DEG = 8;

const RETICLE_SIZE = 28;

// A pose before the tracker's first sample may carry NaN; the
// overlay draws the level default rather than vanishing
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);







// -----------------------------------------------------------
// leanAngleDeg
// -----------------------------------------------------------
//
// Which way the ring's arrow points when the current target is
// off-view: the screen direction from the viewport centre to
// the RAW projected point (behind-camera points are already
// pushed outside along their screen-plane direction, so the
// same formula serves both sides of the lens). 0 is up,
// growing clockwise — the frame a rotated chevron-up reads in.
//
// Used by:
//   - CurrentRing (below)
// -----------------------------------------------------------

function leanAngleDeg(raw: { x: number; y: number }, cx: number, cy: number): number {
  return (Math.atan2(raw.x - cx, cy - raw.y) * 180) / Math.PI;
}







// -----------------------------------------------------------
// TargetDot
// -----------------------------------------------------------
//
// One pending or done target in view, centred on its projected
// point. A leaf on purpose: the HUD re-renders per pose sample
// and a dot is the cheapest thing that can mark a direction.
//
// Used by:
//   - CaptureHud (below)
// -----------------------------------------------------------

function TargetDot({ id, x, y, done }: { id: string; x: number; y: number; done: boolean }) {

  const { colors } = useKitTheme();


  return (
    <View
      testID={`wayfinduikit-hud-target-${id}`}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - DOT_SIZE / 2,
        top: y - DOT_SIZE / 2,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: done ? colors.success : colors.stageInk,
        opacity: done ? DONE_OPACITY : 0.9,
      }}
    />
  );
}







// -----------------------------------------------------------
// CurrentRing
// -----------------------------------------------------------
//
// The target being aimed at. Anchored on its projected point
// while in view; pinned at the edge with the lean arrow once
// off it, so the admin always knows which way to turn. The
// fill is the session's verdict verbatim: success-coloured
// only when aligned AND stable — the moment shoot fires — and
// the border alone turns success while aligned but still
// settling, so the admin learns to hold still rather than
// hunt.
//
// Used by:
//   - CaptureHud (below)
// -----------------------------------------------------------

function CurrentRing({
  x,
  y,
  offView,
  leanDeg,
  aligned,
  stable,
}: {
  x: number;
  y: number;
  offView: boolean;
  leanDeg: number;
  aligned: boolean;
  stable: boolean;
}) {

  const { colors } = useKitTheme();
  const ready = aligned && stable;


  return (
    <View
      testID="wayfinduikit-hud-ring"
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - RING_SIZE / 2,
        top: y - RING_SIZE / 2,
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: ready || aligned ? colors.success : colors.stageInk,
        backgroundColor: ready ? colors.success : 'transparent',
      }}
    >
      {offView ? (
        <View testID="wayfinduikit-hud-ring-arrow" style={{ transform: [{ rotate: `${leanDeg}deg` }] }}>
          <Ionicons name="chevron-up" size={26} color={colors.stageInk} />
        </View>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// CaptureHud (default export)
// -----------------------------------------------------------
//
//   <CaptureHud targets={session.targets} currentId={session.currentId}
//               pose={pose} fovDeg={frameHfovDeg}
//               aligned={session.aligned} stable={session.stable}
//               shotsDone={session.accepted} shotsTotal={session.targets.length}
//               width={preview.width} height={preview.height} />
//
// The pose IS the camera: the projection sees the world from
// the phone's own yaw and pitch at the frame's fov, so a dot
// sits over the very direction the photo of it will face. The
// roll never enters the projection — the session refuses
// rolled shots instead, and the HUD only warns.
//
// Used by:
//   - the host app, through the root export
// -----------------------------------------------------------

export default function CaptureHud({
  targets,
  currentId,
  pose,
  fovDeg,
  aligned,
  stable,
  shotsDone,
  shotsTotal,
  width,
  height,
}: CaptureHudProps) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  const camera = { yaw: finite(pose.yawDeg), pitch: finite(pose.pitchDeg), fovDeg, width: Math.max(1, width), height: Math.max(1, height) };
  const cx = camera.width / 2;
  const cy = camera.height / 2;
  const roll = finite(pose.rollDeg);


  // The dots: every target but the current one, hidden once
  // behind the camera or past the viewport by more than half a
  // dot — off-view coverage is the ring's job, not theirs
  const dots = targets.flatMap((target) => {
    if (target.id === currentId) return [];
    const point = projectToScreen({ yaw: target.yawDeg, pitch: target.pitchDeg }, camera);
    const half = DOT_SIZE / 2;
    if (!point.visible || point.x < -half || point.x > camera.width + half || point.y < -half || point.y > camera.height + half) return [];
    return [{ target, x: point.x, y: point.y }];
  });


  // The ring: clamped rather than hidden, flagged off-view when
  // behind the camera or pulled in from past an edge
  const current = currentId != null ? targets.find((target) => target.id === currentId) : undefined;
  const ring = current
    ? (() => {
        const raw = projectToScreen({ yaw: current.yawDeg, pitch: current.pitchDeg }, camera);
        const pinned = clampToEdge(raw, { width: camera.width, height: camera.height }, RING_SIZE / 2 + RING_EDGE_INSET);
        return { x: pinned.x, y: pinned.y, offView: !raw.visible || pinned.clamped, leanDeg: leanAngleDeg(raw, cx, cy) };
      })()
    : null;


  return (
    <View
      testID="wayfinduikit-hud"
      pointerEvents="none"
      accessible
      accessibilityLabel={labels.hudA11y(shotsDone, shotsTotal)}
      style={{ width: camera.width, height: camera.height, overflow: 'hidden' }}
    >

      {dots.map(({ target, x, y }) => (
        <TargetDot key={target.id} id={target.id} x={x} y={y} done={target.done} />
      ))}

      {ring ? <CurrentRing x={ring.x} y={ring.y} offView={ring.offView} leanDeg={ring.leanDeg} aligned={aligned} stable={stable} /> : null}

      <View
        testID="wayfinduikit-hud-reticle"
        style={{
          position: 'absolute',
          left: cx - RETICLE_SIZE / 2,
          top: cy - RETICLE_SIZE / 2,
          width: RETICLE_SIZE,
          height: RETICLE_SIZE,
          borderRadius: RETICLE_SIZE / 2,
          borderWidth: 1.5,
          borderColor: colors.stageInk,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.stageInk }} />
      </View>

      {Math.abs(roll) > ROLL_HINT_DEG ? (
        <View testID="wayfinduikit-hud-roll" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.overlay }}>
            <Ionicons name="warning" size={14} color={colors.danger} />
            <Text style={{ marginLeft: 6, fontSize: 12, fontFamily: fonts.medium, color: colors.overlayInk }}>{labels.hudRollHint}</Text>
          </View>
        </View>
      ) : null}

      <View testID="wayfinduikit-hud-progress" style={{ position: 'absolute', bottom: 16, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.overlay }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.overlayInk }}>{labels.hudProgress(shotsDone, shotsTotal)}</Text>
        </View>
      </View>

    </View>
  );
}
