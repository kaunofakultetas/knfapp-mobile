# wayfindcapture

Headless guided 360° capture for React Native / Expo: a gyro-only pose
tracker that calibrates itself against stillness, a spherical target
planner, an auto-shutter session that decides WHEN to shoot WHAT and
never double-fires, a React hook that turns one session into render
state, and a metadata reader that tells a full sphere from a partial
one, a sweep strip or a plain photo by the bytes alone. The package
owns no camera, no sensors and no upload: the host subscribes to its
own sensor package and feeds samples in, takes the photo when the
session says shoot, and ships the frames through whatever queue it
likes (`@knf/wayfindsync`'s upload queue in this repo); the HUD that
draws the targets is someone else's too (`@knf/wayfinduikit`'s
`CaptureHud`, or anything that reads the session's snapshot).

```tsx
import { createCaptureSession, createPoseTracker, planTargets, useCaptureSession } from '@knf/wayfindcapture';

const tracker = createPoseTracker();               // feed it gyro + accel; it answers the pose
const targets = planTargets({ mode: 'full' });     // 44 directions on the sphere
const session = createCaptureSession({ targets }); // the aim / shoot-once state machine

session.subscribe((event) => {
  if (event?.type === 'shoot') takePhoto().then(
    (ok) => (ok ? session.accept(event.targetId, lastPose) : session.fail(event.targetId)),
  );
});
session.begin();
// per sensor sample:
const pose = tracker.push({ gyro, accel, dtMs });
session.feed(pose, gyro);

function Hud() {
  const state = useCaptureSession(session);        // phase, targets with done flags, currentId, aim, shots
  return <CaptureHud targets={state.targets} currentId={state.currentId} … />;
}
```

## The capture frame

Everything in the package speaks ONE pose convention: `yawDeg` in
[0, 360) growing clockwise as seen from above, `pitchDeg` in [-90, 90]
positive up, `rollDeg` in (-180, 180] positive when the device is
tilted clockwise from upright portrait as the user sees it. The
quaternion helpers in `core/quat.ts` define the frames behind it — the
standard right-handed mobile device frame (x right, y up the screen, z
out of the screen, the back camera looking along -z) and a world frame
whose y is up — and `poseFromQuat` reads the convention out of any
orientation, degrading to a defined yaw and roll at the ±90° pitch
poles instead of NaN.

There is no magnetometer anywhere, on purpose: indoors a compass is
noise near every doorframe and radiator. So **yaw zero is wherever the
tracker's calibration ended** — an arbitrary direction that only means
"where the phone pointed when it went still". That is fine, because
the stitched panorama's CENTRE COLUMN is the first accepted frame's
yaw, measured in the same arbitrary frame — the manifest's
`firstYawDeg` rides on the capture's finish call so the stitcher can
centre on it even when upload retries reorder the arrivals; the photo
is internally consistent, it just does not know which plan direction
it faces. The
admin supplies that afterwards with the alignment tool (turn the photo
until a known neighbour sits under the crosshair, confirm), which
writes the node's `panoYaw` with `panoHeading.source: 'aligned'` —
a measured facing, not a guessed one.

## The tracker

`createPoseTracker()` answers a `PoseTracker` — `push(sample)` takes
`{ gyro, accel, dtMs }` (gyro in rad/s and accel in the device frame;
the accelerometer at rest is taken to point along world up, so only
consistent units matter) and answers the pose; `state()` and
`biasDps()` feed a HUD.

The life of a tracker is two states:

- **`'settling'`** — the calibration. The tracker waits for stillness
  (every raw gyro component under 0.02 rad/s) held for 1500 ms; one
  loud sample restarts the wait. While settling the pose is all zeros
  and `biasDps()` reports the running still-window mean, so a HUD's
  "hold still" number moves. When the window completes, the gyro bias
  freezes as the mean over it, the pose zeroes to identity — this is
  the moment yaw zero is minted — and the state flips to `'tracking'`.
- **`'tracking'`** — integration. Each sample right-multiplies the
  de-biased body rates onto the orientation as one axis-angle step.
  Two corrections keep it honest without touching yaw: during any
  later stillness held 350 ms the bias refines 2% per sample toward
  that stretch's observed mean (a warming gyro never walks away), and
  the low-passed accel vector pulls the orientation's gravity estimate
  2% per sample toward the measured direction — the correction axis is
  perpendicular to both, so pitch and roll stop drifting while yaw
  stays gyro-true and drifts only as fast as the residual bias.

## The target plan

`planTargets({ mode })` is the fixed set of directions a guided
capture walks, in tracker yaw (relative, like everything else before
alignment):

| mode | rows | targets |
| --- | --- | --- |
| `'full'` | pitch 0, +40, -40 with 12 targets each at 30° yaw steps from 0, plus 4 at +70 and 4 at -70 at 45° steps from 0 | 44 |
| `'walls'` | just the three 12-target rows | 36 |

Ids are `r<pitch>-<n>` (`r0-0`, `r40-3`, `r-70-2`) and the returned
order is row 0 first (yaw ascending), then +40, then -40, then +70,
then -70. The server's expected count and the stitcher are built
against exactly these lists — changing a row is a contract change, not
a tweak. `angularDistanceDeg(a, b)` is the great-circle angle between
two yaw/pitch directions — the sphere metric the session steers by,
because near the poles a large yaw difference is a small turn.

## The session

`createCaptureSession({ targets, … })` is the auto-shutter state
machine. The host feeds it every sensor frame
(`feed(pose, gyroRates)`); the session decides:

- **The current target** is the nearest not-yet-accepted one by
  great-circle distance (ties keep the plan's own order).
- **`aligned`** — angular distance to it within 6° AND |roll| within
  8° (both configurable: `alignToleranceDeg`, `rollToleranceDeg`).
- **`stable`** — every fed gyro component stayed under 0.05 rad/s for
  the last 300 ms (`stillRateRad`, `settleMs`); a loud sample restarts
  the clock. Stability is measured over the FED history on the
  session's injectable clock, so tests drive it deterministically.
- **Shoot once per attempt.** When the phase is `'capturing'` and the
  aim is aligned AND stable, the session emits
  `{ type: 'shoot', targetId }` exactly once and latches: while the
  attempt waits for its answer no second shoot can fire, whatever the
  aim jitters through. The host takes the photo and answers
  `accept(targetId, pose)` — the pose the shutter actually fired at —
  or `fail(targetId)`. A fail re-arms shooting only 500 ms later (the
  camera pipeline and the user's hand both need the beat); an accept
  records the shot and emits `accepted`, and the last accept flips the
  phase to `'done'` and emits `done`. `retake(targetId)` un-accepts a
  target and reopens a done capture.

`finish()` answers the upload manifest: the target list as handed in,
the accepted frames in accept order (each `{ targetId, pose, at }`),
and `firstYawDeg` — the first accepted frame's yaw, the column the
stitcher puts at the panorama's centre (the host forwards it as the
finish call's `centreYawDeg`). `snapshot()` is the whole
state as one identity-stable object (phase, targets with `done`
flags, `currentId`, the last aim, the shots, the counts), and
`subscribe(listener)` delivers the events and also fires on every
other state change — which is exactly what makes the session an
external store React can subscribe to.

`useCaptureSession(session)` is that subscription: the component
re-renders on every session change (every fed sensor frame included —
a live HUD wants that), the snapshot's fields map straight onto
`CaptureHud`'s props, and a `null` session (not built yet, camera
permission pending) renders the inert empty snapshot.

## The metadata reader

`parsePanoMetadata(bytes)` answers what an imported photo says about
itself, read straight from its bytes — no decoder, no dependency:
`{ width, height, projectionEquirect, headingDeg, geometry, kind }`.
Dimensions come from the JPEG SOF header; the spherical-photo
vocabulary (ProjectionType, PoseHeadingDegrees, the full/cropped pixel
rectangle) from the standard XMP APP1 packet, read in both the
attribute and the element syntax under whatever prefix the packet's
xmlns declaration binds to the panorama namespace (the customary
GPano is assumed when none is declared). The kind ladder:

| kind | when | geometry |
| --- | --- | --- |
| `'sphere'` | equirect ProjectionType with no genuine crop (a crop as big as the canvas counts as none), or no ProjectionType and the aspect within 2% of 2:1 | the whole ball: hfov 360, vfov 180, centre 0/0 |
| `'partial'` | equirect ProjectionType with a crop strictly smaller than the full canvas | from the crop: hfov = cropW/fullW·360, vfov = cropH/fullH·180, centreYaw = (cropLeft + cropW/2)/fullW·360 − 180, vOffset = 90 − (cropTop + cropH/2)/fullH·180 |
| `'sweep'` | no ProjectionType and aspect ≥ 2.5 | a full turn: hfov 360, vfov 360·h/w (the aspect floor keeps it under 180) |
| `'photo'` | everything else — an explicit non-equirect ProjectionType included: the file said what it is | null |

`headingDeg` is PoseHeadingDegrees when present, the import flow's
seed for `panoHeading`. Nothing throws: truncated bytes, a foreign
container (PNG / WebP — dimensions best-effort), random bytes — every
input answers a complete result, worst case `{ 0, 0, photo }`, so an
import flow shows "not a panorama" instead of crashing.

## Pairing: the capture screen and the stitch job

The package meets the rest of the stack in the host's admin capture
screen (`app/(main)/map-editor/capture.tsx` in this repo), which owns
everything the package refuses to: the camera preview and its
permission, the sensor subscriptions (an adapter maps each platform's
accelerometer sign into the tracker's frame — the tracker wants the
support force, up when the device lies face-up), and the network. The
screen builds the plan with `planTargets`, opens a capture on the
server with the same target list (`POST
/api/wayfind/buildings/<id>/captures`, mode and `frameHfovDeg`
included), then runs the loop above: tracker pose into `session.feed`,
`shoot` into the camera, every accepted photo enqueued as an
`UploadItem` of kind `'frame'` on `@knf/wayfindsync`'s persisted queue
— the fields carry `captureId`, `targetId` and the shutter pose — so
frames survive a dropped connection and retry on the same ladder as
every other upload. `CaptureHud` draws the session's snapshot over the
preview; the HUD never decides anything, it renders the session's own
`aligned` / `stable` verdicts, so the overlay cannot disagree with the
thing that fires the shutter.

Once every frame has drained, the screen calls the server's finish —
carrying the manifest's `firstYawDeg` — and polls the capture. The stitch job runs on a background thread inside
the Flask process — single worker, one capture at a time — trusting
each frame's uploaded pose as-is (orientation-only: no feature
matching), composing the frames into a 2048×1024 equirectangular
canvas with feathered overlaps, rotating the columns so the finish
call's `centreYawDeg` — the FIRST accepted frame's yaw — sits on the
centre column (without it the server falls back to the earliest
uploaded frame), and storing the result
through the same content-hash store a directly uploaded panorama uses,
as a `wf_panoramas` row with `heading_source 'auto'`. The capture's
report carries the frames used, the measured coverage and the centre
yaw; the admin then opens the alignment tool and turns `'auto'` into
`'aligned'`. The import flow is the other door into the same place:
`parsePanoMetadata` classifies a picked file, prefills the geometry
for a partial or a sweep, and seeds the heading when the file carries
one.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `quat.ts` (the frames and the quaternion algebra, `poseFromQuat`), `pose.ts` (`createPoseTracker` — settling, bias, gravity), `plan.ts` (`planTargets`, `angularDistanceDeg`), `session.ts` (`createCaptureSession` — aim, shoot-once, accept/fail/retake, the manifest), `metadata.ts` (`parsePanoMetadata`) |
| `hooks/` | `useCaptureSession` — one session as an external store |

`index.ts` is the public surface, pinned by
`src/__tests__/surface.test.ts`.

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` with the
jest-expo preset and this package's own `babel.config.js` — no host,
no camera, no sensors: samples are synthesised. Specs sit beside what
they pin; `__tests__` does not ship (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact runtime export list, the
  44-target plan and a shoot straight off the barrel, the pose
  convention round-tripping through the quaternion helpers.
- `src/core/__tests__/quat.test.ts` — the compass yaws, pitch and roll
  signs, compositions without cross-talk, the gimbal edges, the
  algebra's order and degenerate inputs.
- `src/core/__tests__/pose.test.ts` — the 1500 ms calibration and its
  restart on a loud sample, the zero pose while settling, a 90° turn
  at 100 Hz within 1°, dt jitter, a frozen bias holding yaw over 30 s,
  the gravity correction righting pitch while yaw stays put.
- `src/core/__tests__/plan.test.ts` — both modes' counts, ids and
  order, and the sphere metric (wrap, poles, symmetry, the 180 cap).
- `src/core/__tests__/session.test.ts` — the shoot-once latch under
  jitter, the 300 ms clock and its restart, the 500 ms re-arm after a
  fail, roll blocking alignment, nearest-target selection, the signed
  aim arcs, accept / double-accept / retake / done, the manifest, and
  a full 36-target walkthrough in plan order.
- `src/hooks/__tests__/useCaptureSession.test.ts` — the inert null
  snapshot, re-renders per session move, snapshot identity between
  moves, retake reopening a done capture, a swapped session re-read.

## What the host supplies

- **Sensors** — a gyroscope in rad/s and an accelerometer whose vector
  points along world up at rest, both in the standard device frame,
  pushed into the tracker with each sample's `dtMs`; the package
  subscribes to nothing.
- **The camera** — the preview under the HUD and the actual photo
  taking; the session only says when and which target.
- **The answer to every shoot** — `accept(targetId, pose)` with the
  pose at the shutter, or `fail(targetId)`; the session stays latched
  until one arrives.
- **The upload** — the manifest's frames to the server, in this repo
  through `@knf/wayfindsync`'s queue as kind `'frame'` items.
- **The HUD** — anything that draws the snapshot;
  `@knf/wayfinduikit`'s `CaptureHud` maps onto it field for field.

## Behaviours worth knowing

- Yaw is relative until alignment: the tracker mints yaw zero when its
  calibration ends, the plan and every pose live in that frame, and
  the stitched panorama's centre column is the first ACCEPTED frame's
  yaw (`finish()`'s `firstYawDeg`, handed to the server on the finish
  call) — the admin's alignment turns the relative photo into a plan
  facing (`panoHeading.source 'aligned'`).
- The pose answered while settling is all zeros; gate the capture UI
  on `tracker.state()` and tell the user to hold still.
- Stillness has two thresholds on purpose: the tracker judges raw
  rates against 0.02 rad/s (the bias is unknown while calibrating),
  the session judges the fed rates against 0.05 rad/s — a shutter
  needs less quiet than a calibration.
- One shoot per attempt, latched: threshold jitter between feeds
  cannot double-fire, and nothing fires until the host has answered
  the previous shoot — a fail waits a further 500 ms.
- `feed` wakes subscribers on every call, so a HUD tracks the pose
  live; the snapshot object is identity-stable between changes, so
  effects and memos can depend on it as-is.
- `accept` of an unknown target id or an already-accepted one changes
  nothing; `retake` of an unaccepted one likewise. The `done` phase
  reopens on retake and fires `done` again on the re-accept.
- `finish()` on an empty capture answers `firstYawDeg: 0` — a harmless
  stand-in; the server refuses under-filled captures anyway (fewer
  than 8 frames).
- The metadata reader's dimension heuristics run only when the file
  carries no ProjectionType at all; an explicit non-equirect one makes
  a `'photo'` — the file said what it is. The pano fields are read
  under the prefix the packet binds to the panorama namespace (GPano
  when none is declared). Only the standard XMP packet is read;
  extended-XMP continuations never carry the pano fields and are
  skipped.
- `angularDistanceDeg`, not a flat yaw/pitch delta, decides the
  nearest target — near the poles a large yaw difference is a small
  turn, so the cap rows behave.
