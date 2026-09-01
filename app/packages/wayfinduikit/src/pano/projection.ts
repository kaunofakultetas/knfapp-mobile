// -----------------------------------------------------------
//  [*] wayfinduikit — projection
//
//  The angle-and-pixel math both panorama stages share, pure
//  and frame-agnostic. Yaw is degrees around the vertical
//  axis, growing to the right; pitch is degrees above the
//  horizon. Screen space is the usual one — x grows right, y
//  grows DOWN — so a point above the horizon lands at a
//  smaller y than the centre. The pinhole knows no photo at
//  all; the flat strip's yaw is anchored on the photo's CENTRE
//  column (yaw 0), its two edges being the half-turn — the
//  frame the routing engine authors its panorama yaws in, so a
//  target passes through to either stage unchanged.
//
//  Two placements live here. The sphere stage sees the world
//  through a pinhole camera: projectToScreen turns a direction
//  into a unit vector in the camera's frame, drops it when it
//  sits behind the image plane, and otherwise divides by depth
//  with the focal length that makes the horizontal fov fill
//  the viewport width. The flat stage is a strip of tiles that
//  scrolls sideways: the yaw at the view centre is how far the
//  centre sits from the middle column of its tile, mapped to a
//  full turn, and a target's marker sits the shortest arc away
//  from that centre at the strip's own degrees-per-pixel.
//
//  A point exactly edge-on (depth zero) is "behind" too — the
//  perspective divide would send it to infinity, and floating
//  point puts cos(90°) a hair either side of zero — so a small
//  epsilon draws the line. Behind points still answer an x / y
//  pushed OUTSIDE the viewport along their screen-plane
//  direction, so a caller clamping to the edges sees the
//  marker lean the short way round, never snapping to the
//  centre; a point exactly behind has no side of its own and
//  takes the left, the side shortestArcDeg gives a half-turn.
//
//  Used by:
//    - pano/FlatPanorama.tsx — flatViewYaw / flatMarkerX place
//      the marker and the hotspots over the strip; clampToEdge
//      keeps the marker reachable
//    - pano/PanoramaStage.tsx — projectToScreen + clampToEdge
//      place the marker over the sphere
//    - the host app, through the root export
// -----------------------------------------------------------

import type { KitPanoGeometry } from '../core/types';


const DEG = Math.PI / 180;

// Depth at or under this counts as behind the camera — see
// the banner for why exactly zero is not enough
const BEHIND_DEPTH = 1e-6;

// A screen-plane direction shorter than this is "straight
// behind" and has no side to lean towards
const NO_DIRECTION = 1e-9;







// -----------------------------------------------------------
// shortestArcDeg
// -----------------------------------------------------------
//
// The signed rotation that takes `from` to `to` the short way
// round, in [-180, 180): positive turns right. Inputs may sit
// on any turn (405° reads as 45°) or be negative. A half-turn
// answers -180 on either side, so a target exactly behind
// leans left consistently rather than flipping with rounding.
//
// Used by:
//   - projectToScreen / flatMarkerX (below)
//   - pano/FlatPanorama.tsx — the yaw report threshold
//   - the host app, through the root export
// -----------------------------------------------------------

export function shortestArcDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}







// -----------------------------------------------------------
// projectToScreen
// -----------------------------------------------------------
//
// The pinhole projection. The point's direction is built in
// the frame already turned to the camera's yaw (x right, y up,
// z forward), then the camera's own tilt is undone by rotating
// about the x axis; z of the result IS the depth. The focal
// length is chosen so ±fov/2 lands exactly on the viewport's
// side edges — at fov 90 a point 45° right sits on the right
// edge, and 90° right is edge-on (not visible). The vertical
// fov follows from the aspect; no separate parameter.
//
// `visible` answers only "in front of the camera" — a point
// in front but outside the viewport keeps visible: true with
// coordinates past the edges, and clampToEdge's `clamped`
// flag says whether it had to be pulled in.
//
// Used by:
//   - pano/PanoramaStage.tsx — the marker over the sphere
//   - the host app, through the root export
// -----------------------------------------------------------

export function projectToScreen(
  point: { yaw: number; pitch?: number },
  camera: { yaw: number; pitch: number; fovDeg: number; width: number; height: number },
): { x: number; y: number; visible: boolean } {

  const yaw = shortestArcDeg(camera.yaw, point.yaw) * DEG;
  const pitch = (point.pitch ?? 0) * DEG;
  const tilt = camera.pitch * DEG;


  // Unit direction in the yaw-aligned frame
  const flat = Math.cos(pitch);
  const x = Math.sin(yaw) * flat;
  const up = Math.sin(pitch);
  const forward = Math.cos(yaw) * flat;

  // Undo the camera tilt: a rotation about the x axis, so x
  // survives untouched and the depth is what remains forward
  const y = up * Math.cos(tilt) - forward * Math.sin(tilt);
  const depth = up * Math.sin(tilt) + forward * Math.cos(tilt);


  const cx = camera.width / 2;
  const cy = camera.height / 2;

  if (depth <= BEHIND_DEPTH) {
    // Off the viewport by more than its own size in the
    // screen-plane direction; straight behind picks the LEFT,
    // the side a half-turn leans in shortestArcDeg — the flat
    // stage pins the same target at its left inset, and the
    // marker's chevron and label already say left
    const reach = camera.width + camera.height;
    const length = Math.hypot(x, y);
    if (length < NO_DIRECTION) return { x: cx - reach, y: cy, visible: false };
    return { x: cx + (x / length) * reach, y: cy - (y / length) * reach, visible: false };
  }


  // A fov outside (0, 180) has no pinhole; it is pulled to the
  // nearest sane value instead of producing a NaN focal length
  const halfFov = Math.min(179, Math.max(1, camera.fovDeg)) / 2;
  const focal = cx / Math.tan(halfFov * DEG);
  return { x: cx + (focal * x) / depth, y: cy - (focal * y) / depth, visible: true };
}







// -----------------------------------------------------------
// clampToEdge
// -----------------------------------------------------------
//
// Pulls a point inside the bounds, keeping `margin` from every
// edge — half the marker's footprint plus whatever breathing
// room the stage wants. `clamped` says whether it moved, which
// is the marker's cue that it is pinned at an edge rather than
// anchored on its target.
//
// Used by:
//   - pano/FlatPanorama.tsx — the route marker
//   - pano/PanoramaStage.tsx — the route marker
//   - the host app, through the root export
// -----------------------------------------------------------

export function clampToEdge(
  p: { x: number; y: number },
  bounds: { width: number; height: number },
  margin: number,
): { x: number; y: number; clamped: boolean } {

  const x = Math.min(Math.max(p.x, margin), bounds.width - margin);
  const y = Math.min(Math.max(p.y, margin), bounds.height - margin);


  return { x, y, clamped: x !== p.x || y !== p.y };
}







// -----------------------------------------------------------
// flatViewYaw
// -----------------------------------------------------------
//
// The yaw sitting at the view centre of the flat strip: how
// far into one tile the centre is, folded by the tile width
// (offsets may run negative or several tiles deep — the strip
// teleports by whole tiles, which this survives by design),
// mapped onto [0, 360) with the tile's MIDDLE column at 0 —
// the frame the photo is authored in, where a tile's left
// edge is 180 and the seam between two tiles is the half-turn.
// A tile with no width has no angle and reads as 0 rather
// than NaN.
//
// Used by:
//   - flatMarkerX (below)
//   - pano/FlatPanorama.tsx — the yaw reported to the host
// -----------------------------------------------------------

export function flatViewYaw(scrollOffset: number, tileWidth: number, windowWidth: number, hfovDeg = 360, centreYawDeg = 0): number {

  if (!(tileWidth > 0)) return 0;


  // A full turn loops through the tiles; a partial photo is one
  // tile whose columns run from centre − hfov/2 to centre + hfov/2
  const centre = scrollOffset + windowWidth / 2;
  const within = hfovDeg >= 360 ? ((centre % tileWidth) + tileWidth) % tileWidth : Math.min(tileWidth, Math.max(0, centre));
  return foldYaw(centreYawDeg + (within / tileWidth - 0.5) * hfovDeg);
}







// -----------------------------------------------------------
// flatMarkerX
// -----------------------------------------------------------
//
// Where a target yaw sits on the flat stage: the shortest arc
// from the view centre's yaw, converted at the strip's own
// scale (one tile is one turn) and laid off the view's middle.
// A target more than half a view away lands past the edges —
// the stage clamps the route marker and hides hotspots.
//
// Used by:
//   - pano/FlatPanorama.tsx — the marker and every hotspot
//   - the host app, through the root export
// -----------------------------------------------------------

export function flatMarkerX(
  scrollOffset: number,
  tileWidth: number,
  windowWidth: number,
  targetYaw: number,
  hfovDeg = 360,
  centreYawDeg = 0,
): { x: number; deltaDeg: number } {

  const deltaDeg = shortestArcDeg(flatViewYaw(scrollOffset, tileWidth, windowWidth, hfovDeg, centreYawDeg), targetYaw);


  // The strip's own degrees per pixel: the photo's coverage over
  // its tile width
  return { x: windowWidth / 2 + (deltaDeg / Math.max(1, hfovDeg)) * Math.max(0, tileWidth), deltaDeg };
}







// -----------------------------------------------------------
// resolvePanoGeometry / viewLimits / limitYaw / limitPitch
// -----------------------------------------------------------
//
// What a photo covers, and how far a view may turn inside it.
// An author's geometry wins; without one the photo's aspect
// decides: 2:1 is the whole sphere, a phone sweep a full turn
// with a vertical band of 360 · height / width degrees, and an
// unmeasured photo is taken as whole. The limits keep the view
// inside the picture: a partial turn may not swing past the
// photo's ends by more than the view's own half-width shows,
// so the edge of the photo reaches the edge of the stage and
// no further; a coverage narrower than the view locks the view
// on the photo's centre. A whole sphere keeps the old freedom
// (any yaw, pitch to ±maxPitchDeg).
//
// Used by:
//   - pano/FlatPanorama.tsx — the strip's shape and the hotspot rows
//   - pano/PanoramaStage.tsx — the band mesh and the drag / sensor clamps
//   - the host app, through the root export
// -----------------------------------------------------------

export interface ResolvedPanoGeometry {
  hfovDeg: number;
  vfovDeg: number;
  centreYawDeg: number;
  vOffsetDeg: number;
}

export interface ViewLimits {
  centreYawDeg: number;
  // null: a full turn, no yaw limit
  yawHalfSpanDeg: number | null;
  pitchMinDeg: number;
  pitchMaxDeg: number;
}

const foldYaw = (yaw: number): number => ((yaw % 360) + 360) % 360;

const finiteOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function resolvePanoGeometry(geometry: KitPanoGeometry | null | undefined, aspect?: number | null): ResolvedPanoGeometry {

  if (geometry) {
    return {
      hfovDeg: Math.min(360, Math.max(1, finiteOr(geometry.hfovDeg, 360))),
      vfovDeg: Math.min(180, Math.max(1, finiteOr(geometry.vfovDeg, 180))),
      centreYawDeg: foldYaw(finiteOr(geometry.centreYawDeg, 0)),
      vOffsetDeg: Math.max(-90, Math.min(90, finiteOr(geometry.vOffsetDeg, 0))),
    };
  }


  const byAspect = typeof aspect === 'number' && aspect > 0 ? 360 / aspect : 180;
  return { hfovDeg: 360, vfovDeg: Math.min(180, Math.max(1, byAspect)), centreYawDeg: 0, vOffsetDeg: 0 };
}


export function viewLimits(geometry: ResolvedPanoGeometry, viewHfovDeg: number, viewVfovDeg: number, maxPitchDeg = 85): ViewLimits {

  const yawHalfSpanDeg = geometry.hfovDeg >= 360 ? null : Math.max(0, (geometry.hfovDeg - viewHfovDeg) / 2);


  if (geometry.vfovDeg >= 180) return { centreYawDeg: geometry.centreYawDeg, yawHalfSpanDeg, pitchMinDeg: -maxPitchDeg, pitchMaxDeg: maxPitchDeg };
  const half = Math.max(0, (geometry.vfovDeg - viewVfovDeg) / 2);
  const low = Math.max(-maxPitchDeg, geometry.vOffsetDeg - half);
  const high = Math.min(maxPitchDeg, geometry.vOffsetDeg + half);
  return { centreYawDeg: geometry.centreYawDeg, yawHalfSpanDeg, pitchMinDeg: Math.min(low, high), pitchMaxDeg: Math.max(low, high) };
}


export function limitYaw(yaw: number, limits: ViewLimits): number {
  if (limits.yawHalfSpanDeg === null) return foldYaw(yaw);
  const away = shortestArcDeg(limits.centreYawDeg, yaw);
  const held = Math.max(-limits.yawHalfSpanDeg, Math.min(limits.yawHalfSpanDeg, away));
  return foldYaw(limits.centreYawDeg + held);
}


export function limitPitch(pitch: number, limits: ViewLimits): number {
  return Math.max(limits.pitchMinDeg, Math.min(limits.pitchMaxDeg, pitch));
}
