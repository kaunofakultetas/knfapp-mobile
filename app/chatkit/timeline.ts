// -----------------------------------------------------------
//  [*] chatkit — timeline
//
//  Turns a newest-first message array into the rows the list
//  renders: messages annotated with their place in a run of
//  consecutive same-sender messages (so bubbles can tighten
//  and only the run's edges carry the sender name, avatar and
//  receipt), plus a time separator wherever the conversation
//  pauses — a calendar-day change or a silence longer than
//  SEPARATOR_GAP_MS — labelled "Today 15:30" the way iMessage
//  stamps its gaps.
//
//  Runs break on a sender change, on a gap longer than
//  GROUP_GAP_MS, at a separator and on either side of an
//  unsent message.
//
//  The array stays newest-first because the native list is
//  inverted; a separator row is emitted right AFTER the
//  oldest message it introduces, which the inverted list draws
//  above it (and the web branch, which reverses the array,
//  draws before it).
//
//  Split into:
//
//    parseStamp        — zone-safe Date from a backend stamp
//    GROUP_GAP_MS      — the run-breaking silence
//    SEPARATOR_GAP_MS  — the stamp-worthy silence
//    dayKey            — calendar-day identity of an ISO stamp
//    dayLabel          — Today / Yesterday / weekday / date
//    buildTimeline     — the rows
// -----------------------------------------------------------

import type { GroupPosition, KitMessage, TimelineItem } from './types';


// Consecutive messages from one sender closer than this form a
// visual run (Messenger uses about a minute, iMessage longer)
export const GROUP_GAP_MS = 3 * 60_000;

// A silence longer than this earns a centered time stamp
export const SEPARATOR_GAP_MS = 60 * 60_000;

// Zoneless backend stamps are UTC — same rule as services/format
const HAS_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
export function parseStamp(iso: string): Date | null {
  const normalized = iso.includes('T') && !HAS_ZONE_RE.test(iso) ? iso + 'Z' : iso;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
const parse = parseStamp;

const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;


export interface TimelineLabels {
  today: string;
  yesterday: string;
  // Locale tag for weekday / date formatting, e.g. 'lt-LT'
  locale: string;
}







// -----------------------------------------------------------
// dayKey
// -----------------------------------------------------------
//
// Local calendar day of a timestamp as "YYYY-M-D"; an
// unparseable stamp gets its own bucket so it never merges.
//
// Used by:
//   - buildTimeline (below)
// -----------------------------------------------------------

export function dayKey(iso: string): string {
  const date = parse(iso);
  return date ? localDayKey(date) : `invalid:${iso}`;
}







// -----------------------------------------------------------
// dayLabel
// -----------------------------------------------------------
//
//   dayLabel(iso, labels)  — "Today" / "Yesterday" / weekday
//                             within the last week / short date
//
// Used by:
//   - buildTimeline (below)
// -----------------------------------------------------------

export function dayLabel(iso: string, labels: TimelineLabels, now = new Date()): string {
  const date = parse(iso);
  if (!date) return '';

  const key = localDayKey(date);
  if (key === localDayKey(now)) return labels.today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return labels.yesterday;

  const ageMs = now.getTime() - date.getTime();
  if (ageMs > 0 && ageMs < 6 * 24 * 60 * 60_000) {
    const weekday = date.toLocaleDateString(labels.locale, { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(labels.locale, {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}







// -----------------------------------------------------------
// timeLabel
// -----------------------------------------------------------
//
// HH:MM for a separator, in the device zone.
//
// Used by:
//   - buildTimeline (below)
// -----------------------------------------------------------

function timeLabel(iso: string, locale: string): string {
  const date = parse(iso);
  if (!date) return '';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}







// -----------------------------------------------------------
// buildTimeline
// -----------------------------------------------------------
//
//   buildTimeline(messagesNewestFirst, labels) → TimelineItem[]
//
// Pure and cheap (one pass); the screen memoizes it on the
// message array.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — feeds MessageList
// -----------------------------------------------------------

export function buildTimeline(messages: KitMessage[], labels: TimelineLabels): TimelineItem[] {

  const items: TimelineItem[] = [];


  const stamp = (m: KitMessage) => parse(m.createdAt)?.getTime() ?? 0;

  // A separator sits between two messages when the day changes
  // or the older one is more than an hour behind
  const separated = (newer: KitMessage, older: KitMessage) =>
    dayKey(newer.createdAt) !== dayKey(older.createdAt) || stamp(newer) - stamp(older) > SEPARATOR_GAP_MS;

  // Two messages belong to one run when the same person sent
  // both within the gap, with no separator between, and neither
  // was unsent
  const sameRun = (newer: KitMessage | undefined, older: KitMessage | undefined) => {
    if (!newer || !older) return false;
    if (newer.senderId !== older.senderId || newer.deleted || older.deleted) return false;
    if (separated(newer, older)) return false;
    return Math.abs(stamp(newer) - stamp(older)) <= GROUP_GAP_MS;
  };


  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const newer = messages[i - 1];   // rendered below (later in time)
    const older = messages[i + 1];   // rendered above (earlier in time)

    const joinsNewer = sameRun(newer, message);
    const joinsOlder = sameRun(message, older);

    // In reading order (oldest → newest) the run's first bubble
    // is the one whose OLDER neighbour is not in the run
    let position: GroupPosition = 'single';
    if (joinsOlder && joinsNewer) position = 'middle';
    else if (joinsOlder) position = 'last';
    else if (joinsNewer) position = 'first';

    items.push({ type: 'message', key: message.id, message, position });

    // Stamp before the oldest message of a stretch
    if (!older || separated(message, older)) {
      items.push({
        type: 'separator',
        key: `sep-${message.id}`,
        day: dayLabel(message.createdAt, labels),
        time: timeLabel(message.createdAt, labels.locale),
      });
    }
  }


  return items;
}
