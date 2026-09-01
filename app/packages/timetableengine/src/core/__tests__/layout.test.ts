// -----------------------------------------------------------
//  [*] Tests — the overlap packer, pinned to exact fractions
//
//  Geometry comes out as fractions, so every guarantee here is
//  an exact equality: cluster boundaries, greedy columns, span
//  expansion, block behavior, and order-independence.
// -----------------------------------------------------------

import { compareEntries, placeDay } from '../layout';
import type { PlacedEntry, TimetableEntry } from '../types';

const WINDOW = { startMin: 480, endMin: 1260 }; // 08:00–21:00, span 780

const L = (id: string, startMin: number, endMin: number, extra: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id, title: id, day: 0, startMin, endMin, ...extra,
});

const at = (placed: PlacedEntry[], id: string) => {
  const hit = placed.find((p) => p.entry.id === id);
  if (!hit) throw new Error(`missing ${id}`);
  return hit.layout;
};

describe('placeDay clustering', () => {
  it('two overlapping lessons split the column in half', () => {
    const placed = placeDay([L('a', 540, 630), L('b', 600, 660)], WINDOW);
    expect(at(placed, 'a')).toMatchObject({ column: 0, columnCount: 2, leftFrac: 0, widthFrac: 0.5 });
    expect(at(placed, 'b')).toMatchObject({ column: 1, columnCount: 2, leftFrac: 0.5, widthFrac: 0.5 });
    expect(at(placed, 'a').clusterId).toBe(at(placed, 'b').clusterId);
  });

  it('back-to-back lessons NEVER share width — separate clusters, full width', () => {
    const placed = placeDay([L('a', 540, 630), L('b', 630, 720)], WINDOW);
    expect(at(placed, 'a')).toMatchObject({ columnCount: 1, leftFrac: 0, widthFrac: 1 });
    expect(at(placed, 'b')).toMatchObject({ columnCount: 1, leftFrac: 0, widthFrac: 1 });
    expect(at(placed, 'a').clusterId).not.toBe(at(placed, 'b').clusterId);
  });

  it('an identical-slot triple takes thirds in total-sort order', () => {
    const placed = placeDay([L('c', 540, 630), L('a', 540, 630), L('b', 540, 630)], WINDOW);
    expect(at(placed, 'a')).toMatchObject({ column: 0, leftFrac: 0, widthFrac: 1 / 3 });
    expect(at(placed, 'b')).toMatchObject({ column: 1, leftFrac: 1 / 3, widthFrac: 1 / 3 });
    expect(at(placed, 'c')).toMatchObject({ column: 2, leftFrac: 2 / 3, widthFrac: 1 / 3 });
  });

  it('a later entry expands rightward across free columns', () => {
    const placed = placeDay(
      [L('a', 540, 660), L('b', 540, 570), L('c', 540, 570), L('d', 600, 660)],
      WINDOW,
    );
    // Three columns open at 09:00; d lands in column 1 and the
    // 09:00–09:30 slot in column 2 is long over → span 2
    expect(at(placed, 'a')).toMatchObject({ column: 0, widthFrac: 1 / 3 });
    expect(at(placed, 'b')).toMatchObject({ column: 1, widthFrac: 1 / 3 });
    expect(at(placed, 'c')).toMatchObject({ column: 2, widthFrac: 1 / 3 });
    expect(at(placed, 'd')).toMatchObject({ column: 1, span: 2, leftFrac: 1 / 3, widthFrac: 2 / 3 });
  });

  it('containment plus a transitive chain stays ONE cluster', () => {
    const placed = placeDay(
      [L('a', 540, 720), L('b', 550, 560), L('c', 700, 730), L('d', 725, 740)],
      WINDOW,
    );
    const ids = ['a', 'b', 'c', 'd'].map((id) => at(placed, id).clusterId);
    expect(new Set(ids).size).toBe(1);
  });

  it('cluster end tracks the MAX end, not the last entry seen', () => {
    // b ends long before a does; c starts after b but inside a —
    // still the same cluster
    const placed = placeDay([L('a', 540, 700), L('b', 560, 570), L('c', 610, 630)], WINDOW);
    expect(at(placed, 'a').clusterId).toBe(at(placed, 'c').clusterId);
    expect(at(placed, 'b').clusterId).toBe(at(placed, 'c').clusterId);
  });

  it('a background block never claims columns from real lessons', () => {
    const placed = placeDay(
      [L('block', 480, 1200, { isBlock: true }), L('a', 540, 630), L('b', 600, 660)],
      WINDOW,
    );
    expect(at(placed, 'block')).toMatchObject({ clusterId: -1, leftFrac: 0, widthFrac: 1 });
    expect(at(placed, 'a').widthFrac).toBe(0.5);
    expect(at(placed, 'b').widthFrac).toBe(0.5);
  });

  it('shuffled input produces identical geometry', () => {
    const entries = [
      L('a', 540, 660), L('b', 540, 570), L('c', 540, 570), L('d', 600, 660),
      L('e', 660, 750), L('f', 700, 790), L('g', 800, 830), L('h', 900, 990),
    ];
    const geometry = (list: TimetableEntry[]) => {
      const placed = placeDay(list, WINDOW);
      return Object.fromEntries(placed.map((p) => [p.entry.id, p.layout]));
    };
    const straight = geometry(entries);
    expect(geometry([...entries].reverse())).toEqual(straight);
    expect(geometry([entries[3], entries[7], entries[0], entries[5], entries[2], entries[6], entries[1], entries[4]])).toEqual(straight);
  });
});

describe('placeDay vertical fractions', () => {
  it('measures against the WINDOW, not the 24h day', () => {
    const layout = at(placeDay([L('a', 540, 630)], WINDOW), 'a');
    expect(layout.topFrac).toBeCloseTo(60 / 780, 10);
    expect(layout.heightFrac).toBeCloseTo(90 / 780, 10);
  });

  it('a lesson at the window start sits at topFrac 0', () => {
    expect(at(placeDay([L('a', 480, 570)], WINDOW), 'a').topFrac).toBe(0);
  });

  it('clamps an out-of-window entry to the edge instead of off-canvas', () => {
    const early = at(placeDay([L('a', 400, 510)], WINDOW), 'a');
    expect(early.topFrac).toBe(0);
    expect(early.heightFrac).toBeCloseTo(30 / 780, 10);
    const late = at(placeDay([L('b', 1230, 1350)], WINDOW), 'b');
    expect(late.heightFrac).toBeCloseTo(30 / 780, 10);
    const outside = at(placeDay([L('c', 300, 360)], WINDOW), 'c');
    expect(outside.heightFrac).toBe(0);
  });

  it('isShort flips exactly at the threshold', () => {
    const placed = placeDay([L('a', 540, 570), L('b', 600, 631)], WINDOW);
    expect(at(placed, 'a').isShort).toBe(true);   // 30 min
    expect(at(placed, 'b').isShort).toBe(false);  // 31 min
    const custom = placeDay([L('c', 540, 585)], WINDOW, { shortMin: 45 });
    expect(at(custom, 'c').isShort).toBe(true);
  });
});

describe('compareEntries', () => {
  it('orders start asc, longer first, then title, then id', () => {
    const list = [
      L('b', 540, 600), L('a', 540, 660), L('d', 500, 530),
      L('c', 540, 600, { title: 'a-first' }),
    ];
    expect([...list].sort(compareEntries).map((e) => e.id)).toEqual(['d', 'a', 'c', 'b']);
  });
});

describe('placeDay symmetric window clamp', () => {
  it('an entry wholly past the window pins at the bottom edge, never off canvas', () => {
    const late = at(placeDay([L('z', 1300, 1360)], WINDOW), 'z');
    expect(late.topFrac).toBe(1);
    expect(late.heightFrac).toBe(0);
  });
});

describe('placeDay block order', () => {
  it('overlapping blocks paint in total-sort order whatever the input order', () => {
    const x = L('x', 480, 720, { isBlock: true, title: 'Posėdis' });
    const y = L('y', 480, 720, { isBlock: true, title: 'Atostogos' });
    const order = (list: TimetableEntry[]) =>
      placeDay(list, WINDOW).filter((p) => p.entry.isBlock).map((p) => p.entry.id);
    expect(order([x, y])).toEqual(['y', 'x']);
    expect(order([y, x])).toEqual(['y', 'x']);
  });
});
