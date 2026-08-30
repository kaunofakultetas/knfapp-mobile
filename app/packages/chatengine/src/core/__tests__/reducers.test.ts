// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine reducers
//
//  The pure transitions a conversation's newest-first list goes
//  through, pinned directly: echo adoption (nonce and content
//  fallback), the first-page merge over live rows and the
//  outbox, the resync merge and fresh-head restart, older-page
//  append, unsend / edit (quotes included) and its revert,
//  reaction membership rewrites, receipt promotion.
// -----------------------------------------------------------

import {
  TEMP_ID_PREFIX,
  adoptTemp,
  appendOlderPage,
  applyReceipt,
  findTempFor,
  markDeleted,
  markEdited,
  mergeFirstPage,
  mergeResyncPage,
  normalizeForViewer,
  olderCursor,
  parseStamp,
  restoreDeleted,
  withSelfReaction,
  type ChatMessage,
} from '../../index';


const iso = (minute: number) => new Date(Date.UTC(2026, 7, 29, 10, minute, 0)).toISOString();

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u1',
  senderName: 'Me',
  text: 'labas',
  createdAt: iso(0),
  isOwn: true,
  status: 'sent',
  reactions: [],
  deleted: false,
  ...over,
});
const temp = (n: number, over: Partial<ChatMessage> = {}) => msg({ id: `${TEMP_ID_PREFIX}${n}`, clientId: `${TEMP_ID_PREFIX}${n}`, status: 'sending', ...over });
const ids = (list: ChatMessage[]) => list.map((m) => m.id);


describe('parseStamp', () => {
  it('reads zoned and bare (UTC) stamps, answers null otherwise', () => {
    expect(parseStamp('2026-08-29T10:00:00Z')?.toISOString()).toBe('2026-08-29T10:00:00.000Z');
    expect(parseStamp('2026-08-29T10:00:00.123456')?.toISOString()).toBe('2026-08-29T10:00:00.123Z');
    expect(parseStamp('2026-08-29 10:00:00')?.toISOString()).toBe('2026-08-29T10:00:00.000Z');
    expect(parseStamp('nonsense')).toBeNull();
    expect(parseStamp('')).toBeNull();
    expect(parseStamp(undefined)).toBeNull();
  });
});


describe('normalizeForViewer', () => {
  it('derives isOwn and bySelf from the viewer and defaults the status', () => {
    const row = normalizeForViewer(msg({ isOwn: false, status: undefined as never, reactions: [{ emoji: '👍', count: 0, bySelf: false, byUserIds: ['u1', 'u2'] }] }), 'u1');
    expect(row.isOwn).toBe(true);
    expect(row.status).toBe('sent');
    expect(row.reactions[0]).toEqual({ emoji: '👍', count: 2, bySelf: true, byUserIds: ['u1', 'u2'] });
    expect(normalizeForViewer(msg({ senderId: 'u2', status: undefined as never }), 'u1').status).toBe('read');
  });
});


describe('findTempFor / adoptTemp', () => {
  it('matches by the echoed clientId nonce, or nothing', () => {
    const list = [temp(2), temp(1)];
    expect(findTempFor(list, msg({ id: 's1', clientId: `${TEMP_ID_PREFIX}1` }))).toBe(1);
    expect(findTempFor(list, msg({ id: 's1', clientId: 'temp-gone' }))).toBe(-1);
  });

  it('falls back to content — text, image and reply target — preferring the newest temp', () => {
    const list = [temp(3, { text: 'a', replyTo: { id: 'q', senderId: 'u2', senderName: 'O', text: 'x', deleted: false } }), temp(2, { text: 'a' }), temp(1, { text: 'a' })];
    expect(findTempFor(list, msg({ id: 's1', text: 'a' }))).toBe(1);
    expect(findTempFor(list, msg({ id: 's1', text: 'a', replyTo: { id: 'q', senderId: 'u2', senderName: 'O', text: 'x', deleted: false } }))).toBe(0);
    expect(findTempFor(list, msg({ id: 's1', text: 'b' }))).toBe(-1);
    expect(findTempFor(list, msg({ id: 's1', text: 'a', imageUrl: '/api/uploads/p.jpg' }))).toBe(-1);
  });

  it('adoption keeps the temp key and local media', () => {
    const adopted = adoptTemp(
      msg({ id: 's1', video: { uri: '/api/uploads/v.mp4' } }),
      temp(1, { localImageUri: 'file:///a.jpg', video: { uri: 'file:///v.mp4', localThumbnailUri: 'file:///t.jpg' } }),
    );
    expect(adopted.id).toBe('s1');
    expect(adopted.clientId).toBe(`${TEMP_ID_PREFIX}1`);
    expect(adopted.localImageUri).toBe('file:///a.jpg');
    expect(adopted.video).toEqual({ uri: '/api/uploads/v.mp4', localThumbnailUri: 'file:///t.jpg' });
  });
});


describe('mergeFirstPage', () => {
  it('keeps live rows and temps on top, drops a temp the page committed, restores the outbox', () => {
    const page = [msg({ id: 's2', clientId: `${TEMP_ID_PREFIX}2` }), msg({ id: 's1' })];
    const prev = [temp(3), temp(2), msg({ id: 'live', senderId: 'u2', isOwn: false }), msg({ id: 'foreign', conversationId: 'other' })];
    const outbox = [temp(9, { status: 'failed' }), temp(3, { status: 'failed' })];
    expect(ids(mergeFirstPage(prev, page, outbox, 'c1'))).toEqual([`${TEMP_ID_PREFIX}9`, `${TEMP_ID_PREFIX}3`, 'live', 's2', 's1']);
  });
});


describe('mergeResyncPage', () => {
  it('merges an overlapping page by id and re-sorts by stamp, temps pinned newest', () => {
    const prev = [temp(1), msg({ id: 's3', createdAt: iso(3) }), msg({ id: 's1', createdAt: iso(1) })];
    // Foreign rows — an OWN row with the temp's text would adopt it (covered below)
    const page = [msg({ id: 's4', createdAt: iso(4), isOwn: false }), msg({ id: 's3', createdAt: iso(3), text: 'server', isOwn: false }), msg({ id: 's2', createdAt: iso(2), isOwn: false })];
    const { list, freshHead } = mergeResyncPage(prev, page, true);
    expect(freshHead).toBe(false);
    expect(ids(list)).toEqual([`${TEMP_ID_PREFIX}1`, 's4', 's3', 's2', 's1']);
    expect(list[2].text).toBe('server');
  });

  it('adopts an own row into its temp during the merge', () => {
    const prev = [temp(1, { text: 'x' }), msg({ id: 's1', createdAt: iso(1) })];
    const page = [msg({ id: 's2', clientId: `${TEMP_ID_PREFIX}1`, text: 'x', createdAt: iso(2) }), msg({ id: 's1', createdAt: iso(1) })];
    const { list } = mergeResyncPage(prev, page, false);
    expect(ids(list)).toEqual(['s2', 's1']);
    expect(list[0].clientId).toBe(`${TEMP_ID_PREFIX}1`);
  });

  it('restarts from a fresh head when the page shares nothing and there is more', () => {
    const prev = [temp(1), msg({ id: 'old2', createdAt: iso(2) }), msg({ id: 'old1', createdAt: iso(1) })];
    const page = [msg({ id: 'n9', createdAt: iso(9), isOwn: false }), msg({ id: 'n8', createdAt: iso(8), isOwn: false })];
    const { list, freshHead } = mergeResyncPage(prev, page, true);
    expect(freshHead).toBe(true);
    expect(ids(list)).toEqual([`${TEMP_ID_PREFIX}1`, 'n9', 'n8']);
  });

  it('keeps a live row newer than the fetched head on a fresh start', () => {
    const prev = [msg({ id: 'live', createdAt: iso(10), senderId: 'u2', isOwn: false }), msg({ id: 'old1', createdAt: iso(1) })];
    const page = [msg({ id: 'n9', createdAt: iso(9) })];
    const { list } = mergeResyncPage(prev, page, true);
    expect(ids(list)).toEqual(['live', 'n9']);
  });

  it('answers the same array when nothing changed', () => {
    const prev = [msg({ id: 's1', createdAt: iso(1) })];
    const { list } = mergeResyncPage(prev, [msg({ id: 's1', createdAt: iso(1) })], false);
    expect(ids(list)).toEqual(['s1']);
  });
});


describe('appendOlderPage / olderCursor', () => {
  it('appends unknown rows only and the cursor skips temps', () => {
    const prev = [temp(1), msg({ id: 's2', createdAt: iso(2) }), msg({ id: 's1', createdAt: iso(1) })];
    expect(ids(appendOlderPage(prev, [msg({ id: 's1' }), msg({ id: 's0' })]))).toEqual([`${TEMP_ID_PREFIX}1`, 's2', 's1', 's0']);
    expect(olderCursor(prev)?.id).toBe('s1');
    expect(olderCursor([temp(1)])).toBeUndefined();
  });
});


describe('markDeleted / markEdited / restoreDeleted', () => {
  it('blanks the row and every quote of it, and the revert puts only that back', () => {
    const list = [
      msg({ id: 'r', senderId: 'u2', isOwn: false, text: 'reply', replyTo: { id: 'q', senderId: 'u1', senderName: 'Me', text: 'quoted', deleted: false, kind: 'file', fileName: 'a.pdf' } }),
      msg({ id: 'q', text: 'quoted', file: { name: 'a.pdf', uri: '/api/uploads/a.pdf' }, reactions: [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }] }),
    ];
    const deleted = list.map((m) => markDeleted(m, 'q'));
    expect(deleted[1]).toMatchObject({ deleted: true, text: '', file: undefined, reactions: [] });
    expect(deleted[0].replyTo).toMatchObject({ deleted: true, text: '', fileName: undefined });
    // A receipt that landed meanwhile survives the revert
    const withReceipt = deleted.map((m) => (m.id === 'q' ? { ...m, status: 'read' as const } : m));
    const restored = restoreDeleted(withReceipt, list, 'q');
    expect(restored[1]).toMatchObject({ deleted: false, text: 'quoted', status: 'read', file: { name: 'a.pdf' } });
    expect(restored[0].replyTo).toMatchObject({ deleted: false, text: 'quoted', fileName: 'a.pdf' });
  });

  it('an edit rewrites the row and follows into quotes, never an unsent row', () => {
    const list = [msg({ id: 'r', replyTo: { id: 'q', senderId: 'u1', senderName: 'Me', text: 'old', deleted: false } }), msg({ id: 'q', text: 'old' }), msg({ id: 'gone', deleted: true })];
    const edited = list.map((m) => markEdited(m, 'q', 'new', iso(5)));
    expect(edited[1]).toMatchObject({ text: 'new', editedAt: iso(5) });
    expect(edited[0].replyTo?.text).toBe('new');
    expect(markEdited(list[2], 'gone', 'x', iso(5))).toBe(list[2]);
  });
});


describe('withSelfReaction', () => {
  it('moves one user between groups and recomputes counts', () => {
    const reactions = [{ emoji: '👍', count: 2, bySelf: true, byUserIds: ['u1', 'u2'] }];
    expect(withSelfReaction(reactions, 'u1', '❤️')).toEqual([
      { emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] },
      { emoji: '❤️', count: 1, bySelf: true, byUserIds: ['u1'] },
    ]);
    expect(withSelfReaction(reactions, 'u2', null)).toEqual([{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u1'] }]);
  });
});


describe('applyReceipt', () => {
  const own = (over: Partial<ChatMessage> = {}) => msg({ readBy: ['u1'], ...over });

  it('promotes sent → delivered on the first reader, read only when all others read', () => {
    const list = [own({ id: 'a' })];
    const one = applyReceipt(list, 'u2', ['a'], 3);
    expect(one[0]).toMatchObject({ status: 'delivered', readBy: ['u1', 'u2'] });
    const all = applyReceipt(one, 'u3', ['a'], 3);
    expect(all[0]).toMatchObject({ status: 'read', readBy: ['u1', 'u2', 'u3'] });
  });

  it('reads a direct chat on the single counterpart receipt', () => {
    expect(applyReceipt([own({ id: 'a' })], 'u2', ['a'], 2)[0].status).toBe('read');
  });

  it('ignores duplicates, foreign rows, unlisted ids and keeps identity when nothing changes', () => {
    const list = [own({ id: 'a', status: 'delivered', readBy: ['u1', 'u2'] }), msg({ id: 'b', senderId: 'u2', isOwn: false })];
    expect(applyReceipt(list, 'u2', ['a', 'b'], 3)).toBe(list);
    expect(applyReceipt(list, 'u3', ['zzz'], 3)).toBe(list);
  });
});
