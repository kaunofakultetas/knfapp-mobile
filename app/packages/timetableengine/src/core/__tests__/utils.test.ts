// -----------------------------------------------------------
//  [*] Tests — small utilities
// -----------------------------------------------------------

import { formatMinutes, newestSemester, newestSemesterKey, posToSlot, semesterRank, termKeyOf } from '../utils';
import type { TimetableEntry } from '../types';

const L = (id: string, termKey?: string): TimetableEntry => ({
  id, title: id, day: 0, startMin: 540, endMin: 630, termKey,
});

describe('formatMinutes', () => {
  // This case used to pin "9:05" — the unpadded hour was the
  // grid's odd one out (KNF-184): the list, the sheet and the
  // scraped strings all read "09:05"
  it('24h, zero-padded on both parts — the one clock of every timetable surface', () => {
    expect(formatMinutes(545)).toBe('09:05');
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(605)).toBe('10:05');
    expect(formatMinutes(1439)).toBe('23:59');
    expect(formatMinutes(1440)).toBe('24:00');
  });
});

describe('termKeyOf', () => {
  it("mirrors the scraper's label rule — August opens the autumn, January is spring", () => {
    expect(termKeyOf('2026-09-25')).toBe('2026-R');
    expect(termKeyOf('2026-08-31')).toBe('2026-R');
    expect(termKeyOf('2026-07-31')).toBe('2025-P');
    expect(termKeyOf('2027-01-07')).toBe('2026-P');
    expect(termKeyOf('2026-12-28')).toBe('2026-R');
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

describe('newestSemesterKey', () => {
  it('spring outranks its own autumn — the label year is the academic year', () => {
    // The bug this replaces: a host ranking R above P defaulted
    // to the stale autumn all spring long
    expect(newestSemesterKey(['2025-R', '2025-P'])).toBe('2025-P');
    expect(newestSemesterKey(['2025-P', '2026-R'])).toBe('2026-R');
  });

  it('trims labels, skips unparsable ones, and yields null on an all-junk catalog', () => {
    expect(newestSemesterKey([' 2025-R ', '2025-pavasaris'])).toBe('2025-R');
    expect(newestSemesterKey(['ruduo', ''])).toBeNull();
    expect(newestSemesterKey([])).toBeNull();
  });
});
