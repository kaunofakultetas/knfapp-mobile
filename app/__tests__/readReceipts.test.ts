// -----------------------------------------------------------
//  [*] Tests — useChatMessages read-receipt flush
//
//  The regression: the volatile socket mark_read must always
//  ride WITH the durable REST mark, arrivals only count as
//  read while the room is actually looked at, a burst
//  collapses into one trailing flush, and a buffered ack
//  flushes on refocus and on leaving — never dying with the
//  screen.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockFocused = { value: true };
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockFocused.value,
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' }, isAuthenticated: true }),
}));
const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...(args as [])),
  useNetwork: () => ({ onNetworkRestore: () => () => {} }),
}));

const mockMarkRead = jest.fn(async () => {});
jest.mock('@/services/api', () => {
  class ApiError extends Error {}
  return {
    ApiError,
    fetchMessages: jest.fn(async () => ({
      messages: [
        {
          id: 'm1',
          conversationId: 'c1',
          senderId: 'friend',
          senderName: 'Friend',
          text: 'labas',
          imageUrl: null,
          createdAt: '2026-08-29T10:00:00Z',
          isOwn: false,
          status: 'sent',
          reactions: [],
          replyTo: null,
          deleted: false,
        },
      ],
      participants: [],
      conversation: { id: 'c1', type: 'direct', title: 'Friend' },
      hasMore: false,
    })),
    markConversationRead: (...args: unknown[]) => mockMarkRead(...(args as [])),
    deleteMessageApi: jest.fn(),
    fetchOnlineStatus: jest.fn(async () => ({})),
  };
});

const mockEmitMarkRead = jest.fn();
const mockSocket: { newMessage?: (data: unknown) => void } = {};
jest.mock('@/services/socket', () => ({
  connectSocket: () => Promise.resolve(null),
  getSocketStatus: () => 'connected',
  emitMarkRead: (...args: unknown[]) => mockEmitMarkRead(...(args as [])),
  emitTyping: jest.fn(),
  emitStopTyping: jest.fn(),
  joinConversation: jest.fn(),
  onNewMessage: (cb: (data: unknown) => void) => {
    mockSocket.newMessage = cb;
    return () => {};
  },
  onMessagesRead: () => () => {},
  onMessageDeleted: () => () => {},
  onMessageEdited: () => () => {},
  onReactionUpdate: () => () => {},
  onSocketStatusChange: () => () => {},
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useChatMessages } from '@/hooks/chat/useChatMessages';

// jest-expo leaves AppState.currentState as a mock function —
// the hook would read "not active" and gate every flush off
Object.defineProperty(AppState, 'currentState', {
  configurable: true,
  get: () => 'active',
});


const incoming = (id: string) => ({
  id,
  conversationId: 'c1',
  senderId: 'friend',
  senderName: 'Friend',
  text: 'nauja',
  imageUrl: null,
  createdAt: '2026-08-29T10:01:00Z',
  isOwn: false,
  status: 'sent',
  reactions: [],
  replyTo: null,
  deleted: false,
});

const flushPair = () => ({ emits: mockEmitMarkRead.mock.calls.length, rests: mockMarkRead.mock.calls.length });


beforeEach(() => {
  jest.useFakeTimers();
  mockFocused.value = true;
  mockEmitMarkRead.mockClear();
  mockMarkRead.mockClear();
  delete mockSocket.newMessage;
});
afterEach(() => {
  jest.useRealTimers();
});


describe('read-receipt flush', () => {
  it('acknowledges the opened room with the volatile+durable pair', async () => {
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(mockEmitMarkRead).toHaveBeenCalledWith('c1');
    expect(mockMarkRead).toHaveBeenCalledWith('c1');
    expect(flushPair()).toEqual({ emits: 1, rests: 1 });
  });

  it('collapses an arrival burst into one trailing flush', async () => {
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    mockEmitMarkRead.mockClear();
    mockMarkRead.mockClear();

    await act(async () => {
      mockSocket.newMessage?.(incoming('n1'));
      mockSocket.newMessage?.(incoming('n2'));
      mockSocket.newMessage?.(incoming('n3'));
    });
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(flushPair()).toEqual({ emits: 1, rests: 1 });
  });

  it('buffers arrivals while the room is unfocused and flushes on refocus', async () => {
    mockFocused.value = false;
    const { result, rerender } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      mockSocket.newMessage?.(incoming('n1'));
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    // Buried room: nothing may go out — the sender must not see
    // 'read' for a message nobody looked at
    expect(flushPair()).toEqual({ emits: 0, rests: 0 });

    mockFocused.value = true;
    await act(async () => {
      rerender({});
    });
    expect(flushPair()).toEqual({ emits: 1, rests: 1 });
  });

  it('flushes a pending debounced ack when the reader leaves the room', async () => {
    const { result, unmount } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      mockSocket.newMessage?.(incoming('n1'));
    });
    // The 1.5 s debounce is still holding the ack — leaving must
    // send it, not drop it
    await act(async () => {
      unmount();
    });
    expect(flushPair()).toEqual({ emits: 1, rests: 1 });
  });

  it('never acknowledges for own echoes alone', async () => {
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    mockEmitMarkRead.mockClear();
    mockMarkRead.mockClear();

    await act(async () => {
      mockSocket.newMessage?.({ ...incoming('own1'), senderId: 'me', isOwn: true });
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(flushPair()).toEqual({ emits: 0, rests: 0 });
  });
});
