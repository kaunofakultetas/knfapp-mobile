// -----------------------------------------------------------
//  [*] Tests — week buckets and the dated edge
//
//  Date math runs on UTC strings, so the EET DST Sundays in
//  late March and late October — mid-semester — must come out
//  as seven consecutive dates like any other week. The one
//  wall-clock read, todayISO, answers the LOCAL date: east of
//  UTC, late Sunday evening UTC is already Monday.
// -----------------------------------------------------------

import { dayIndexOf, buildWeek, isoWeekNumber, materializeWeek, mondayOf, toISO, todayISO, visibleDays } from '../week';
import type { TimetableEntry } from '../types';


// The jest sandbox hands every test file a COPY of process.env,
// so a plain `process.env.TZ = …` never reaches V8's clock. The
// real process, reached through the main context, does — Node
// re-reads TZ on every assignment — and it is restored after
const realProcess = (): NodeJS.Process => (require('vm') as typeof import('vm')).runInThisContext('process') as NodeJS.Process;
function withTimeZone(tz: string, run: () => void): void {
  const real = realProcess();
  const before = real.env.TZ;
  real.env.TZ = tz;
  try {
    run();
  } finally {
    if (before === undefined) delete real.env.TZ;
    else real.env.TZ = before;
  }
}

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

describe('dayIndexOf', () => {
  it('maps JS Sunday-first days onto the 0=Monday timetable week', () => {
    expect(dayIndexOf(new Date(2026, 8, 14))).toBe(0); // Monday
    expect(dayIndexOf(new Date(2026, 8, 12))).toBe(5); // Saturday
    expect(dayIndexOf(new Date(2026, 8, 13))).toBe(6); // Sunday
  });
});


describe('the New Year seam', () => {
  it('mondayOf crosses back into the old year', () => {
    // 2027-01-01 is a Friday — its week began in 2026
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });

  it('isoWeekNumber follows ISO 8601 at the year boundary, not the calendar year', () => {
    // ISO week 1 is the week holding January 4th: the last days
    // of December can be week 1 of NEXT year, and a year whose
    // last Thursday falls on Dec 31 keeps a week 53
    expect(isoWeekNumber('2025-12-29')).toBe(1);  // Monday of 2026's week 1
    expect(isoWeekNumber('2026-01-04')).toBe(1);  // Sunday closing it
    expect(isoWeekNumber('2026-12-28')).toBe(53); // 2026 runs 53 weeks
    expect(isoWeekNumber('2027-01-04')).toBe(1);  // the Monday after
  });
});


describe('todayISO', () => {
  // Sunday 2026-09-20 21:30 UTC — already Monday 00:30 in Vilnius
  const lateSundayUtc = new Date(Date.UTC(2026, 8, 20, 21, 30));

  it('answers the LOCAL calendar date — east of UTC it is already Monday while the UTC date says Sunday', () => {
    withTimeZone('Europe/Vilnius', () => {
      expect(todayISO(lateSundayUtc)).toBe('2026-09-21');
      // The seam that put the screen on last week: the UTC date
      expect(toISO(lateSundayUtc.getTime())).toBe('2026-09-20');
      expect(mondayOf(todayISO(lateSundayUtc))).toBe('2026-09-21');
    });
  });

  it('agrees with the UTC date under UTC', () => {
    withTimeZone('UTC', () => {
      expect(todayISO(lateSundayUtc)).toBe('2026-09-20');
    });
  });

  it('zero-pads and defaults to now', () => {
    withTimeZone('UTC', () => {
      expect(todayISO(new Date(Date.UTC(2027, 0, 5, 12)))).toBe('2027-01-05');
    });
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
