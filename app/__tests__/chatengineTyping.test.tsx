// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine useTyping
//
//  Typers appear on an active event, expire after 5 s without
//  a heartbeat, leave on an inactive event, and own / non-member
//  events never show.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useTyping } from '@knf/chatengine';


const SELF = { id: 'u1', displayName: 'Me' };

describe('useTyping', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tracks typers with expiry, stop events and the member filter', async () => {
    const transport = fakeTransport({ self: SELF });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useTyping('c1', ['u1', 'u2']), { wrapper });

    await act(async () => transport.push({ type: 'typing', conversationId: 'c1', userId: 'u2', displayName: 'Ona', active: true }));
    expect(h.result.current.typingUsers).toEqual([{ userId: 'u2', displayName: 'Ona' }]);
    // Own second session and a non-member never show
    await act(async () => {
      transport.push({ type: 'typing', conversationId: 'c1', userId: 'u1', displayName: 'Me', active: true });
      transport.push({ type: 'typing', conversationId: 'c1', userId: 'u9', displayName: 'Stranger', active: true });
      transport.push({ type: 'typing', conversationId: 'other', userId: 'u2', displayName: 'Ona', active: true });
    });
    expect(h.result.current.typingUsers).toHaveLength(1);
    // A heartbeat refreshes the window
    await act(async () => {
      jest.advanceTimersByTime(4000);
      transport.push({ type: 'typing', conversationId: 'c1', userId: 'u2', displayName: 'Ona', active: true });
      jest.advanceTimersByTime(4000);
    });
    expect(h.result.current.typingUsers).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    expect(h.result.current.typingUsers).toEqual([]);
    await act(async () => {
      transport.push({ type: 'typing', conversationId: 'c1', userId: 'u2', displayName: 'Ona', active: true });
      transport.push({ type: 'typing', conversationId: 'c1', userId: 'u2', displayName: '', active: false });
    });
    expect(h.result.current.typingUsers).toEqual([]);
    h.unmount();
  });
});
