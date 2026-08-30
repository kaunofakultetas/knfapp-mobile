// -----------------------------------------------------------
//  [*] Tests — resync keeps row identity; dev-time ingest checks
// -----------------------------------------------------------

import { mergeResyncPage, normalizeForViewer, sameRow, type ChatMessage } from '../../index';

const iso = (minute: number) => new Date(Date.UTC(2026, 7, 29, 10, minute, 0)).toISOString();
const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: iso(0), isOwn: false, status: 'read', reactions: [], deleted: false, ...over,
});

describe('sameRow', () => {
  it('is true for equal content and false when anything a bubble draws changed', () => {
    const a = msg({ reactions: [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u1'] }] });
    expect(sameRow(a, { ...a })).toBe(true);
    expect(sameRow(a, { ...a, text: 'kitas' })).toBe(false);
    expect(sameRow(a, { ...a, editedAt: iso(1) })).toBe(false);
    expect(sameRow(a, { ...a, reactions: [{ emoji: '👍', count: 2, bySelf: false, byUserIds: ['u1', 'u3'] }] })).toBe(false);
    expect(sameRow(a, { ...a, replyTo: { id: 'q', senderId: 'u1', senderName: 'x', text: 'q', deleted: false } })).toBe(false);
    expect(sameRow(a, { ...a, readBy: ['u1'] })).toBe(false);
  });
});

describe('mergeResyncPage identity', () => {
  it('keeps the known object when the server row brings nothing new, replaces it when it does', () => {
    const known = msg({ id: 'a', createdAt: iso(1) });
    const other = msg({ id: 'b', createdAt: iso(2) });
    const prev = [other, known];
    const same = mergeResyncPage(prev, [msg({ id: 'b', createdAt: iso(2) }), msg({ id: 'a', createdAt: iso(1) })], false).list;
    expect(same).toBe(prev);
    const changed = mergeResyncPage(prev, [msg({ id: 'b', createdAt: iso(2) }), msg({ id: 'a', createdAt: iso(1), text: 'pataisyta' })], false).list;
    expect(changed).not.toBe(prev);
    expect(changed[0]).toBe(other);
    expect(changed[1]).not.toBe(known);
    expect(changed[1].text).toBe('pataisyta');
  });
});

describe('validateIngest (dev)', () => {
  it('warns once per problem and never throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = msg({ id: 'bad-1', createdAt: 'yesterday-ish', senderId: '' });
    expect(() => normalizeForViewer(bad, 'u1')).not.toThrow();
    normalizeForViewer(bad, 'u1');
    const problems = warn.mock.calls.map((c) => String(c[0]));
    expect(problems.some((p) => p.includes('senderId'))).toBe(true);
    expect(problems.some((p) => p.includes('createdAt'))).toBe(true);
    expect(problems.filter((p) => p.includes('senderId'))).toHaveLength(1);
    warn.mockRestore();
  });
});
