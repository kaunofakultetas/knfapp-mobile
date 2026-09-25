// -----------------------------------------------------------
//  [*] Tests — applyChanges, the change feed as a PATCH
//
//  A change-feed row reports an edit or an unsend, so it moves
//  only what those change — text and edit stamp (into quotes
//  too), link card, pin, quote — and never paints receipts,
//  status or reactions over the held truth (KNF-093: a backend
//  once shipped "read", [] and [] on every change row).
// -----------------------------------------------------------

import { applyChanges, type ChatMessage } from '../../index';







// -----------------------------------------------------------
// msg
// -----------------------------------------------------------
//
// A held row with overrides — the reducers' only input.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'x', createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [], deleted: false, ...over,
});






describe('applyChanges', () => {
  it('rewrites held rows, blanks unsent ones through their quotes, ignores unknown rows and keeps identity', () => {
    const q = msg({ id: 'q', text: 'senas' });
    const r = msg({ id: 'r', replyTo: { id: 'q', senderId: 'u2', senderName: 'Ona', text: 'senas', deleted: false } });
    const k = msg({ id: 'k' });
    const prev = [r, q, k];
    expect(applyChanges(prev, [])).toBe(prev);
    const next = applyChanges(prev, [msg({ id: 'q', text: 'naujas', editedAt: '2026-08-29T11:00:00Z' }), msg({ id: 'zzz', text: 'unknown' })]);
    expect(next[1].text).toBe('naujas');
    expect(next[2]).toBe(k);
    expect(next.map((m) => m.id)).toEqual(['r', 'q', 'k']);
    // The edit follows into the quote, exactly as a live edit does
    expect(next[0].replyTo?.text).toBe('naujas');
    const gone = applyChanges(next, [msg({ id: 'q', deleted: true, text: '' })]);
    expect(gone[1].deleted).toBe(true);
    expect(gone[0].replyTo?.deleted).toBe(true);
  });

  // KNF-093: the feed is a PATCH. An edited own row arriving with a
  // backend's placeholder status/readBy/reactions (the KNF feed once
  // hard-coded "read", [] and []) must not flip an unread message to
  // the read tick nor wipe a real reaction off the bubble
  it('keeps the held receipts, status and reactions when an edited row arrives', () => {
    const held = msg({
      id: 'own', senderId: 'me', isOwn: true, text: 'labas', status: 'sent', readBy: ['me'],
      reactions: [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }],
    });
    const change = msg({
      id: 'own', senderId: 'me', isOwn: true, text: 'labas!', editedAt: '2026-08-29T11:00:00Z',
      status: 'read', readBy: [], reactions: [],
    });
    const [after] = applyChanges([held], [change]);
    expect(after.text).toBe('labas!');
    expect(after.editedAt).toBe('2026-08-29T11:00:00Z');
    expect(after.status).toBe('sent');
    expect(after.readBy).toEqual(['me']);
    expect(after.reactions).toEqual(held.reactions);
  });

  it('carries the link card and the pin a change row reports, and keeps local media', () => {
    const held = msg({ id: 'p', text: 'https://knf.vu.lt', clientId: 'temp-1', localImageUri: 'file:///x.jpg' });
    const card = { url: 'https://knf.vu.lt', title: 'KNF', description: '', siteName: 'knf.vu.lt' };
    const [after] = applyChanges([held], [msg({ id: 'p', text: 'https://knf.vu.lt', linkPreview: card, pinnedAt: '2026-08-29T12:00:00Z', pinnedBy: 'u2', editedAt: '2026-08-29T11:00:00Z' })]);
    expect(after.linkPreview).toEqual(card);
    expect(after.pinnedAt).toBe('2026-08-29T12:00:00Z');
    expect(after.pinnedBy).toBe('u2');
    expect(after.clientId).toBe('temp-1');
    expect(after.localImageUri).toBe('file:///x.jpg');
  });

  it('a re-delivered change that moves nothing keeps the held object', () => {
    const held = msg({ id: 'same', text: 'jau pakeista', editedAt: '2026-08-29T11:00:00Z' });
    const prev = [held];
    const next = applyChanges(prev, [msg({ id: 'same', text: 'jau pakeista', editedAt: '2026-08-29T11:00:00Z', status: 'read', readBy: ['zz'] })]);
    expect(next).toBe(prev);
  });
});
