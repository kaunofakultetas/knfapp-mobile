// -----------------------------------------------------------
//  [*] Tests — pins and the realtime status hook
//
//  usePins: the initial fetch, the socket-echo refresh after
//  pin/unpin, an unsent pinned row leaving at once, and the
//  graceful empty result on a transport without the trio.
//  useRealtimeStatus: the banner's state follows onStatus.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, memoryStorage, usePins, useRealtimeStatus, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const row = (id: string): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: id, createdAt: `2026-08-29T10:00:0${id.length}Z`, isOwn: false, status: 'read', reactions: [], deleted: false });

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
};

function wrapperFor(transport: ReturnType<typeof fakeTransport>) {
  return ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={memoryStorage()}>
      {children}
    </ChatEngineProvider>
  );
}

describe('usePins', () => {
  it('fetches, follows the pin flips through the socket echo, and drops unsent pins', async () => {
    const transport = fakeTransport({ self: SELF, messages: [row('a'), row('b')] });
    const h = await renderHook(() => usePins('c1'), { wrapper: wrapperFor(transport) });
    await flush();
    expect(h.result.current.supported).toBe(true);
    expect(h.result.current.pins).toHaveLength(0);

    await act(async () => {
      await h.result.current.pin('a');
    });
    await flush();
    expect(h.result.current.pins.map((p) => p.id)).toEqual(['a']);

    // An unsent pinned row leaves the banner without a refetch
    await act(async () => {
      transport.push({ type: 'deleted', conversationId: 'c1', messageId: 'a' });
    });
    expect(h.result.current.pins).toHaveLength(0);
  });

  it('answers empty and unsupported when the transport has no pin trio', async () => {
    const transport = fakeTransport({ self: SELF });
    const bare = { ...transport, pinMessage: undefined, unpinMessage: undefined, fetchPins: undefined };
    const h = await renderHook(() => usePins('c1'), { wrapper: wrapperFor(bare as never) });
    await flush();
    expect(h.result.current.supported).toBe(false);
    expect(h.result.current.pins).toHaveLength(0);
  });
});

describe('useRealtimeStatus', () => {
  it('follows the door', async () => {
    const transport = fakeTransport({ self: SELF });
    const h = await renderHook(() => useRealtimeStatus(), { wrapper: wrapperFor(transport) });
    await flush();
    await act(async () => {
      transport.setStatus('reconnecting');
    });
    expect(h.result.current).toBe('reconnecting');
    await act(async () => {
      transport.setStatus('connected');
    });
    expect(h.result.current).toBe('connected');
  });
});
