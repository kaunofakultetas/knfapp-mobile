// -----------------------------------------------------------
//  [*] Tests — disappearing messages on the client
//
//  The 'conversation' event merges the room's TTL into the
//  held meta, and the half-minute sweep drops rows whose
//  expires_at has passed (the server hard-deletes on its own
//  clock; this keeps the SCREEN honest between fetches).
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const row = (id: string, expiresAt?: string): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [], deleted: false, expiresAt });

describe('useConversation disappearing messages', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('merges the TTL patch into the meta and sweeps expired rows off the screen', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const transport = fakeTransport({
      self: SELF,
      messages: [row('stays'), row('burns', past)],
      conversation: { id: 'c1', type: 'group', title: 'KNF' },
    });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await act(async () => {
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    expect(h.result.current.messages.map((m) => m.id).sort()).toEqual(['burns', 'stays']);

    await act(async () => {
      transport.push({ type: 'conversation', conversationId: 'c1', patch: { messageTtlSeconds: 3600 } });
    });
    expect(h.result.current.conversation?.messageTtlSeconds).toBe(3600);
    expect(h.result.current.conversation?.title).toBe('KNF');

    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    expect(h.result.current.messages.map((m) => m.id)).toEqual(['stays']);
  });
});
