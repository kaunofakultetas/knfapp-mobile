// -----------------------------------------------------------
//  [*] Tests — components/news/cardDate
//
//  The card's date line: today and yesterday read as the day
//  word — with the time for an app-native post, without it
//  for a scraped article (its stamp is only a day) — and
//  anything older, or from the future, as the long date.
//  Days count on the device calendar, across a DST change.
// -----------------------------------------------------------

jest.mock('@/services/format', () => ({
  parseIso: (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  formatTime: (iso: string) => {
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },
  formatDate: (iso: string) => `LONG(${iso})`,
}));

import type { TFunction } from 'i18next';

import { cardDate } from '@/components/news/cardDate';


// Noon, local calendar — the "now" every case is judged against
const NOW = new Date(2026, 8, 25, 12, 0, 0);







// -----------------------------------------------------------
// t
// -----------------------------------------------------------
//
// The catalog stand-in: the key, with its time interpolation
// visible after a colon.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const t = ((key: string, options?: { time?: string }) => (options?.time ? `${key}:${options.time}` : key)) as unknown as TFunction;







// -----------------------------------------------------------
// at
// -----------------------------------------------------------
//
// A local-calendar stamp as the ISO string a row carries.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const at = (day: number, hours: number, minutes = 0) => new Date(2026, 8, day, hours, minutes).toISOString();


describe('cardDate', () => {
  it('today and yesterday read as the day word with the time on an app-native post', () => {
    expect(cardDate({ date: at(25, 9, 30), source: 'user' }, t, NOW)).toBe('news.todayAt:09:30');
    expect(cardDate({ date: at(24, 18, 5), source: 'faculty' }, t, NOW)).toBe('news.yesterdayAt:18:05');
  });

  it('a scraped article says only the day — its stamp carries no real time', () => {
    expect(cardDate({ date: at(25, 3), source: 'knf.vu.lt' }, t, NOW)).toBe('news.today');
    expect(cardDate({ date: at(24, 3), source: 'vu.lt' }, t, NOW)).toBe('news.yesterday');
  });

  it('older, future and unparseable stamps fall back to the long date', () => {
    expect(cardDate({ date: at(23, 23, 59), source: 'user' }, t, NOW)).toBe(`LONG(${at(23, 23, 59)})`);
    expect(cardDate({ date: at(26, 8), source: 'user' }, t, NOW)).toBe(`LONG(${at(26, 8)})`);
    expect(cardDate({ date: 'vakar', source: 'user' }, t, NOW)).toBe('LONG(vakar)');
  });

  it('counts calendar days, not 24-hour spans — just after midnight is still today', () => {
    const justAfterMidnight = new Date(2026, 8, 25, 0, 5);
    expect(cardDate({ date: at(24, 23, 50), source: 'user' }, t, justAfterMidnight)).toBe('news.yesterdayAt:23:50');
    expect(cardDate({ date: at(25, 0, 1), source: 'user' }, t, justAfterMidnight)).toBe('news.todayAt:00:01');
  });
});
