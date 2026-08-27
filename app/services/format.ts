// -----------------------------------------------------------
//  [*] Format — dates and times in the active language
//
//  The one place ISO timestamps become display text. The
//  locale follows the active i18n language (lt-LT / en-GB),
//  never a hardcoded one, and every function returns its input
//  unchanged when the value doesn't parse — a bad timestamp
//  renders as-is instead of crashing a list row.
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
//    activeLocale   — i18n language → BCP 47 locale
//    formatDate     — long date
//    formatTime     — HH:MM local time
//    formatDateTime — long date + time
//    formatRelative — "ką tik / 5 min / 3 val." style age
// -----------------------------------------------------------

// Active language + the network.* relative-time strings
import i18n from '@/i18n';


// Backend timestamps carry no zone marker — treat them as the
// UTC they are; anything already zoned parses untouched
const HAS_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

// null instead of Invalid Date, so callers can fall back to
// returning the raw input
function parseIso(iso: string): Date | null {
  const normalized = iso.includes('T') && !HAS_ZONE_RE.test(iso) ? iso + 'Z' : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
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
  if (!date) return iso;

  return date.toLocaleDateString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}







// -----------------------------------------------------------
// formatTime
// -----------------------------------------------------------
//
// HH:MM in the device timezone — the replacement for the
// backend's UTC-preformatted `time` field.
//
// Used by:
//   - chatkit/MessageBubble — revealed message times
//   - components/chat/ConversationRow — last-message times
// -----------------------------------------------------------

export function formatTime(iso: string): string {
  const date = parseIso(iso);
  if (!date) return iso;

  return date.toLocaleTimeString(activeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}







// -----------------------------------------------------------
// formatDateTime
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/admin — invitation expiry lines
//   - app/(main)/news-comments — comment timestamps
// -----------------------------------------------------------

export function formatDateTime(iso: string): string {
  const date = parseIso(iso);
  if (!date) return iso;

  return date.toLocaleString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}







// -----------------------------------------------------------
// formatRelative
// -----------------------------------------------------------
//
// Compact age of an ms-epoch instant via the network.* keys:
// under a minute "ką tik", then minutes, hours, days. Future
// instants (clock skew) clamp to "ką tik"; a non-finite input
// comes back stringified rather than throwing.
//
// Used by:
//   - components/CachedBanner.tsx — cache age line
//   - components/chat/ConversationRow — relative last activity
// -----------------------------------------------------------

export function formatRelative(msEpoch: number): string {
  if (!Number.isFinite(msEpoch)) return String(msEpoch);


  const elapsed = Math.max(0, Date.now() - msEpoch);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return i18n.t('network.justNow');
  if (minutes < 60) return i18n.t('network.minutesShort', { count: minutes });


  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18n.t('network.hoursShort', { count: hours });


  return i18n.t('network.daysShort', { count: Math.floor(hours / 24) });
}
