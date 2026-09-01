// -----------------------------------------------------------
//  [*] Tests — wayfinduikit projection
//
//  The projection table, pinned: the shortest arc on both
//  sides of the seam, the pinhole's centre / edge / behind /
//  pitch answers at a 90° fov (straight behind leaning LEFT,
//  the side the half-turn takes), the camera tilt cancelling a
//  raised point, the edge clamp on all four sides, and the
//  flat strip's frame — yaw 0 on a tile's middle column, ±180
//  on its edges — with the marker column including the
//  wrap-around (target 350 with the view at 10 is 20° to the
//  LEFT, never 340° to the right).
// -----------------------------------------------------------

import { clampToEdge, flatMarkerX, flatViewYaw, limitPitch, limitYaw, projectToScreen, resolvePanoGeometry, shortestArcDeg, viewLimits } from '../projection';


// A 400×300 viewport looking dead ahead through a 90° lens —
// the side edges sit at ±45°
const camera = { yaw: 0, pitch: 0, fovDeg: 90, width: 400, height: 300 };
const CX = 200;
const CY = 150;




describe('shortestArcDeg', () => {

  it.each([
    [0, 0, 0],
    [10, 30, 20],
    [30, 10, -20],
    [10, 350, -20],
    [350, 10, 20],
    [720, 45, 45],
    [-90, 90, -180],
    [0, 180, -180],
    [270, 0, 90],
  ])('from %d to %d turns %d', (from, to, want) => {
    expect(shortestArcDeg(from, to)).toBeCloseTo(want, 9);
  });
});




describe('projectToScreen', () => {

  it('lands a point straight ahead at the centre', () => {
    const p = projectToScreen({ yaw: 0 }, camera);

    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(CX, 6);
    expect(p.y).toBeCloseTo(CY, 6);
  });


  it('lands 45° right at fov 90 on the right edge, 45° left on the left edge', () => {
    const right = projectToScreen({ yaw: 45 }, camera);
    const left = projectToScreen({ yaw: -45 }, camera);

    expect(right.visible).toBe(true);
    expect(right.x).toBeCloseTo(400, 6);
    expect(right.y).toBeCloseTo(CY, 6);
    expect(left.visible).toBe(true);
    expect(left.x).toBeCloseTo(0, 6);
  });


  it('treats 90° right as edge-on: not visible, and past the right edge for a clamp', () => {
    const p = projectToScreen({ yaw: 90 }, camera);

    expect(p.visible).toBe(false);
    expect(p.x).toBeGreaterThan(400);
    expect(Number.isFinite(p.x)).toBe(true);
  });


  it('marks a point behind the camera not visible, leaning the short way round', () => {
    const behindRight = projectToScreen({ yaw: 170 }, camera);
    const behindLeft = projectToScreen({ yaw: -170 }, camera);
    const dead = projectToScreen({ yaw: 180 }, camera);

    expect(behindRight.visible).toBe(false);
    expect(behindRight.x).toBeGreaterThan(400);
    expect(behindLeft.visible).toBe(false);
    expect(behindLeft.x).toBeLessThan(0);
    // Straight behind has no side of its own: it takes the left,
    // where shortestArcDeg puts a half-turn (and where the flat
    // stage pins the same target), finite and outside so a
    // clamp has a point to pull in
    expect(dead.visible).toBe(false);
    expect(dead.x).toBeLessThan(0);
    expect(Number.isFinite(dead.x)).toBe(true);
    expect(dead.y).toBeCloseTo(CY, 6);
  });


  it('moves y UP (smaller) for pitch up and down for pitch down, on the centre column', () => {
    const up = projectToScreen({ yaw: 0, pitch: 20 }, camera);
    const down = projectToScreen({ yaw: 0, pitch: -20 }, camera);

    expect(up.visible).toBe(true);
    expect(up.x).toBeCloseTo(CX, 6);
    expect(up.y).toBeLessThan(CY);
    expect(down.y).toBeGreaterThan(CY);
    expect(CY - up.y).toBeCloseTo(down.y - CY, 6);
  });


  it('centres a raised point when the camera tilts up to meet it, and drops the horizon', () => {
    const tilted = { ...camera, pitch: 20 };

    const met = projectToScreen({ yaw: 0, pitch: 20 }, tilted);
    expect(met.x).toBeCloseTo(CX, 6);
    expect(met.y).toBeCloseTo(CY, 6);

    const horizon = projectToScreen({ yaw: 0, pitch: 0 }, tilted);
    expect(horizon.y).toBeGreaterThan(CY);
  });


  it('follows the camera yaw and wraps the point yaw onto the same turn', () => {
    const turned = { ...camera, yaw: 90 };

    expect(projectToScreen({ yaw: 90 }, turned).x).toBeCloseTo(CX, 6);
    expect(projectToScreen({ yaw: 135 }, turned).x).toBeCloseTo(400, 6);
    expect(projectToScreen({ yaw: 405 }, camera).x).toBeCloseTo(400, 6);
  });


  it('pushes the same point further out through a narrower lens', () => {
    const wide = projectToScreen({ yaw: 30 }, camera);
    const narrow = projectToScreen({ yaw: 30 }, { ...camera, fovDeg: 60 });

    expect(wide.x).toBeLessThan(400);
    expect(narrow.x).toBeCloseTo(400, 6);
  });
});




describe('clampToEdge', () => {

  const bounds = { width: 400, height: 300 };


  it('leaves an inside point untouched', () => {
    expect(clampToEdge({ x: 120, y: 80 }, bounds, 20)).toEqual({ x: 120, y: 80, clamped: false });
  });


  it.each([
    ['left', { x: -50, y: 150 }, { x: 20, y: 150 }],
    ['right', { x: 900, y: 150 }, { x: 380, y: 150 }],
    ['top', { x: 200, y: -10 }, { x: 200, y: 20 }],
    ['bottom', { x: 200, y: 1000 }, { x: 200, y: 280 }],
    ['corner', { x: -1, y: 999 }, { x: 20, y: 280 }],
  ])('pulls a point in over the %s edge, keeping the margin', (_side, p, want) => {
    expect(clampToEdge(p, bounds, 20)).toEqual({ ...want, clamped: true });
  });
});




describe('flatViewYaw / flatMarkerX', () => {

  // Ten pixels per degree, a 400-wide view. The view centre
  // sits 200 px into the strip at offset 0; the first tile's
  // middle column (yaw 0) is at 1800, so offset 1600 faces it
  const TILE = 3600;
  const VIEW = 400;
  const FACING_0 = TILE / 2 - VIEW / 2;


  it('anchors yaw 0 on a tile\'s middle column and the half-turn on its edges', () => {
    expect(flatViewYaw(FACING_0, TILE, VIEW)).toBeCloseTo(0, 9);
    // The view centre on a tile's left edge, then on the next
    // tile's left edge — the seam is the half-turn either way
    expect(flatViewYaw(-VIEW / 2, TILE, VIEW)).toBeCloseTo(180, 9);
    expect(flatViewYaw(TILE - VIEW / 2, TILE, VIEW)).toBeCloseTo(180, 9);
    // Right of the middle column the yaw grows, left of it the
    // yaw comes down from 360
    expect(flatViewYaw(FACING_0 + 900, TILE, VIEW)).toBeCloseTo(90, 9);
    expect(flatViewYaw(FACING_0 - 900, TILE, VIEW)).toBeCloseTo(270, 9);
  });


  it('reads the yaw at the view centre modulo the tile, for any offset', () => {
    expect(flatViewYaw(0, TILE, VIEW)).toBeCloseTo(200, 9);
    expect(flatViewYaw(FACING_0 + TILE, TILE, VIEW)).toBeCloseTo(0, 9);
    expect(flatViewYaw(FACING_0 - TILE * 2, TILE, VIEW)).toBeCloseTo(0, 9);
    expect(flatViewYaw(FACING_0 + 100, TILE, VIEW)).toBeCloseTo(10, 9);
    expect(flatViewYaw(FACING_0 - 100, TILE, VIEW)).toBeCloseTo(350, 9);
  });


  it('wraps: target 350 with the view at 10 is 20° left, marker at the left edge', () => {
    const m = flatMarkerX(FACING_0 + 100, TILE, VIEW, 350);

    expect(m.deltaDeg).toBeCloseTo(-20, 9);
    expect(m.x).toBeCloseTo(0, 9);
  });


  it('lays a target right of centre at the strip scale, and a centred target at the middle', () => {
    const facing10 = FACING_0 + 100;

    expect(flatMarkerX(facing10, TILE, VIEW, 30)).toEqual({ x: 400, deltaDeg: 20 });
    expect(flatMarkerX(facing10, TILE, VIEW, 10)).toEqual({ x: 200, deltaDeg: 0 });
    expect(flatMarkerX(facing10, TILE, VIEW, 100)).toEqual({ x: 200 + 900, deltaDeg: 90 });
    // Exactly behind is the half-turn's left side, so the
    // column lands half a tile LEFT of centre
    expect(flatMarkerX(facing10, TILE, VIEW, 190)).toEqual({ x: 200 - 1800, deltaDeg: -180 });
  });


  it('reads a widthless tile as yaw 0 with the marker centred', () => {
    expect(flatViewYaw(123, 0, VIEW)).toBe(0);
    expect(flatMarkerX(123, 0, VIEW, 90)).toEqual({ x: 200, deltaDeg: 90 });
  });
});


describe('resolvePanoGeometry', () => {
  it('takes the author\'s word, clamped to what a sphere can hold', () => {
    expect(resolvePanoGeometry({ hfovDeg: 400, vfovDeg: 200, centreYawDeg: -30, vOffsetDeg: 100 })).toEqual({ hfovDeg: 360, vfovDeg: 180, centreYawDeg: 330, vOffsetDeg: 90 });
    expect(resolvePanoGeometry({ hfovDeg: 90, vfovDeg: 60 })).toEqual({ hfovDeg: 90, vfovDeg: 60, centreYawDeg: 0, vOffsetDeg: 0 });
  });

  it('reads a full turn and the vertical band off the aspect when there is no word', () => {
    expect(resolvePanoGeometry(null, 2)).toEqual({ hfovDeg: 360, vfovDeg: 180, centreYawDeg: 0, vOffsetDeg: 0 });
    expect(resolvePanoGeometry(undefined, 4096 / 1200).vfovDeg).toBeCloseTo(105.47, 1);
    expect(resolvePanoGeometry(null, null).vfovDeg).toBe(180);
  });
});


describe('viewLimits / limitYaw / limitPitch', () => {
  const whole = resolvePanoGeometry(null, 2);
  const band = resolvePanoGeometry(null, 4096 / 1200);
  const partial = resolvePanoGeometry({ hfovDeg: 120, vfovDeg: 80, centreYawDeg: 350 });

  it('leaves a whole sphere free: any yaw, pitch to the pole guard', () => {
    const limits = viewLimits(whole, 75, 52);
    expect(limits).toEqual({ centreYawDeg: 0, yawHalfSpanDeg: null, pitchMinDeg: -85, pitchMaxDeg: 85 });
    expect(limitYaw(725, limits)).toBe(5);
    expect(limitPitch(-100, limits)).toBe(-85);
  });

  it('keeps a phone sweep\'s band on screen: a full turn, pitch inside the band minus the view\'s own half', () => {
    const limits = viewLimits(band, 75, 52);
    expect(limits.yawHalfSpanDeg).toBeNull();
    expect(limits.pitchMaxDeg).toBeCloseTo((105.47 - 52) / 2, 1);
    expect(limits.pitchMinDeg).toBeCloseTo(-(105.47 - 52) / 2, 1);
  });

  it('holds a partial photo\'s ends at the stage\'s ends and folds the yaw around its centre', () => {
    const limits = viewLimits(partial, 60, 40);
    expect(limits).toEqual({ centreYawDeg: 350, yawHalfSpanDeg: 30, pitchMinDeg: -20, pitchMaxDeg: 20 });
    expect(limitYaw(10, limits)).toBe(10);
    expect(limitYaw(30, limits)).toBe(20);
    expect(limitYaw(300, limits)).toBe(320);
    expect(limitPitch(35, limits)).toBe(20);
  });

  it('locks a coverage narrower than the view on the photo\'s centre', () => {
    const limits = viewLimits(resolvePanoGeometry({ hfovDeg: 50, vfovDeg: 30, centreYawDeg: 90 }), 75, 52);
    expect(limits.yawHalfSpanDeg).toBe(0);
    expect(limitYaw(140, limits)).toBe(90);
    expect(limits.pitchMinDeg).toBe(0);
    expect(limits.pitchMaxDeg).toBe(0);
  });
});


describe('flatViewYaw / flatMarkerX on a partial photo', () => {
  it('reads the columns of one tile from centre − hfov/2 to centre + hfov/2, never wrapping', () => {
    // A 90° photo on a 600 px tile, 400 px window: the view
    // centre at 200 px is a third of the way in
    expect(flatViewYaw(0, 600, 400, 90, 0)).toBe(345);
    expect(flatViewYaw(100, 600, 400, 90, 0)).toBe(0);
    expect(flatViewYaw(200, 600, 400, 90, 0)).toBe(15);
    // Past the strip's end there is nothing more to see
    expect(flatViewYaw(2000, 600, 400, 90, 0)).toBe(45);
    expect(flatViewYaw(100, 600, 400, 90, 200)).toBe(200);
  });

  it('places the marker at the strip\'s own degrees per pixel', () => {
    expect(flatMarkerX(100, 600, 400, 15, 90, 0)).toEqual({ x: 200 + 100, deltaDeg: 15 });
    // Unchanged for a full turn
    expect(flatMarkerX(100, 600, 400, 15)).toEqual(flatMarkerX(100, 600, 400, 15, 360, 0));
  });
});
