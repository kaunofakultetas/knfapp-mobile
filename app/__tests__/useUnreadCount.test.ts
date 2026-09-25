// -----------------------------------------------------------
//  [*] Tests — useUnreadCount
//
//  The badge rules: server count on login, hard 0 on logout
//  (a slow in-flight response must not resurrect it), +1 for
//  another sender's message except in the room being read
//  (which reconciles on a slower clock instead, past the
//  room's mark-read window — a reader scrolled up never marks
//  it read), never for own echoes or system lines, a
//  debounced server reconcile after socket traffic, and an
//  immediate re-count when a screen removed a whole room.
// -----------------------------------------------------------

const mockAuth = { isAuthenticated: true, user: { id: 'me' } as { id: string } | null };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

const mockFetchCount = jest.fn(async () => ({ unreadCount: 0 }));
jest.mock('@/services/api', () => ({
  fetchTotalUnreadCount: () => mockFetchCount(),
}));

// Registry capture: the hook's subscriptions land here so the
// test can fire socket traffic directly
const mockSocket: {
  newMessage?: (message: unknown) => void;
  messagesRead?: (payload: { readerId: string }) => void;
  messageDeleted?: () => void;
  status?: (status: string) => void;
} = {};
jest.mock('@/services/socket', () => ({
  connectSocket: jest.fn(async () => {}),
  getSocketStatus: () => 'connected',
  onNewMessage: (cb: (message: unknown) => void) => {
    mockSocket.newMessage = cb;
    return () => {};
  },
  onMessagesRead: (cb: (payload: { readerId: string }) => void) => {
    mockSocket.messagesRead = cb;
    return () => {};
  },
  onMessageDeleted: (cb: () => void) => {
    mockSocket.messageDeleted = cb;
    return () => {};
  },
  onSocketStatusChange: (cb: (status: string) => void) => {
    mockSocket.status = cb;
    return () => {};
  },
}));

jest.mock('@knf/dataengine', () => ({
  useNetworkRestore: () => {},
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  clearActiveConversation,
  getActiveConversation,
  setActiveConversation,
} from '@/hooks/chat/activeConversation';
import { requestUnreadRecount, useUnreadCount } from '@/hooks/useUnreadCount';


beforeEach(() => {
  // Stale handlers from a previous test's unmounted hook must
  // never receive this test's events
  delete mockSocket.newMessage;
  delete mockSocket.messagesRead;
  delete mockSocket.messageDeleted;
  delete mockSocket.status;
  mockAuth.isAuthenticated = true;
  mockAuth.user = { id: 'me' };
  mockFetchCount.mockReset().mockResolvedValue({ unreadCount: 0 });
  const held = getActiveConversation();
  if (held) clearActiveConversation(held);
});


// Flushes the hook's awaited connectSocket() so the socket
// subscriptions exist before the test fires events
const settle = async () => {
  await act(async () => {});
};


describe('useUnreadCount', () => {
  it('shows the server count once authenticated', async () => {
    mockFetchCount.mockResolvedValue({ unreadCount: 7 });
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(7));
  });

  it('resets to 0 on logout and blocks the in-flight response', async () => {
    let resolveFetch: (value: { unreadCount: number }) => void = () => {};
    mockFetchCount.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }) as never,
    );
    const { result, rerender } = await renderHook(() => useUnreadCount());
    await settle();

    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    await rerender({});
    await settle();
    expect(result.current.count).toBe(0);

    // The slow pre-logout fetch lands now — it must not write
    await act(async () => {
      resolveFetch({ unreadCount: 42 });
    });
    expect(result.current.count).toBe(0);
  });

  it("bumps for another sender's message in a background room", async () => {
    mockFetchCount.mockResolvedValue({ unreadCount: 2 });
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(2));
    await settle();
    expect(mockSocket.newMessage).toBeDefined();

    await act(async () => {
      mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-9' });
    });
    expect(result.current.count).toBe(3);
  });

  it('ignores own message echoes', async () => {
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(mockFetchCount).toHaveBeenCalled());
    await settle();

    await act(async () => {
      mockSocket.newMessage?.({ senderId: 'me', conversationId: 'conv-9' });
    });
    expect(result.current.count).toBe(0);
  });

  it('ignores system lines — the server never counts them', async () => {
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(mockFetchCount).toHaveBeenCalled());
    await settle();

    await act(async () => {
      mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-9', kind: 'system' });
    });
    expect(result.current.count).toBe(0);
  });

  it('re-counts at once when a screen asks (a room was deleted or left)', async () => {
    mockFetchCount.mockResolvedValue({ unreadCount: 5 });
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(result.current.count).toBe(5));
    const calls = mockFetchCount.mock.calls.length;

    mockFetchCount.mockResolvedValue({ unreadCount: 2 });
    await act(async () => {
      requestUnreadRecount();
    });
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(mockFetchCount.mock.calls.length).toBe(calls + 1);
  });

  it('ignores messages for the room being read', async () => {
    const { result } = await renderHook(() => useUnreadCount());
    await waitFor(() => expect(mockFetchCount).toHaveBeenCalled());
    await settle();

    setActiveConversation('conv-open');
    await act(async () => {
      mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-open' });
    });
    expect(result.current.count).toBe(0);
    clearActiveConversation('conv-open');
  });

  it("reconciles with the server after the current user's read receipt", async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useUnreadCount());
      await settle();
      mockFetchCount.mockClear().mockResolvedValue({ unreadCount: 1 });

      await act(async () => {
        mockSocket.messagesRead?.({ readerId: 'me' });
      });
      expect(mockFetchCount).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(mockFetchCount).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(result.current.count).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores other readers' receipts", async () => {
    jest.useFakeTimers();
    try {
      await renderHook(() => useUnreadCount());
      await settle();
      mockFetchCount.mockClear();

      await act(async () => {
        mockSocket.messagesRead?.({ readerId: 'someone-else' });
      });
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(mockFetchCount).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-fetches only on a real reconnect transition', async () => {
    await renderHook(() => useUnreadCount());
    await settle();
    mockFetchCount.mockClear();

    // Already connected — a repeat emit must not double-fetch
    await act(async () => {
      mockSocket.status?.('connected');
    });
    expect(mockFetchCount).not.toHaveBeenCalled();

    await act(async () => {
      mockSocket.status?.('disconnected');
      mockSocket.status?.('connected');
    });
    expect(mockFetchCount).toHaveBeenCalledTimes(1);
  });

  it("reconciles a message for the room being read once the room's mark-read window has passed", async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useUnreadCount());
      await settle();
      mockFetchCount.mockClear();

      // The reader is scrolled up in conv-open: the room claims
      // it on focus, but never marks the new message read — so
      // no messages_read receipt will ever drive the self-heal
      setActiveConversation('conv-open');
      let serverUnread = 0;
      mockFetchCount.mockImplementation(async () => ({ unreadCount: serverUnread }));
      await act(async () => {
        mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-open' });
      });
      serverUnread = 1;

      // No optimistic bump — the room may well be reading it —
      // and no re-count inside the room's own mark-read window
      expect(result.current.count).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(1_500);
      });
      expect(mockFetchCount).not.toHaveBeenCalled();

      // Past it, the server's number lands
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(mockFetchCount).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(result.current.count).toBe(1);
      clearActiveConversation('conv-open');
    } finally {
      jest.useRealTimers();
    }
  });

  it("another room's message during the open room's window never pulls the re-count IN — no flash of the open room's message", async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useUnreadCount());
      await settle();
      mockFetchCount.mockClear();

      setActiveConversation('conv-open');
      // The open room's message is on its way to being marked
      // read: the server counts it until the room's mark-read
      // lands (inside the 2 s window), and never after
      let roomMarkedRead = false;
      mockFetchCount.mockImplementation(async () => ({ unreadCount: roomMarkedRead ? 1 : 2 }));

      await act(async () => {
        mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-open' });
      });
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      // A message for a BACKGROUND room: bumped at once...
      await act(async () => {
        mockSocket.newMessage?.({ senderId: 'friend', conversationId: 'conv-other' });
      });
      expect(result.current.count).toBe(1);

      // ...but its fast 500 ms re-count may not fire at 600 ms —
      // the server would still count the open room's message
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(mockFetchCount).not.toHaveBeenCalled();
      roomMarkedRead = true;

      // The one re-count lands on the slow clock, after the read
      await act(async () => {
        jest.advanceTimersByTime(900);
      });
      expect(mockFetchCount).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(result.current.count).toBe(1);
      clearActiveConversation('conv-open');
    } finally {
      jest.useRealTimers();
    }
  });
});
