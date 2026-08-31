// -----------------------------------------------------------
//  [*] Tests — the reducers against the classic breakage
//
//  Server-side sins production chat clients all defend
//  against eventually: a page carrying the same id twice
//  (duplicate React keys crash the list), overlapping OFFSET
//  windows between pages, receipts and change rows for
//  messages the client never held, and stamps from a skewed
//  clock.
// -----------------------------------------------------------

import { appendOlderPage, applyChanges, applyReceipt, mergeFirstPage, olderCursor } from '../reducers';
import type { ChatMessage } from '../types';

const row = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: '2026-08-27T10:00:00Z',
  isOwn: false, status: 'read', reactions: [], deleted: false, ...over,
});
const unique = (list: readonly ChatMessage[]) => new Set(list.map((m) => m.id)).size === list.length;

describe('reducers hardening', () => {
  it('a page carrying the same id twice never doubles a list key', () => {
    const dupPage = [row('a', { text: 'first copy' }), row('b'), row('a', { text: 'second copy' })];
    const merged = mergeFirstPage([], dupPage, [], 'c1');
    expect(unique(merged)).toBe(true);
    // The newer copy (the later row — the server's final word) wins
    expect(merged.find((m) => m.id === 'a')?.text).toBe('second copy');
  });

  it('overlapping pagination windows dedupe on append', () => {
    const held = [row('c'), row('b')];
    const olderPage = [row('b', { text: 'again' }), row('a')];
    const appended = appendOlderPage(held, olderPage);
    expect(unique(appended)).toBe(true);
    expect(appended.map((m) => m.id)).toContain('a');
  });

  it('a receipt for ids the client never held changes nothing — identity included', () => {
    const held = [row('mine', { isOwn: true, status: 'sent' })];
    const next = applyReceipt(held, 'reader', ['ghost-1', 'ghost-2'], 3);
    expect(next).toBe(held);
  });

  it('a change row for a message not held is ignored', () => {
    const held = [row('a')];
    const next = applyChanges(held, [row('ghost', { text: 'edited elsewhere' })]);
    expect(next.map((m) => m.id)).toEqual(['a']);
  });

  it('a future-stamped row (skewed clock) still yields a sane older-cursor', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const held = [row('skewed', { createdAt: future }), row('old', { createdAt: '2026-08-27T09:00:00Z' })];
    const cursor = olderCursor(held);
    expect(cursor?.id).toBe('old');
  });
});
