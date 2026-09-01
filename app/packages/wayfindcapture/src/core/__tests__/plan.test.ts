// -----------------------------------------------------------
//  [*] Tests — wayfindcapture plan
//
//  The P2 target lists pinned literally — ids, angles and
//  order for both modes — because the server's expected count
//  and the stitcher are built against exactly these. Plus the
//  sphere metric: wraparound, pitch-only distance, and the
//  pole effect that makes "nearest" a great-circle question
//  rather than a yaw subtraction.
// -----------------------------------------------------------

import { angularDistanceDeg, planTargets } from '../plan';


describe('planTargets', () => {
  it("mode 'walls' is the three 12-target rows, 36 in row-then-yaw order", () => {
    const targets = planTargets({ mode: 'walls' });
    expect(targets).toHaveLength(36);

    expect(targets.slice(0, 12)).toEqual(
      Array.from({ length: 12 }, (_, n) => ({ id: `r0-${n}`, yawDeg: n * 30, pitchDeg: 0 })),
    );
    expect(targets.slice(12, 24)).toEqual(
      Array.from({ length: 12 }, (_, n) => ({ id: `r40-${n}`, yawDeg: n * 30, pitchDeg: 40 })),
    );
    expect(targets.slice(24, 36)).toEqual(
      Array.from({ length: 12 }, (_, n) => ({ id: `r-40-${n}`, yawDeg: n * 30, pitchDeg: -40 })),
    );
  });

  it("mode 'full' appends the two 4-target caps at 45° steps, 44 in all", () => {
    const targets = planTargets({ mode: 'full' });
    expect(targets).toHaveLength(44);

    // The wall rows come first and are identical to 'walls'
    expect(targets.slice(0, 36)).toEqual(planTargets({ mode: 'walls' }));

    expect(targets.slice(36, 40)).toEqual([
      { id: 'r70-0', yawDeg: 0, pitchDeg: 70 },
      { id: 'r70-1', yawDeg: 45, pitchDeg: 70 },
      { id: 'r70-2', yawDeg: 90, pitchDeg: 70 },
      { id: 'r70-3', yawDeg: 135, pitchDeg: 70 },
    ]);
    expect(targets.slice(40, 44)).toEqual([
      { id: 'r-70-0', yawDeg: 0, pitchDeg: -70 },
      { id: 'r-70-1', yawDeg: 45, pitchDeg: -70 },
      { id: 'r-70-2', yawDeg: 90, pitchDeg: -70 },
      { id: 'r-70-3', yawDeg: 135, pitchDeg: -70 },
    ]);
  });

  it('every id is unique in both modes', () => {
    for (const mode of ['full', 'walls'] as const) {
      const ids = planTargets({ mode }).map((target) => target.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});


describe('angularDistanceDeg', () => {
  it('is zero between a direction and itself', () => {
    expect(angularDistanceDeg({ yawDeg: 123, pitchDeg: -41 }, { yawDeg: 123, pitchDeg: -41 })).toBeCloseTo(0, 6);
  });

  it('wraps yaw the short way round', () => {
    expect(angularDistanceDeg({ yawDeg: 350, pitchDeg: 0 }, { yawDeg: 10, pitchDeg: 0 })).toBeCloseTo(20, 6);
  });

  it('is the plain difference for pitch-only moves', () => {
    expect(angularDistanceDeg({ yawDeg: 90, pitchDeg: 40 }, { yawDeg: 90, pitchDeg: -40 })).toBeCloseTo(80, 6);
  });

  it('shrinks yaw differences near the pole', () => {
    // A 180° yaw swing at pitch 70 is only the 40° hop over the
    // pole: sin²70 − cos²70 = cos 40
    expect(angularDistanceDeg({ yawDeg: 0, pitchDeg: 70 }, { yawDeg: 180, pitchDeg: 70 })).toBeCloseTo(40, 6);
  });

  it('is symmetric and capped at 180', () => {
    const a = { yawDeg: 20, pitchDeg: 10 };
    const b = { yawDeg: 250, pitchDeg: -60 };
    expect(angularDistanceDeg(a, b)).toBeCloseTo(angularDistanceDeg(b, a), 10);
    expect(angularDistanceDeg({ yawDeg: 0, pitchDeg: 45 }, { yawDeg: 180, pitchDeg: -45 })).toBeCloseTo(180, 6);
  });
});
