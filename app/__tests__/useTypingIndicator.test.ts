// -----------------------------------------------------------
//  [*] Tests — useTypingIndicator
//
//  The typing banner's rules: only this room's events count,
//  own typing from a second session never shows, non-members
//  are dropped (the client's belt to the server's gate), a
//  typer expires 5 s after the last heartbeat, stop_typing
//  removes immediately, and a room switch clears the list.
// -----------------------------------------------------------

const mockAuth = { user: { id: 'me' } as { id: string } | null };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const mockSocket: {
  typing?: (data: unknown) => void;
  stopTyping?: (data: unknown) => void;
} = {};
jest.mock('@/services/socket', () => ({
  connectSocket: jest.fn(async () => {}),
  onTyping: (cb: (data: unknown) => void) => {
    mockSocket.typing = cb;
    return () => {};
  },
  onStopTyping: (cb: (data: unknown) => void) => {
    mockSocket.stopTyping = cb;
    return () => {};
  },
}));

import { act, renderHook } from '@testing-library/react-native';

import { useTypingIndicator } from '@/hooks/chat/useTypingIndicator';


const typing = (userId: string, conversationId = 'conv-1') => ({
  conversationId,
  userId,
  displayName: userId.toUpperCase(),
});


beforeEach(() => {
  delete mockSocket.typing;
  delete mockSocket.stopTyping;
  mockAuth.user = { id: 'me' };
});


const names = (result: { current: { typingUsers: { userId: string }[] } }) =>
  result.current.typingUsers.map((u) => u.userId);


describe('useTypingIndicator', () => {
  it('shows a typer for this room and dedupes heartbeats', async () => {
    const { result } = await renderHook(() => useTypingIndicator('conv-1'));

    await act(async () => {
      mockSocket.typing?.(typing('anna'));
      mockSocket.typing?.(typing('anna'));
    });
    expect(names(result)).toEqual(['anna']);
  });

  it('ignores other rooms, self and non-members', async () => {
    const { result } = await renderHook(() =>
      useTypingIndicator('conv-1', [{ id: 'anna' }, { id: 'me' }]),
    );

    await act(async () => {
      mockSocket.typing?.(typing('anna', 'conv-OTHER'));   // wrong room
      mockSocket.typing?.(typing('me'));                   // own second session
      mockSocket.typing?.(typing('intruder'));             // not a member
      mockSocket.typing?.(typing('anna'));                 // the only valid one
    });
    expect(names(result)).toEqual(['anna']);
  });

  it('expires a typer 5 s after the last heartbeat', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useTypingIndicator('conv-1'));

      await act(async () => {
        mockSocket.typing?.(typing('anna'));
      });
      // A heartbeat at 3 s refreshes the window
      await act(async () => {
        jest.advanceTimersByTime(3000);
        mockSocket.typing?.(typing('anna'));
      });
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(names(result)).toEqual(['anna']);

      await act(async () => {
        jest.advanceTimersByTime(1100);
      });
      expect(names(result)).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes a typer immediately on stop_typing', async () => {
    const { result } = await renderHook(() => useTypingIndicator('conv-1'));

    await act(async () => {
      mockSocket.typing?.(typing('anna'));
      mockSocket.typing?.(typing('bob'));
    });
    expect(names(result)).toEqual(['anna', 'bob']);

    await act(async () => {
      mockSocket.stopTyping?.(typing('anna'));
    });
    expect(names(result)).toEqual(['bob']);
  });

  it('clears the list when the room changes', async () => {
    const { result, rerender } = await renderHook(
      ({ conv }: { conv: string }) => useTypingIndicator(conv),
      { initialProps: { conv: 'conv-1' } },
    );

    await act(async () => {
      mockSocket.typing?.(typing('anna'));
    });
    expect(names(result)).toEqual(['anna']);

    await rerender({ conv: 'conv-2' });
    expect(names(result)).toEqual([]);
  });
});
