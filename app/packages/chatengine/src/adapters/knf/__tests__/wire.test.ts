// -----------------------------------------------------------
//  [*] Tests — knf wire mapping edge shapes
//
//  The wire's honest shapes reach the engine as the domain
//  types promise: a ghost quote's null sender becomes '' (a
//  UI interpolating the name must never print "null"), and a
//  system row's event rides through as `system`.
// -----------------------------------------------------------

import { mapReply, toChatMessage, type ApiMessage } from '../wire';







// -----------------------------------------------------------
// wireRow
// -----------------------------------------------------------
//
// A wire message as the chat routes emit it (naive UTC stamp
// with microseconds), with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const wireRow = (over: Partial<ApiMessage>): ApiMessage => ({
  id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'labas', time: '10:00', createdAt: '2026-09-19T10:00:00.123456', ...over,
});






describe('knf wire mapping', () => {
  it('a ghost quote maps to empty sender strings, never null', () => {
    // Exactly what chat/api/views.py _reply_payload answers for a
    // quoted row the disappearing-messages sweep hard-deleted
    const ghost = mapReply({ id: 'gone', senderId: null, senderName: null, text: '', imageUrl: null, deleted: true, kind: 'text', fileName: null });
    expect(ghost).toEqual({ id: 'gone', senderId: '', senderName: '', text: '', imageUrl: undefined, deleted: true, kind: 'text', fileName: undefined });
    expect(typeof ghost?.senderName).toBe('string');
  });

  it('a live quote keeps its sender', () => {
    const quote = mapReply({ id: 'q', senderId: 'u3', senderName: 'Vida', text: 'labas', deleted: false });
    expect(quote?.senderName).toBe('Vida');
  });

  it('a system row carries its event through', () => {
    const row = toChatMessage(wireRow({ kind: 'system', text: 'Ona sukūrė grupę „KNF“', system: { event: 'group_created', title: 'KNF' } }));
    expect(row.system).toEqual({ event: 'group_created', title: 'KNF' });
    expect(toChatMessage(wireRow({})).system).toBeUndefined();
  });
});
