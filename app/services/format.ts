// -----------------------------------------------------------
//  [*] Format — dates and times in the active language
//
//  The one place ISO timestamps become display text. The
//  locale follows the active i18n language (lt-LT / en-GB),
//  never a hardcoded one, and every function returns its input
//  unchanged when the value doesn't parse — a bad timestamp
//  renders as-is instead of crashing a list row, and a value
//  that is not a string at all (a null the API sent for a
//  field typed as a string) renders as nothing.
//
//  Backend timestamps are naive UTC (datetime.utcnow()
//  .isoformat(), no 'Z') — new Date() would read those as
//  LOCAL time and shift everything by the UTC offset, so
//  zoneless date-times are explicitly marked UTC before
//  parsing. The server-formatted `time` field on message
//  payloads has exactly that defect baked in: screens must
//  ignore it and run createdAt through formatTime instead.
//
//  Split into:
//
//    parseIso          — zone-safe Date (delegates to chatuikit)
//    activeLocale      — i18n language → BCP 47 locale
//    formatDate        — long date
//    formatTime        — HH:MM local time
//    formatDateTime    — long date + time
//    formatRelative    — "ką tik / 5 min / 3 val." style age
//    formatRelativeAgo — the same as a phrase: "prieš 5 min"
//    foldForSearch     — diacritic-stripping search fold
// -----------------------------------------------------------

// Active language + the network.* relative-time strings
import i18n from '@/i18n';

// ONE zoneless-UTC rule for the whole app — the kit's parser
// owns it and this module delegates instead of duplicating
import { parseStamp } from '@knf/chatuikit';


// Intl.DateTimeFormat construction is expensive and list rows
// format on every render — one instance per locale + options
// shape, reused for the life of the app
const formatterCache = new Map<string, Intl.DateTimeFormat>();







// -----------------------------------------------------------
// cachedFormatter
// -----------------------------------------------------------
//
// The memoized Intl.DateTimeFormat lookup over formatterCache
// — the key is the locale plus the options shape.
//
// Used by:
//   - formatDate, formatTime, formatDateTime (below)
// -----------------------------------------------------------

function cachedFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}







// -----------------------------------------------------------
// parseIso
// -----------------------------------------------------------
//
// null instead of Invalid Date (and for a non-string input),
// so callers can fall back to returning the raw input. The
// one zoneless-UTC rule lives in the chat kit's parseStamp
// (normalizeStamp: SQLite's space form to 'T', a zoneless
// stamp read as UTC, microseconds cut to milliseconds) — this
// only adds the non-string guard, so the app and the chat
// packages can never disagree about a stamp again.
//
// Used by:
//   - the formatters below
// -----------------------------------------------------------

export function parseIso(iso: string): Date | null {
  if (typeof iso !== 'string') return null;
  return parseStamp(iso);
}







// -----------------------------------------------------------
// activeLocale
// -----------------------------------------------------------
//
// Only two locales exist because only two app languages do;
// en-GB keeps dates day-first and clocks 24-hour, matching
// Lithuanian conventions.
//
// Used by:
//   - formatDate / formatTime / formatDateTime (below)
// -----------------------------------------------------------

export function activeLocale(): string {
  return i18n.language === 'lt' ? 'lt-LT' : 'en-GB';
}







// -----------------------------------------------------------
// formatDate
// -----------------------------------------------------------
//
// Long form: "2026 m. rugpjūčio 26 d." / "26 August 2026".
//
// Used by:
//   - app/(main)/tabs/news.tsx — article dates
//   - app/(main)/news-post — article header
//   - app/(main)/profile — member-since lines
// -----------------------------------------------------------

export function formatDate(iso: string): string {
  const date = parseIso(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  return cachedFormatter(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}







// -----------------------------------------------------------
// formatTime
// -----------------------------------------------------------
//
// HH:MM in the device timezone — the replacement for the
// backend's UTC-preformatted `time` field.
//
// Used by:
//   - chatuikit/MessageBubble — revealed message times
//   - components/chat/ConversationRow — last-message times
// -----------------------------------------------------------

export function formatTime(iso: string): string {
  const date = parseIso(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  return cachedFormatter(activeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}







// -----------------------------------------------------------
// formatDateTime
// -----------------------------------------------------------
//
// formatDate plus a 24-hour clock in the device timezone:
// "2026 m. rugpjūčio 26 d. 14:05" / "26 August 2026, 14:05".
//
// Used by:
//   - app/(main)/admin — invitation expiry lines
//   - app/(main)/news-comments — comment timestamps
// -----------------------------------------------------------

export function formatDateTime(iso: string): string {
  const date = parseIso(iso);
  if (!date) return typeof iso === 'string' ? iso : '';

  return cachedFormatter(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}







// -----------------------------------------------------------
// formatRelative
// -----------------------------------------------------------
//
// Compact age of an ms-epoch instant via the network.* keys:
// under a minute "ką tik", then minutes, hours, days. Future
// instants (clock skew) clamp to "ką tik"; a non-finite input
// degrades to an empty string — no timestamp beats rendering
// "NaN" in a list row.
//
// Used by:
//   - components/chat/ConversationRow — relative last activity
//   - formatRelativeAgo (below) — the phrase form
// -----------------------------------------------------------

export function formatRelative(msEpoch: number): string {
  if (!Number.isFinite(msEpoch)) return '';


  const elapsed = Math.max(0, Date.now() - msEpoch);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return i18n.t('network.justNow');
  if (minutes < 60) return i18n.t('network.minutesShort', { count: minutes });


  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('network.hoursShort', { count: hours });


  return i18n.t('network.daysShort', { count: Math.floor(hours / 24) });
}







// -----------------------------------------------------------
// formatRelativeAgo
// -----------------------------------------------------------
//
// formatRelative as a proper phrase — "prieš 5 min" / "5 min
// ago" — for prose-like lines; the sub-minute "ką tik" already
// reads as a phrase and stays unwrapped, and a non-finite
// input degrades to an empty string the same way.
//
// Used by:
//   - components/CachedBanner.tsx — "Atnaujinta prieš 5 min"
// -----------------------------------------------------------

export function formatRelativeAgo(msEpoch: number): string {
  if (!Number.isFinite(msEpoch)) return '';


  const elapsed = Math.max(0, Date.now() - msEpoch);
  if (elapsed < 60000) return i18n.t('network.justNow');


  return i18n.t('network.ago', { time: formatRelative(msEpoch) });
}







// -----------------------------------------------------------
// foldForSearch
// -----------------------------------------------------------
//
// Fold away case and diacritics so "rysiai" finds "Ryšiai" —
// NFD splits the marks off the letters, the regex strips them.
// Apply to BOTH the query and the haystack.
//
// Used by:
//   - app/(main)/tabs/map.tsx — room search
//   - app/(main)/tabs/messages.tsx — conversation filter
// -----------------------------------------------------------

export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
