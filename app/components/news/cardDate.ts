// -----------------------------------------------------------
//  [*] News — the feed card's date line
//
//  What the burgundy strip on a card says: a post from today
//  or yesterday reads as the day word ("Šiandien, 12:30" /
//  "Vakar, 18:05") — the full "2026 m. rugsėjo 25 d." is a
//  lot of reading for "an hour ago" — and anything older as
//  the long date. Only an app-native post (a member's or the
//  faculty's) shows its time: its stamp is the moment it was
//  posted. A scraped article's stamp is the source's DAY
//  (midnight, or the scrape moment when the page gave none),
//  so it says just "Šiandien" / "Vakar" — never a false
//  "03:00". Days are counted on the device's calendar, the
//  same clock every other date in the app is shown on; a
//  stamp from the future (clock skew) falls back to the long
//  date.
//
//  Used by:
//    - components/news/NewsCard.tsx — the date strip
// -----------------------------------------------------------

import type { TFunction } from 'i18next';

import { formatDate, formatTime, parseIso } from '@/services/format';
import { isScrapedSource } from '@/services/newsText';
import type { NewsPost } from '@/types';


// One calendar day in ms — the day count is rounded, so a DST
// change (a 23 or 25 hour day) still counts as one
const DAY_MS = 24 * 60 * 60 * 1000;







// -----------------------------------------------------------
// cardDate
// -----------------------------------------------------------
//
//   cardDate(post, t)            — against the real clock
//   cardDate(post, t, frozenNow) — tests
//
// Unparseable stamps come back as formatDate does (the raw
// value), never a crash in a list row.
//
// Used by:
//   - components/news/NewsCard.tsx — the date strip
//   - __tests__/newsCardDate.test.ts
// -----------------------------------------------------------

export function cardDate(post: Pick<NewsPost, 'date' | 'source'>, t: TFunction, now: Date = new Date()): string {

  const date = parseIso(post.date);
  if (!date) return formatDate(post.date);


  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (days !== 0 && days !== 1) return formatDate(post.date);


  if (isScrapedSource(post)) return t(days === 0 ? 'news.today' : 'news.yesterday');
  return t(days === 0 ? 'news.todayAt' : 'news.yesterdayAt', { time: formatTime(post.date) });
}
