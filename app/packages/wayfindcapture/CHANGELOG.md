# Changelog

## 1.0.1 — 2026-09-01

- **`parsePanoMetadata` follows the packet's own namespace prefix**
  (`core/metadata.ts`) — the pano fields are read under whatever
  prefix the XMP binds to the panorama namespace (the xmlns
  declaration whose URI ends in `/panorama/`), falling back to the
  customary GPano when none is declared; a packet bound to `ns1`
  (or anything else) no longer loses every field. The element-form
  match requires the close tag to repeat the same prefix.
- Comment corrections in `core/metadata.ts` and its spec: the
  extended-XMP continuation header carries the `/xmp/extension/`
  URI, diverging from the standard `/xap/1.0/` header at the xap
  token (not "after /xmp/"); the dimension heuristics fire when the
  XMP carries no ProjectionType (not only with "no XMP at all"); the
  GPano rectangle is six fields, not eight.
- Section separators trimmed to the house seven blank lines in
  `core/quat.ts` and `core/metadata.ts`.

## 1.0.0 — 2026-09-01

First cut: the headless half of guided panorama capture, built to the
phase 2 capture contract.

- **Frames and algebra** (`core/quat.ts`) — the one place the capture
  stack's frames are defined: the standard right-handed mobile device
  frame, a world frame with y up, and the pose convention (`yawDeg`
  [0, 360) clockwise from above, `pitchDeg` [-90, 90] positive up,
  `rollDeg` (-180, 180] positive tilted clockwise from upright
  portrait). `identity`, `fromAxisAngle`, `multiply`, `normalize`,
  `rotateVector` and `poseFromQuat` on the barrel; the gimbal edges
  answer a defined yaw and roll, never NaN.
- **`createPoseTracker`** (`core/pose.ts`) — gyro-only yaw (no
  magnetometer; yaw zero is wherever calibration ends, arbitrary until
  the admin aligns the stitched panorama), gravity-pinned pitch and
  roll. Settling: 1500 ms of stillness (every raw rate under
  0.02 rad/s) freezes the bias and zeroes the pose; tracking: de-biased
  body rates right-multiplied per sample, the bias refined 2% per
  sample during any stillness held 350 ms, the low-passed accel pulling
  pitch/roll 2% per sample along an axis perpendicular to gravity so
  yaw stays gyro-true. `state()` and `biasDps()` for a HUD.
- **`planTargets` / `angularDistanceDeg`** (`core/plan.ts`) — the
  contract plan: `'full'` is rows at pitch 0/+40/-40 with 12 targets at
  30° steps plus 4 at +70 and 4 at -70 at 45° steps (44); `'walls'` is
  the three rows (36). Ids `r<pitch>-<n>`; order row 0, +40, -40, +70,
  -70, yaw ascending within each. The sphere metric is the great-circle
  angle, clamped against float error.
- **`createCaptureSession`** (`core/session.ts`) — the auto-shutter
  state machine: the current target is the nearest unaccepted by
  great-circle distance; `aligned` is within 6° with |roll| ≤ 8°;
  `stable` is every fed gyro rate under 0.05 rad/s for 300 ms; aligned
  AND stable emits ONE `shoot` per attempt, latched until the host
  answers `accept(targetId, pose)` or `fail(targetId)` (a fail re-arms
  after 500 ms). `retake` un-accepts and reopens a done capture;
  `finish()` answers the manifest (targets, frames in accept order,
  `firstYawDeg` — the stitched panorama's centre column). All
  tolerances and the clock are injectable; `snapshot()` is
  identity-stable between changes and `subscribe` fires on every one.
- **`useCaptureSession`** (`hooks/`) — the session as an external
  store: re-renders per session move (every fed frame included), the
  inert empty snapshot for a null session, a swapped session re-read.
- **`parsePanoMetadata`** (`core/metadata.ts`) — dimensions from the
  JPEG SOF header, the spherical-photo vocabulary from the standard
  XMP APP1 packet (attribute and element syntax), and the kind ladder:
  `'sphere'` (equirect without a genuine crop, or no ProjectionType at
  2:1 within 2%), `'partial'` (equirect with a crop, geometry from the
  crop rectangle), `'sweep'` (no ProjectionType, aspect ≥ 2.5, a full
  turn with the aspect's vertical band), `'photo'` (everything else,
  geometry null). PNG / WebP dimensions best-effort; nothing throws.
- Specs live inside the package (`src/**/__tests__/`) with their own
  `npm test` (jest-expo + the package's babel config); `__tests__` is
  excluded from `files`.
