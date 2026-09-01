// -----------------------------------------------------------
//  [*] Tests — small utilities
// -----------------------------------------------------------

import { formatMinutes, newestSemester, posToSlot, semesterRank } from '../utils';
import type { TimetableEntry } from '../types';

const L = (id: string, termKey?: string): TimetableEntry => ({
  id, title: id, day: 0, startMin: 540, endMin: 630, termKey,
});

describe('formatMinutes', () => {
  it('24h, no leading zero on the hour, padded minutes', () => {
    expect(formatMinutes(545)).toBe('9:05');
    expect(formatMinutes(0)).toBe('0:00');
    expect(formatMinutes(605)).toBe('10:05');
    expect(formatMinutes(1439)).toBe('23:59');
    expect(formatMinutes(1440)).toBe('24:00');
  });
});

describe('semesterRank / newestSemester', () => {
  it('autumn sorts before spring inside one academic year', () => {
    expect(semesterRank('2025-R')).toBeLessThan(semesterRank('2025-P'));
    expect(semesterRank('2025-P')).toBeLessThan(semesterRank('2026-R'));
  });

  it('unknown shapes rank lowest and never win', () => {
    expect(semesterRank('nonsense')).toBe(-1);
    expect(semesterRank('2025-X')).toBe(-1);
    expect(newestSemester([L('a', '2024-P'), L('b', 'nonsense'), L('c', '2025-R')])).toBe('2025-R');
  });

  it('no semesters, no answer', () => {
    expect(newestSemester([L('a')])).toBeUndefined();
  });
});

describe('posToSlot', () => {
  const window = { startMin: 480, endMin: 1260 };

  it('maps a grid touch to its day and half-hour slot', () => {
    expect(posToSlot(0.5, 65 / 780, window)).toEqual({ day: 3, snappedStartMin: 540 });
    expect(posToSlot(0, 0, window)).toEqual({ day: 0, snappedStartMin: 480 });
  });

  it('clamps the edges to real slots', () => {
    expect(posToSlot(1, 1, window)).toEqual({ day: 6, snappedStartMin: 1230 });
    expect(posToSlot(-0.1, -0.5, window)).toEqual({ day: 0, snappedStartMin: 480 });
  });
});
