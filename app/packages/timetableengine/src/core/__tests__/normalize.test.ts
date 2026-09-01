// -----------------------------------------------------------
//  [*] Tests — normalize: the single door raw rows come through
//
//  Malformed rows degrade PER ENTRY with a count — the blank
//  week a whole-parse try/catch produces is the anti-lesson
//  this battery guards against.
// -----------------------------------------------------------

import { DAY_MINUTES, normalizeEntries, parseTimeToMinutes } from '../normalize';
import type { TimetableEntry } from '../types';

const L = (id: string, day: number, startMin: number, endMin: number): TimetableEntry => ({
  id, title: id, day, startMin, endMin,
});

describe('parseTimeToMinutes', () => {
  it('parses the zero-padded 24h clock', () => {
    expect(parseTimeToMinutes('09:00')).toBe(540);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
    expect(parseTimeToMinutes(' 13:30 ')).toBe(810);
  });

  it('rejects every other shape', () => {
    expect(parseTimeToMinutes('9:00')).toBeNull();   // unpadded
    expect(parseTimeToMinutes('24:00')).toBeNull();  // past the clock
    expect(parseTimeToMinutes('12:60')).toBeNull();
    expect(parseTimeToMinutes('TBA')).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes('12.30')).toBeNull();
    expect(parseTimeToMinutes('١٢:٣٠')).toBeNull();  // non-ASCII digits
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes(undefined)).toBeNull();
  });
});

describe('normalizeEntries', () => {
  it('keeps clean rows untouched and in order', () => {
    const rows = [L('a', 0, 540, 630), L('b', 4, 0, DAY_MINUTES)];
    const result = normalizeEntries(rows);
    expect(result.entries).toEqual(rows);
    expect(result.skipped).toBe(0);
  });

  it('skips each degenerate row and counts it', () => {
    const good = L('good', 2, 600, 690);
    const rows = [
      L('zero', 0, 540, 540),          // zero duration
      L('reversed', 0, 630, 540),      // end before start
      L('midnight', 0, 1380, 1500),    // crosses midnight
      L('negative', 0, -10, 60),
      L('day7', 7, 540, 630),
      L('dayNeg', -1, 540, 630),
      L('dayFrac', 2.5, 540, 630),
      { ...L('nanStart', 0, Number.NaN, 630) },
      { ...L('noId', 0, 540, 630), id: '' },
      null,
      undefined,
      good,
    ];
    const result = normalizeEntries(rows);
    expect(result.entries).toEqual([good]);
    expect(result.skipped).toBe(11);
  });

  it('never mutates the input', () => {
    const row = L('a', 0, 540, 630);
    const rows = [row, null];
    normalizeEntries(rows);
    expect(rows).toEqual([row, null]);
    expect(row).toEqual(L('a', 0, 540, 630));
  });
});

describe('normalizeEntries shape gate', () => {
  it('a bad title or a bare-string name list skips the row — the crash stays outside the door', () => {
    const good = L('good', 0, 540, 630);
    const rows = [
      { ...L('noTitle', 0, 540, 630), title: undefined as unknown as string },
      { ...L('numTitle', 0, 540, 630), title: 7 as unknown as string },
      { ...L('barePeople', 0, 540, 630), people: 'A. Petraitis' as unknown as string[] },
      { ...L('numPerson', 0, 540, 630), people: [7] as unknown as string[] },
      { ...L('bareLocation', 0, 540, 630), location: '112' as unknown as string[] },
      good,
    ];
    const result = normalizeEntries(rows);
    expect(result.entries).toEqual([good]);
    expect(result.skipped).toBe(5);
  });

  it('absent and empty name lists both pass — only the wrong SHAPE is a defect', () => {
    const rows = [L('bare', 0, 540, 630), { ...L('empty', 0, 600, 660), people: [], location: [] }];
    expect(normalizeEntries(rows)).toEqual({ entries: rows, skipped: 0 });
  });
});
