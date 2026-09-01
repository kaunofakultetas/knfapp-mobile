// -----------------------------------------------------------
//  [*] Tests — deriveWindow: the visible hour span
//
//  The configured bounds are the DEFAULT span; lessons only
//  ever widen it, so the axis stays put while paging.
// -----------------------------------------------------------

import { deriveWindow } from '../window';
import type { TimetableEntry } from '../types';

const L = (startMin: number, endMin: number): TimetableEntry => ({
  id: `${startMin}`, title: 't', day: 0, startMin, endMin,
});

describe('deriveWindow', () => {
  it('empty data → exactly the configured bounds', () => {
    expect(deriveWindow([])).toEqual({ startMin: 480, endMin: 1260 });
    expect(deriveWindow([], { floorMin: 540, ceilMin: 1200 })).toEqual({ startMin: 540, endMin: 1200 });
  });

  it('lessons inside the bounds never shrink the window', () => {
    expect(deriveWindow([L(600, 690)])).toEqual({ startMin: 480, endMin: 1260 });
  });

  it('an early lesson widens the floor, hour-snapped with pad', () => {
    // 07:00 start − 60 pad → snap to 06:00
    expect(deriveWindow([L(420, 510)]).startMin).toBe(360);
  });

  it('a late lesson widens the ceil, hour-snapped with pad', () => {
    // 21:30 end + 60 pad → snap to 23:00
    expect(deriveWindow([L(1200, 1290)]).endMin).toBe(1380);
  });

  it('a CONFIGURED floor is respected, not a hardcoded 8', () => {
    const window = deriveWindow([L(555, 645)], { floorMin: 540 });
    // 09:15 − 60 → snap 08:00, below the 09:00 floor → widen
    expect(window.startMin).toBe(480);
  });

  it('never leaves the clock', () => {
    expect(deriveWindow([L(0, 30)]).startMin).toBe(0);
    expect(deriveWindow([L(1380, 1440)]).endMin).toBe(1440);
  });
});

describe('deriveWindow options and blocks', () => {
  it('background blocks never widen the axis', () => {
    const block: TimetableEntry = { id: 'bg', title: 'Atostogos', day: 0, startMin: 0, endMin: 1440, isBlock: true };
    expect(deriveWindow([block, L(600, 690)])).toEqual({ startMin: 480, endMin: 1260 });
    // A day of nothing but blocks is the default span too
    expect(deriveWindow([block])).toEqual({ startMin: 480, endMin: 1260 });
  });

  it('a custom pad is honored on both ends', () => {
    expect(deriveWindow([L(420, 510)], { padMin: 0 }).startMin).toBe(420);
    expect(deriveWindow([L(420, 510)], { padMin: 120 }).startMin).toBe(300);
    expect(deriveWindow([L(1200, 1290)], { padMin: 120 }).endMin).toBe(1440);
  });

  it('a custom ceiling holds with lessons present — and still widens when they run late', () => {
    expect(deriveWindow([L(600, 690)], { ceilMin: 1200 })).toEqual({ startMin: 480, endMin: 1200 });
    expect(deriveWindow([L(1140, 1230)], { ceilMin: 1200 }).endMin).toBe(1320);
  });
});
