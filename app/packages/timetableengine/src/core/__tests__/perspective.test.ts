// -----------------------------------------------------------
//  [*] Tests — the two perspectives
//
//  A lecture given to three groups at once is ONE card in the
//  teacher view, carrying three group chips.
// -----------------------------------------------------------

import { forGroup, forTeacher, listTeachers } from '../perspective';
import type { TimetableEntry } from '../types';

const L = (id: string, extra: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id, title: 'Matematika', day: 0, startMin: 540, endMin: 630,
  people: ['A. Petraitis'], location: ['112'], groupKey: 'ISKS-1', termKey: '2025-R', ...extra,
});

describe('listTeachers', () => {
  it('sorted, unique, across every entry', () => {
    const names = listTeachers([
      L('a', { people: ['B. Jonaitis', 'A. Petraitis'] }),
      L('b', { people: ['A. Petraitis'] }),
      L('c', { people: [] }),
      L('d', { people: undefined }),
    ]);
    expect(names).toEqual(['A. Petraitis', 'B. Jonaitis']);
  });
});

describe('forGroup', () => {
  it('one group, order preserved', () => {
    const entries = [L('a'), L('b', { groupKey: 'PDF-2' }), L('c')];
    expect(forGroup(entries, 'ISKS-1').map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('forTeacher', () => {
  it('collapses the same lesson across groups into one card with merged chips', () => {
    const merged = forTeacher([
      L('a', { groupKey: 'PDF-2' }),
      L('b', { groupKey: 'ISKS-1' }),
      L('c', { groupKey: 'ISKS-2' }),
    ], 'A. Petraitis');
    expect(merged).toHaveLength(1);
    expect(merged[0].groupKeys).toEqual(['ISKS-1', 'ISKS-2', 'PDF-2']);
  });

  it('near-identical lessons (different room) do NOT collapse', () => {
    const kept = forTeacher([L('a'), L('b', { location: ['113'], groupKey: 'PDF-2' })], 'A. Petraitis');
    expect(kept).toHaveLength(2);
  });

  it('only that teacher’s lessons come back', () => {
    const mine = forTeacher([L('a'), L('b', { people: ['B. Jonaitis'] })], 'A. Petraitis');
    expect(mine.map((e) => e.id)).toEqual(['a']);
  });

  it('a subgroup overlap still yields two cards for the packer', () => {
    // Same title/time but different rooms — two real, parallel obligations
    const cards = forTeacher([
      L('a', { title: 'Laboratorinis' }),
      L('b', { title: 'Laboratorinis', location: ['201'], groupKey: 'ISKS-2' }),
    ], 'A. Petraitis');
    expect(cards).toHaveLength(2);
  });

  it('never mutates the source entries', () => {
    const source = L('a', { groupKey: 'PDF-2' });
    forTeacher([source], 'A. Petraitis');
    expect(source.groupKeys).toBeUndefined();
  });
});

describe('forTeacher across terms', () => {
  it('the same weekly slot in two semesters stays two cards — groups never merge across terms', () => {
    const cards = forTeacher(
      [L('a', { termKey: '2025-R' }), L('b', { termKey: '2025-P', groupKey: 'PDF-2' })],
      'A. Petraitis',
    );
    expect(cards).toHaveLength(2);
    const byTerm = Object.fromEntries(cards.map((c) => [c.termKey, c.groupKeys]));
    expect(byTerm['2025-R']).toEqual(['ISKS-1']);
    expect(byTerm['2025-P']).toEqual(['PDF-2']);
  });
});
