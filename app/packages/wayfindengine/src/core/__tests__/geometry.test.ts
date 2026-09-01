// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine geometry
//
//  The plan-space frame pinned exactly: the bearing table for
//  the four axes and the four diagonals in a y-down drawing,
//  the shortest arc's wrap-around and its (-180, 180] edge,
//  every turn threshold on both sides of the line, and the
//  path compressor keeping corners while dropping collinear
//  runs, duplicates and sub-tolerance wobbles.
// -----------------------------------------------------------

import { bearingDeg, compressPath, shortestArcDeg, turnBetween } from '../geometry';


const origin = { x: 0, y: 0 };


describe('bearingDeg', () => {
  it.each([
    ['up', { x: 0, y: -10 }, 0],
    ['up-right', { x: 10, y: -10 }, 45],
    ['right', { x: 10, y: 0 }, 90],
    ['down-right', { x: 10, y: 10 }, 135],
    ['down', { x: 0, y: 10 }, 180],
    ['down-left', { x: -10, y: 10 }, 225],
    ['left', { x: -10, y: 0 }, 270],
    ['up-left', { x: -10, y: -10 }, 315],
  ])('%s on a y-down drawing', (_label, to, expected) => {
    expect(bearingDeg(origin, to)).toBeCloseTo(expected, 9);
  });

  it('is measured from the first point, so the reverse leg is 180 away', () => {
    const a = { x: 3, y: 7 };
    const b = { x: 30, y: -4 };
    expect(shortestArcDeg(bearingDeg(a, b), bearingDeg(b, a))).toBeCloseTo(180, 9);
  });

  it('answers 0, not 180, for two coincident points', () => {
    expect(bearingDeg(origin, { x: 0, y: 0 })).toBe(0);
  });
});


describe('shortestArcDeg', () => {
  it('goes the short way round the wrap', () => {
    expect(shortestArcDeg(350, 10)).toBe(20);
    expect(shortestArcDeg(10, 350)).toBe(-20);
  });

  it('is signed: right positive, left negative', () => {
    expect(shortestArcDeg(0, 90)).toBe(90);
    expect(shortestArcDeg(90, 0)).toBe(-90);
    expect(shortestArcDeg(0, 270)).toBe(-90);
    expect(shortestArcDeg(270, 0)).toBe(90);
  });

  it('reports a reversal as +180 from either side', () => {
    expect(shortestArcDeg(0, 180)).toBe(180);
    expect(shortestArcDeg(180, 0)).toBe(180);
  });

  it('answers a plain 0 for the same bearing, even across a 360 alias', () => {
    expect(shortestArcDeg(90, 90)).toBe(0);
    expect(Object.is(shortestArcDeg(360, 0), 0)).toBe(true);
    expect(shortestArcDeg(370, 10)).toBe(0);
  });
});


describe('turnBetween', () => {
  it.each([
    [0, 0, 'straight'],
    [0, 24.9, 'straight'],
    [0, 335.1, 'straight'],
    [0, 25, 'slight-right'],
    [0, 335, 'slight-left'],
    [0, 69.9, 'slight-right'],
    [0, 290.1, 'slight-left'],
    [0, 70, 'right'],
    [0, 290, 'left'],
    [0, 135, 'right'],
    [0, 225, 'left'],
    [0, 135.1, 'u-turn'],
    [0, 224.9, 'u-turn'],
    [0, 180, 'u-turn'],
  ])('%d → %d is %s', (a, b, expected) => {
    expect(turnBetween(a, b)).toBe(expected);
  });

  it('judges the arc across the 360 wrap, not the raw difference', () => {
    expect(turnBetween(350, 10)).toBe('straight');
    expect(turnBetween(10, 350)).toBe('straight');
    expect(turnBetween(340, 60)).toBe('right');
    expect(turnBetween(60, 340)).toBe('left');
  });
});


describe('compressPath', () => {
  it('drops the interior points of a collinear run', () => {
    const run = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    expect(compressPath(run)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it('keeps every corner', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 0 },
    ];
    expect(compressPath(corners)).toEqual(corners);
  });

  it('drops consecutive duplicates and still sees the corner they sat on', () => {
    const doubled = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    expect(compressPath(doubled)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('drops a wobble under the tolerance and keeps one at or over it', () => {
    // (10, 0.5) bends 5.7 degrees either side; (10, 1) bends 11.4
    const wobble = (dip: number) => [
      { x: 0, y: 0 },
      { x: 10, y: dip },
      { x: 20, y: 0 },
    ];
    expect(compressPath(wobble(0.5))).toHaveLength(2);
    expect(compressPath(wobble(1))).toHaveLength(3);
    // The tolerance is the caller's: widen it and the same bend goes
    expect(compressPath(wobble(1), 15)).toHaveLength(2);
  });

  it('measures the incoming bearing from the last kept point, so a gentle arc is not flattened to a chord', () => {
    // A quarter circle in 5-degree steps: every single bend is
    // under the tolerance, the whole is a right-angle turn
    const arc = Array.from({ length: 19 }, (_, i) => {
      const t = (i * 5 * Math.PI) / 180;
      return { x: 100 * Math.sin(t), y: -100 * Math.cos(t) };
    });
    const out = compressPath(arc);
    expect(out.length).toBeGreaterThan(2);
    expect(out.length).toBeLessThan(arc.length);
    expect(out[0]).toBe(arc[0]);
    expect(out[out.length - 1]).toBe(arc[arc.length - 1]);
  });

  it('passes the point objects through untouched, extra fields and all', () => {
    const route = [
      { nodeId: 'a', x: 0, y: 0 },
      { nodeId: 'b', x: 10, y: 0 },
      { nodeId: 'c', x: 20, y: 0 },
      { nodeId: 'd', x: 20, y: 30 },
    ];
    const out = compressPath(route);
    expect(out.map((p) => p.nodeId)).toEqual(['a', 'c', 'd']);
    expect(out[0]).toBe(route[0]);
    expect(out[1]).toBe(route[2]);
  });

  it('leaves 0, 1 and 2 distinct points alone', () => {
    expect(compressPath([])).toEqual([]);
    expect(compressPath([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(
      compressPath([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    // Two points that are the same point collapse to one
    expect(
      compressPath([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([{ x: 1, y: 1 }]);
  });
});
