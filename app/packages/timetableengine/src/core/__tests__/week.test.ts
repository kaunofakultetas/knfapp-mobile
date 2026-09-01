// -----------------------------------------------------------
//  [*] Tests — week buckets and the dated edge
//
//  Date math runs on UTC strings, so the EET DST Sundays in
//  late March and late October — mid-semester — must come out
//  as seven consecutive dates like any other week.
// -----------------------------------------------------------

import { buildWeek, isoWeekNumber, materializeWeek, mondayOf, visibleDays } from '../week';
import type { TimetableEntry } from '../types';

const L = (id: string, day: number, extra: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id, title: id, day, startMin: 540, endMin: 630, ...extra,
});

const fullWeek = [0, 1, 2, 3, 4, 5, 6].map((day) => L(`d${day}`, day));

describe('buildWeek / visibleDays', () => {
  it('buckets by day and sorts each bucket', () => {
    const week = buildWeek([
      L('late', 1, { startMin: 700, endMin: 790 }),
      L('early', 1, { startMin: 540, endMin: 630 }),
      L('mon', 0),
    ]);
    expect(week[0].map((e) => e.id)).toEqual(['mon']);
    expect(week[1].map((e) => e.id)).toEqual(['early', 'late']);
    expect(week[2]).toEqual([]);
    expect(week).toHaveLength(7);
  });

  it('weekend columns appear only when scheduled', () => {
    expect(visibleDays([L('a', 1)])).toEqual([0, 1, 2, 3, 4]);
    expect(visibleDays([L('a', 5)])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visibleDays([L('a', 6)])).toEqual([0, 1, 2, 3, 4, 6]);
    expect(visibleDays([])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('mondayOf', () => {
  it('finds the week Monday from any weekday', () => {
    expect(mondayOf('2026-03-25')).toBe('2026-03-23'); // Wednesday
    expect(mondayOf('2026-03-23')).toBe('2026-03-23'); // Monday itself
    expect(mondayOf('2026-03-29')).toBe('2026-03-23'); // Sunday belongs BACK
  });

  it('rolls across a year boundary', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
    expect(mondayOf('2026-01-04')).toBe('2025-12-29');
  });
});

describe('isoWeekNumber', () => {
  it('matches the ISO-8601 calendar', () => {
    expect(isoWeekNumber('2026-01-01')).toBe(1);   // Thursday of week 1
    expect(isoWeekNumber('2025-12-29')).toBe(1);   // Monday of 2026-W01
    expect(isoWeekNumber('2026-03-23')).toBe(13);
    expect(isoWeekNumber('2020-12-31')).toBe(53);  // a 53-week year
    expect(isoWeekNumber('2021-01-01')).toBe(53);  // Jan 1 in last year's week
  });
});

describe('materializeWeek', () => {
  it('spring DST week (EET, late March) is seven consecutive dates', () => {
    const dates = materializeWeek(fullWeek, '2026-03-23').map((d) => d.date);
    expect(dates).toEqual([
      '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26',
      '2026-03-27', '2026-03-28', '2026-03-29',
    ]);
  });

  it('autumn DST week (late October) is seven consecutive dates', () => {
    const dates = materializeWeek(fullWeek, '2026-10-19').map((d) => d.date);
    expect(dates).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
      '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
  });

  it('the new-year week runs Dec 29 → Jan 4', () => {
    const dates = materializeWeek(fullWeek, '2025-12-31').map((d) => d.date);
    expect(dates[0]).toBe('2025-12-29');
    expect(dates[6]).toBe('2026-01-04');
  });

  it('parity filters against the ISO week and is a no-op when absent', () => {
    const entries = [L('always', 0), L('odd', 0, { parity: 'odd' }), L('even', 0, { parity: 'even' })];
    // 2026-03-23 is ISO week 13 — odd
    expect(materializeWeek(entries, '2026-03-23').map((d) => d.entry.id)).toEqual(['always', 'odd']);
    // The next week, 14 — even
    expect(materializeWeek(entries, '2026-03-30').map((d) => d.entry.id)).toEqual(['always', 'even']);
  });

  it('a weeks list filters by ISO week; an EMPTY list is a no-op', () => {
    const entries = [L('in', 0, { weeks: [13] }), L('out', 0, { weeks: [14] }), L('open', 0, { weeks: [] })];
    expect(materializeWeek(entries, '2026-03-23').map((d) => d.entry.id)).toEqual(['in', 'open']);
  });
});
