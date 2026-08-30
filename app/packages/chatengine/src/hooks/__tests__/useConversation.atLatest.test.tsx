// -----------------------------------------------------------
//  [*] Tests — read acknowledgements gated on the newest end
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const row = (id: string): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [], deleted: false });

describe('useConversation atLatest', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holds the acknowledgement while the reader is up in history and flushes on returning to the newest end', async () => {
    const transport = fakeTransport({ self: SELF, messages: [row('a')] });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(({ atLatest }: { atLatest: boolean }) => useConversation('c1', { atLatest }), { wrapper, initialProps: { atLatest: false } });
    await act(async () => {
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    await act(async () => {
      transport.push({ type: 'message', message: row('b') });
      jest.advanceTimersByTime(3000);
    });
    expect(transport.signals.filter((s) => s.name === 'markRead')).toHaveLength(0);
    expect(transport.calls.filter((c) => c.method === 'markRead')).toHaveLength(0);
    await h.rerender({ atLatest: true });
    expect(transport.signals.filter((s) => s.name === 'markRead')).toHaveLength(1);
    expect(transport.calls.filter((c) => c.method === 'markRead')).toHaveLength(1);
  });
});
