// -----------------------------------------------------------
//  [*] Tests — conflicts: two scopes, exclusive endpoints
//
//  Group scope answers the student ("my group is double-
//  booked") and stays OFF in a mixed view; person scope
//  answers the teacher and crosses groups on purpose.
// -----------------------------------------------------------

import { annotateConflicts, conflictIds } from '../conflicts';
import { placeDay } from '../layout';
import type { TimetableEntry } from '../types';

const L = (id: string, startMin: number, endMin: number, extra: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id, title: id, day: 0, startMin, endMin, groupKey: 'ISKS-1', termKey: '2025-R', ...extra,
});

describe('conflictIds group scope', () => {
  const scope = { scope: 'group' as const, groupFilterActive: true };

  it('flags a true overlap inside one group and term', () => {
    const ids = conflictIds([L('a', 540, 630), L('b', 600, 660)], scope);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('back-to-back never conflicts', () => {
    expect(conflictIds([L('a', 540, 630), L('b', 630, 720)], scope).size).toBe(0);
  });

  it('stays silent without an active group filter — parallel groups share slots legitimately', () => {
    const entries = [L('a', 540, 630), L('b', 600, 660)];
    expect(conflictIds(entries, { scope: 'group' }).size).toBe(0);
    expect(conflictIds(entries, { scope: 'group', groupFilterActive: false }).size).toBe(0);
  });

  it('different groups or different terms never clash', () => {
    expect(conflictIds([L('a', 540, 630), L('b', 600, 660, { groupKey: 'ISKS-2' })], scope).size).toBe(0);
    expect(conflictIds([L('a', 540, 630), L('b', 600, 660, { termKey: '2025-P' })], scope).size).toBe(0);
  });

  it('identical rows are duplicate data, not a conflict', () => {
    const twin = { title: 'Matematika', startMin: 540, endMin: 630, people: ['A. Petraitis'], location: ['112'] };
    const ids = conflictIds([L('a', 540, 630, twin), L('b', 540, 630, twin)], scope);
    expect(ids.size).toBe(0);
  });

  it('different days never clash; blocks never participate', () => {
    expect(conflictIds([L('a', 540, 630), L('b', 600, 660, { day: 1 })], scope).size).toBe(0);
    expect(conflictIds([L('a', 540, 630), L('bg', 480, 1200, { isBlock: true })], scope).size).toBe(0);
  });
});

describe('conflictIds person scope', () => {
  it('a teacher in two overlapping lessons is double-booked ACROSS groups', () => {
    const ids = conflictIds(
      [
        L('a', 540, 630, { people: ['A. Petraitis'], groupKey: 'ISKS-1' }),
        L('b', 600, 660, { people: ['A. Petraitis', 'B. Jonaitis'], groupKey: 'PDF-2' }),
      ],
      { scope: 'person' },
    );
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('no shared person, no conflict', () => {
    const ids = conflictIds(
      [L('a', 540, 630, { people: ['A. Petraitis'] }), L('b', 600, 660, { people: ['B. Jonaitis'] })],
      { scope: 'person' },
    );
    expect(ids.size).toBe(0);
  });

  it('never crosses semesters — the same slot in two terms is not a double-booking', () => {
    const ids = conflictIds(
      [
        L('a', 540, 630, { people: ['A. Petraitis'], termKey: '2025-R' }),
        L('b', 600, 660, { people: ['A. Petraitis'], termKey: '2025-P' }),
      ],
      { scope: 'person' },
    );
    expect(ids.size).toBe(0);
  });
});

describe('conflictIds with three and more lessons', () => {
  const scope = { scope: 'group' as const, groupFilterActive: true };

  it('every pairwise overlap is flagged — a first hit never short-circuits the rest', () => {
    // a spans the morning; b and c each overlap a but never
    // each other; d is clear of everything
    const ids = conflictIds([L('a', 540, 720), L('b', 570, 600), L('c', 660, 690), L('d', 720, 780)], scope);
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('a chain is not transitive by fiat — each id needs its own overlap', () => {
    // a–b overlap and b–c overlap, but a ends before c starts:
    // all three carry a real pairwise overlap of their own,
    // and the clear-of-everything d stays out
    const ids = conflictIds([L('a', 540, 600), L('b', 590, 650), L('c', 640, 700), L('d', 700, 760)], scope);
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('annotateConflicts', () => {
  const scope = { scope: 'group' as const, groupFilterActive: true };

  it('stamps the verdict onto placed layouts without touching the calm ones', () => {
    const entries = [L('a', 540, 630), L('b', 600, 660), L('c', 700, 760)];
    const placed = placeDay(entries, { startMin: 480, endMin: 1260 });
    const out = annotateConflicts(placed, conflictIds(entries, scope));
    const by = (id: string) => out.find((p) => p.entry.id === id)!;
    expect(by('a').layout.isConflict).toBe(true);
    expect(by('b').layout.isConflict).toBe(true);
    expect(by('c').layout.isConflict).toBe(false);
    // The calm entry keeps its very object — memoized cells stay put
    expect(by('c')).toBe(placed.find((p) => p.entry.id === 'c'));
    // The input is never mutated
    expect(placed.every((p) => !p.layout.isConflict)).toBe(true);
  });

  it('never flags a background block, whatever the id set claims', () => {
    const placed = placeDay([L('bg', 480, 1200, { isBlock: true })], { startMin: 480, endMin: 1260 });
    expect(annotateConflicts(placed, new Set(['bg']))[0].layout.isConflict).toBe(false);
  });
});
