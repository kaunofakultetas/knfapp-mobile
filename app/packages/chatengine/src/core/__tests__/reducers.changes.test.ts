import { applyChanges, type ChatMessage } from '../../index';

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
    const gone = applyChanges(next, [msg({ id: 'q', deleted: true, text: '' })]);
    expect(gone[1].deleted).toBe(true);
    expect(gone[0].replyTo?.deleted).toBe(true);
  });
});
