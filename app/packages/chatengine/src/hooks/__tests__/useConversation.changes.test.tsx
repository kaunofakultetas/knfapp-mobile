// -----------------------------------------------------------
//  [*] Tests — a resync applies edits and unsends made while
//  the client was away, even outside the newest page
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const iso = (i: number) => new Date(Date.UTC(2026, 7, 29, 10, i, 0)).toISOString();
const row = (id: string, i: number): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: iso(i), isOwn: false, status: 'read', reactions: [], deleted: false });

describe('useConversation change feed', () => {
  it('applies a change to a row above the newest page on reconnect', async () => {
    const transport = fakeTransport({ self: SELF, messages: Array.from({ length: 6 }, (_, i) => row(`m${i}`, i)), pageSize: 3 });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    // Page older rows in so m0 is held, then the server edits m0 and unsends m1 "while we are away"
    await act(async () => {
      await h.result.current.loadOlder();
    });
    await waitFor(() => expect(h.result.current.messages.some((m) => m.id === 'm0')).toBe(true));
    await transport.editMessage('c1', 'm0', 'pataisyta');
    await transport.deleteMessage('c1', 'm1');
    await act(async () => {
      transport.setStatus('disconnected');
      transport.setStatus('connected');
    });
    await waitFor(() => expect(h.result.current.messages.find((m) => m.id === 'm0')?.text).toBe('pataisyta'));
    expect(h.result.current.messages.find((m) => m.id === 'm1')?.deleted).toBe(true);
    expect(transport.calls.filter((c) => c.method === 'fetchChanges')).toHaveLength(1);
  });
});
