# Changelog

## 1.2.0 — 2026-09-01

`FloorPlan` grows the intents an editing host needs, all in plan pixels
so an editor never learns the screen; nothing a wayfinding screen uses
changes.

- `selectedNodeId` — the node drawn selected: the brand ink, a larger
  disc in a surface ring, testID `wayfinduikit-plan-node-selected`.
- `onPressPlan(point)` — a bare tap on the drawing that no shape took,
  answered in plan pixels **through the camera** (zoomed 2× about the
  centre, a screen point 50 px right of it is 25 plan px right of it).
  A tap is one finger — and never more at any point in the gesture, so
  a pinch shed one finger at a time is not a tap — within the 6 px
  slop, released within 350 ms: a slow press is not a tap, a pan is
  not a tap.
- `onDragNode(id, point)` / `onDragNodeEnd(id, point)` — a one-finger
  drag that begins within the **selected** node's hit radius moves the
  node instead of the camera. The grab zone follows the zoom — the
  disc the overlay draws is the disc a finger can grab, with a
  20-screen-px floor so a tiny node on a zoomed-out plan is still easy
  to catch. `onDragNode` fires on every move; `onDragNodeEnd` fires
  with the last point when the drag ends ANY way — a release, a second
  finger landing, a responder terminate or a level switch — so a
  host's bookkeeping (an open undo step, say) always closes. The
  camera stays where it was. A drag starting on any other node, or on
  bare plan, still pans. Needs both `selectedNodeId` and `onDragNode`.
- `PlanPoint`, `PlanNode` and `PlanRoom` are exported from the barrel
  beside `FloorPlan`, so a host types its shapes without reaching into
  `plan/FloorPlan`.

## 1.1.0 — 2026-09-01

Partial panoramas: both stages now draw what a photo actually covers.

- `geometry` prop (`KitPanoGeometry`: horizontal and vertical coverage in
  degrees, the centre column's yaw, the centre row's pitch) on
  `PanoramaStage` and `FlatPanorama`. Absent, the coverage is read off
  the photo: 2:1 is the whole sphere, a phone sweep at 3.4:1 a full turn
  with a vertical band of ~106°, an unmeasured photo is taken as whole.
- The sphere wraps the photo on the band it covers (the sphere
  constructor's own start / length angles, rotated to the centre yaw)
  and rebuilds the mesh once the loaded photo's aspect says the band
  differs from the assumption; the view is held inside the photo — a
  partial turn may not swing past the photo's ends by more than the
  view's own half-width, a coverage narrower than the view is locked on
  its centre, and the pitch is held inside the band the same way.
- The flat strip draws a partial photo as one tile (padded to the
  stage's width when narrower) that never teleports; the yaw report,
  the marker and the hotspots use the strip's own degrees per pixel.
- Pure helpers on the barrel: `resolvePanoGeometry`, `viewLimits`,
  `limitYaw`, `limitPitch`; `flatViewYaw` / `flatMarkerX` accept the
  coverage and centre yaw as trailing optional arguments.

## 1.0.1 — 2026-09-01

The kit and the engine now agree on the panorama frame, the plan sorts
its points by floor itself, and the docs say what the code does.

- **Panorama frame** — yaw is the photo's own frame on both stages:
  **0 is the photo's centre column, growing to the right, the edges
  ±180** — the frame the engine authors `panoYawToNext` in, so it
  passes through as `targetYaw` unchanged. Both stages used to put yaw
  0 at the photo's left edge (the centre column at 180), so every
  engine-authored target pointed straight away from the corridor; a
  host that authored yaws in the old kit frame adds 180 (mod 360).
  `flatViewYaw` / `flatMarkerX` follow: a scroll offset reads 0 at a
  tile's middle column and 180 at its edges, so a host computing
  offsets by hand adds half a tile. The sphere mesh is turned -90°
  about the vertical (was +90°).
- **`initialYaw` on the flat stage** — `FlatPanorama` gains
  `initialYaw` (default 0, the centre column), seeding where the strip
  faces on mount; later changes are ignored, as on the sphere.
  `PanoramaStage` passes it through, so it now applies under
  `renderer: 'flat'`, on hosts without the GL peers (the web included)
  and on every `'auto'` fallback, and the first yaw report is that
  value. `fovDeg` and `orientation` remain sphere-only.
- **Strip re-lay** — a measured tile aspect or a stage laid out at a
  new width re-lays the strip under the yaw the view already had (no
  jump, no report) instead of re-centring it; the lay-out happens in
  render, so a geometry change no longer leaks one wrong yaw report.
- **Photo identity by key** — a photo is told from the next by
  `panoSourceKey(source)` (the uri string, the asset number, or the
  `uri` inside a `{ uri }` object; module-level export of
  `FlatPanorama.tsx` with its `PanoSourceKey` type), never by object
  identity: `source={{ uri }}` written inline no longer re-seeds the
  strip, drops the measured aspect, restarts the hint, reloads the
  texture or forgets an `'auto'` failure on every host render — only a
  new key does.
- **Straight behind** — a target exactly behind the camera takes the
  left on both stages (`projectToScreen` answers `x = cx - reach`),
  matching `shortestArcDeg`'s -180: pinned at the left inset, chevron
  -60°, "Route 180° to the left".
- **Late GL context** — a context handed over after the stage
  unmounted is released on the spot (renderer, sphere geometry,
  material) and starts no frame loop and no texture load; the same
  release serves the unmount cleanup.
- **Plan points carry their floor** — `PlanPoint` is
  `{ x, y, level? }`: a `start`, `end`, `youAreHere` or `focus` naming
  a level other than the shown one is neither drawn nor glided to (a
  focus on another floor does not zoom), one naming none is on the
  shown floor as before. The shape matches the engine twins' `start` /
  `end` / `position`, so a host hands them over unfiltered; the pure
  `onShownLevel(point, levelId)` is a module-level export of
  `FloorPlan.tsx`.
- **Plan resize and level switch** — the focus glide runs once the
  viewport is first measured and again on a `focus` or level change; a
  later resize only re-clamps the camera where it stands and never
  replays the glide. A new level starts at rest and drops any gesture
  in progress, so a finger still down re-bases from rest on its next
  move instead of restoring the old floor's zoom.
- **Plan accessibility** — the one image element named per level is
  the host's drawing (`wayfinduikit-plan-drawing`, present once the
  viewport is measured), not the viewport (`wayfinduikit-plan`, now
  without a role or label), so the overlay's rooms, nodes, route and
  dot stay reachable to a screen reader; a test or host reading the
  plan's label reads it off the drawing.
- **Theme merge** — `resolveTheme` (and the provider's `theme`) ignores
  an entry whose value is an explicit `undefined` at any depth, so a
  palette built from optional config keeps the base token — the rule
  `labels` and `env` already followed.
- **Instruction margin** — the metres are omitted for a `turn` with
  `direction: 'straight'` as for a `continue`: the formatter words it
  as one, so the sentence already says them.
- **Package** — `expo-image` declared as a required peer dependency
  (the flat stage imports it at module load).
- **Docs** — the pairing mapping hands `toLevelLabel` the engine's
  level label as is (`labels.floor()` wraps a bare numeral only; over
  "2 aukštas" it read "2 aukštas aukštas"), and the route's ends and
  the walker's position to the plan unfiltered; the formatter rounding
  is stated as the caller's (`core/format.ts` for `meters` and
  `continueFor`, the route sheet's own rounder by the same rungs for
  `remaining` and `reassurance`).
- **Example** — the walk table's yaws moved into the photo's frame;
  the screen prices nothing (the ETA and the seconds left are
  authored figures, the walking speed and the claim that the engine
  costs routes the same way are gone) and hands the plan the route's
  ends and the walker's dot unfiltered; its spec pins the marker's
  reading per step and reads the plan's name off the drawing.

## 1.0.0 — 2026-09-01

The presentational indoor-wayfinding kit, standalone behind `WayfindUiKitProvider`.

- **Provider** — one seam for theme (light/dark bases, deep-partial
  override), labels (LT-first catalogs with declining count functions
  and nominative-shaped name keys, partial merge) and the two host
  functions (`resolveImageUrl`, `now`) plus the resolved locale; neutral
  defaults with no provider at all.
- **FloorPlan + FloorSwitcher** — the pinch-zoom plan: the host's
  drawing and the kit's overlay in one transformed layer keyed to the
  level's viewBox, a ref-held camera driven straight from one
  responder (pan, pinch about the fingers, re-basing on a finger count
  change), scale and edge clamps, tap-friendly responder claims, an
  animated `focus`; the overlay with rooms, the glow-and-line route,
  nodes, the start ring, the destination pin and the walker's dot. The
  switcher stacks floors by ordinal, dims and inerts the ones a route
  never visits, and only ever asks.
- **RoutePreview + RouteSheet + InstructionLine + YouAreHereBar** — the
  ETA-first preview card with level chips in walking order, the
  avoid-stairs switch and the folded steps; the one-step walking sheet
  with Back locked at the first step, the host-verdict arrival card and
  the reassurance line; the instruction row with one glyph family and
  the sentence as its spoken name; the you-are-here capsule with scan
  and pick when wired and off route as a second line.
- **PanoramaStage + FlatPanorama + DirectionMarker** — the true-sphere
  stage on optional GL peers (required at render time only) with drag,
  inertia, first-sample-offset gyro and a per-photo fallback to the flat
  strip under `'auto'`; the five-tile flat stage with seam teleports,
  a measured tile aspect and the 3°-step yaw report both stages share;
  the marker leaning up to ±60° towards the route, green inside 12°,
  haloless when pinned.
- **Projection** — `projectToScreen`, `shortestArcDeg`, `clampToEdge`,
  `flatViewYaw`, `flatMarkerX`: the pure maths both stages place their
  chrome with, behind-camera points pushed outside along their
  screen-plane direction.
- **Formatters** — `formatDistance` (sign-style rounding, one-decimal
  kilometres), `formatEta` (phrase under a minute, ceiled minutes),
  `instructionText` (one step, one sentence).
- **Tests** — the formatters and the projection, the provider merge and
  LT/EN parity, the plan through hand-built touch histories, the route
  faces, the flat stage, the sphere stage with stand-in peers, the
  public surface pin, and the example screen proven live; `TZ=UTC`
  pinned.
- **Example** — `example/ExampleWayfindScreen.tsx`: the whole kit on one
  screen over in-file state (two hand-drawn floors, a six-step route
  from 114 to 214, the preview turning into the walking sheet, the plan
  and the flat stage following the walker upstairs to arrival).
