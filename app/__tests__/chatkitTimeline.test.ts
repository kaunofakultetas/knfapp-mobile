// -----------------------------------------------------------
//  [*] Tests — chatkit timeline
//
//  buildTimeline is the kit's one piece of logic: run grouping
//  and day separators over a newest-first array. These pin the
//  rules — same sender within the gap groups, a sender change,
//  a long silence, a day change or an unsent message breaks
//  the run, and every day / hour-long pause ends (in array
//  order) with its time separator.
// -----------------------------------------------------------

import { buildTimeline, dayKey, dayLabel, GROUP_GAP_MS, parseStamp, SEPARATOR_GAP_MS } from '@knf/chatkit/core/timeline';
import type { KitMessage } from '@knf/chatkit';
import type { ChatMessage } from '@/types';


const LABELS = { today: 'Today', yesterday: 'Yesterday', locale: 'en-GB' };
const BASE = Date.UTC(2026, 7, 27, 10, 0, 0);

function message(id: string, senderId: string, offsetMs: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    conversationId: 'c',
    senderId,
    senderName: senderId,
    text: id,
    createdAt: new Date(BASE + offsetMs).toISOString(),
    isOwn: senderId === 'me',
    status: 'sent',
    reactions: [],
    ...extra,
  };
}

const positions = (items: ReturnType<typeof buildTimeline>) =>
  items.filter((row) => row.type === 'message').map((row) => (row.type === 'message' ? row.position : ''));


describe('buildTimeline', () => {

  it('groups consecutive same-sender messages within the gap', () => {
    // Newest first: c (2 min), b (1 min), a (0)
    const items = buildTimeline(
      [message('c', 'me', 120_000), message('b', 'me', 60_000), message('a', 'me', 0)],
      LABELS,
    );
    expect(positions(items)).toEqual(['last', 'middle', 'first']);
  });


  it('breaks a run on a sender change and on a long silence', () => {
    const items = buildTimeline(
      [
        message('d', 'me', GROUP_GAP_MS * 3),
        message('c', 'me', GROUP_GAP_MS + 60_000),
        message('b', 'them', 60_000),
        message('a', 'me', 0),
      ],
      LABELS,
    );
    expect(positions(items)).toEqual(['single', 'single', 'single', 'single']);
  });


  it('keeps an unsent message out of any run', () => {
    const items = buildTimeline(
      [message('c', 'me', 20_000), message('b', 'me', 10_000, { deleted: true }), message('a', 'me', 0)],
      LABELS,
    );
    expect(positions(items)).toEqual(['single', 'single', 'single']);
  });


  it('emits one separator after the oldest message of each day', () => {
    const yesterday = -24 * 60 * 60_000;
    const items = buildTimeline(
      [message('c', 'me', 60_000), message('b', 'me', 0), message('a', 'them', yesterday)],
      LABELS,
    );
    const kinds = items.map((row) => (row.type === 'message' ? row.message.id : row.type === 'separator' ? 'sep' : 'unread'));
    expect(kinds).toEqual(['c', 'b', 'sep', 'a', 'sep']);
    const seps = items.filter((row) => row.type === 'separator');
    expect(seps).toHaveLength(2);
    expect(seps[0].key).not.toEqual(seps[1].key);
    expect(seps[0].type === 'separator' && seps[0].time).toMatch(/^\d{2}:\d{2}$/);
  });


  it('stamps an hour-long pause inside one day and breaks the run there', () => {
    const items = buildTimeline(
      [message('b', 'me', SEPARATOR_GAP_MS + 60_000), message('a', 'me', 0)],
      LABELS,
    );
    const kinds = items.map((row) => (row.type === 'message' ? row.message.id : row.type === 'separator' ? 'sep' : 'unread'));
    expect(kinds).toEqual(['b', 'sep', 'a', 'sep']);
    expect(positions(items)).toEqual(['single', 'single']);
  });


  it('handles an empty conversation', () => {
    expect(buildTimeline([], LABELS)).toEqual([]);
  });


  it('gives an unparseable stamp its own bucket and no blank separator', () => {
    const items = buildTimeline(
      [message('b', 'me', 60_000, { createdAt: 'not-a-date' }), message('a', 'me', 0)],
      LABELS,
    );
    // The invalid stamp breaks the run (its day never merges) but
    // must not emit an empty separator row above itself
    const kinds = items.map((row) => (row.type === 'message' ? row.message.id : row.type === 'separator' ? 'sep' : 'unread'));
    expect(kinds).toEqual(['b', 'a', 'sep']);
    expect(positions(items)).toEqual(['single', 'single']);
  });


  it('suppresses the stamp at the paging edge while older history exists', () => {
    const rows = (hasMore: boolean) =>
      buildTimeline([message('b', 'me', 60_000), message('a', 'me', 0)], LABELS, hasMore)
        .map((row) => (row.type === 'message' ? row.message.id : row.type === 'separator' ? 'sep' : 'unread'));
    expect(rows(true)).toEqual(['b', 'a']);
    expect(rows(false)).toEqual(['b', 'a', 'sep']);
  });

});


describe('dayLabel', () => {

  it('names today, yesterday, a recent weekday and an older date', () => {
    const now = new Date(2026, 7, 27, 12, 0, 0);
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 24 * 60 * 60_000).toISOString();
    expect(dayLabel(at(0), LABELS, now)).toBe('Today');
    expect(dayLabel(at(1), LABELS, now)).toBe('Yesterday');
    expect(dayLabel(at(3), LABELS, now)).toBe('Monday');
    expect(dayLabel(at(30), LABELS, now)).toBe('28 July');
    expect(dayLabel(at(400), LABELS, now)).toBe('23 July 2025');
  });

});


describe('dayKey', () => {

  it('treats zoneless backend stamps as UTC', () => {
    expect(dayKey('2026-08-27T10:00:00')).toEqual(dayKey('2026-08-27T10:00:00Z'));
  });

  it('buckets SQLite space-separated stamps with their T-form twin', () => {
    expect(dayKey('2026-08-27 10:00:00')).toEqual(dayKey('2026-08-27T10:00:00Z'));
  });

  it('gives unparseable stamps their own buckets', () => {
    expect(dayKey('not-a-date')).not.toEqual(dayKey('also-not-a-date'));
    expect(dayKey('not-a-date')).not.toEqual(dayKey('2026-08-27T10:00:00Z'));
  });

});


// The kit's parser is THE zoneless-UTC rule for the whole app —
// services/format delegates here, so every accepted stamp shape
// is pinned in this one suite
describe('parseStamp', () => {

  it('treats zoneless T-form stamps as UTC', () => {
    expect(parseStamp('2026-08-27T10:05:00')?.getTime()).toBe(Date.UTC(2026, 7, 27, 10, 5, 0));
  });

  it('normalizes SQLite space-form stamps to the same UTC instant', () => {
    expect(parseStamp('2026-08-27 10:05:00')?.getTime()).toBe(Date.UTC(2026, 7, 27, 10, 5, 0));
  });

  it('keeps explicit offsets', () => {
    expect(parseStamp('2026-08-27T10:05:00+03:00')?.getTime()).toBe(Date.UTC(2026, 7, 27, 7, 5, 0));
  });

  it('returns null for garbage', () => {
    expect(parseStamp('not-a-date')).toBeNull();
    expect(parseStamp('')).toBeNull();
  });

});


// -----------------------------------------------------------
// Stage-1 additions: system rows, the unread line
// -----------------------------------------------------------

describe('buildTimeline — system rows and the unread line', () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const msg = (id: string, senderId: string, minutesAgo: number, extra: Partial<KitMessage> = {}): KitMessage => ({
    id, senderId, senderName: senderId, text: id, createdAt: at(minutesAgo), isOwn: false, status: 'sent', reactions: [], ...extra,
  });

  it('never folds a system row into a run', () => {
    const items = buildTimeline(
      [msg('c', 'ona', 0), msg('sys', 'ona', 1, { kind: 'system', text: 'Ona joined' }), msg('a', 'ona', 2)],
      LABELS,
    );
    const positions = items.flatMap((row) => (row.type === 'message' ? [[row.message.id, row.position]] : []));
    expect(positions).toEqual([['c', 'single'], ['sys', 'single'], ['a', 'single']]);
  });

  it('places the unread line right above the first unread message', () => {
    const items = buildTimeline([msg('c', 'ona', 0), msg('b', 'ona', 1), msg('a', 'ona', 2)], LABELS, false, {
      unreadFromId: 'b',
      unreadCount: 2,
    });
    const kinds = items.map((row) => (row.type === 'message' ? row.message.id : row.type === 'separator' ? 'sep' : 'unread'));
    // newest-first: the line follows 'b' in the array, i.e. sits above it on screen
    expect(kinds.slice(0, 3)).toEqual(['c', 'b', 'unread']);
    const unread = items.find((row) => row.type === 'unread');
    expect(unread && unread.type === 'unread' ? unread.count : null).toBe(2);
  });
});
