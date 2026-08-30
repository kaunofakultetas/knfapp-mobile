// -----------------------------------------------------------
//  [*] Tests — hooks/chat/useChatMessages
//
//  The echo-dedupe and resync merge — the app's most intricate
//  state logic. Pure-function coverage of findTempFor /
//  adoptTemp / markDeleted, plus hook-level coverage of the
//  own-echo adoption (nonce and content fallback), the resync
//  overlap merge and fresh-head restart, the conversation-
//  switch state reset, the stale-page guard and the older-
//  paging failure latch.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/hooks/useNetworkRestore', () => ({ useNetworkRestore: () => {} }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Me' }, isAuthenticated: true }),
}));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

const mockFetchMessages = jest.fn();
jest.mock('@/services/api', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, status = 0, code = 'http') {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    ApiError,
    fetchMessages: (...a: unknown[]) => mockFetchMessages(...a),
    deleteMessageApi: jest.fn(async () => {}),
    markConversationRead: jest.fn(async () => {}),
  };
});

// Registry-style socket mock: handlers land in arrays the tests
// fire by hand, exactly like a server push would
const mockHandlers: { newMessage: ((d: unknown) => void)[]; status: ((s: string) => void)[] } = {
  newMessage: [],
  status: [],
};
jest.mock('@/services/socket', () => ({
  connectSocket: () => Promise.resolve(null),
  emitMarkRead: jest.fn(),
  emitTyping: jest.fn(),
  emitStopTyping: jest.fn(),
  getSocketStatus: () => 'connected',
  joinConversation: jest.fn(),
  onMessageDeleted: () => () => {},
  onMessagesRead: () => () => {},
  onNewMessage: (cb: (d: unknown) => void) => {
    mockHandlers.newMessage.push(cb);
    return () => {};
  },
  onSocketStatusChange: (cb: (s: string) => void) => {
    mockHandlers.status.push(cb);
    return () => {};
  },
  onReactionUpdate: () => () => {},
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { TEMP_ID_PREFIX, adoptTemp, findTempFor, markDeleted, useChatMessages } from '@/hooks/chat/useChatMessages';
import type { ChatMessage } from '@/types';


// Ascending UTC stamps — the API pages oldest-first
const iso = (minute: number) => new Date(Date.UTC(2026, 7, 29, 10, minute, 0)).toISOString();

const chatMsg = (over: Partial<ChatMessage>): ChatMessage =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    senderName: 'Me',
    text: 'labas',
    createdAt: iso(0),
    isOwn: true,
    status: 'sent',
    reactions: [],
    deleted: false,
    ...over,
  }) as ChatMessage;

// An ApiMessage row as fetchMessages returns them
const apiMsg = (over: Record<string, unknown>) => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u2',
  senderName: 'Ona',
  text: 'labas',
  time: '',
  createdAt: iso(0),
  isOwn: false,
  reactions: [],
  replyTo: null,
  deleted: false,
  ...over,
});

const page = (messages: Record<string, unknown>[], hasMore = false) => ({
  messages,
  hasMore,
  participants: [
    { id: 'u1', displayName: 'Me' },
    { id: 'u2', displayName: 'Ona' },
  ],
  conversation: { id: 'c1', type: 'direct' as const, title: null, avatarEmoji: null },
});

const emitNewMessage = (data: Record<string, unknown>) => {
  for (const cb of mockHandlers.newMessage) cb(data);
};

const ids = (list: ChatMessage[]) => list.map((m) => m.id);


describe('findTempFor', () => {
  it('matches by the echoed clientMsgId nonce, or nothing', () => {
    const list = [
      chatMsg({ id: `${TEMP_ID_PREFIX}2-b`, clientId: `${TEMP_ID_PREFIX}2-b`, status: 'sending' }),
      chatMsg({ id: `${TEMP_ID_PREFIX}1-a`, clientId: `${TEMP_ID_PREFIX}1-a`, status: 'sending' }),
    ];
    expect(findTempFor(list, chatMsg({ id: 's1', clientId: `${TEMP_ID_PREFIX}1-a` }))).toBe(1);
    // A nonce that names no temp matches nothing, identical text or not
    expect(findTempFor(list, chatMsg({ id: 's2', clientId: `${TEMP_ID_PREFIX}9-z` }))).toBe(-1);
  });

  it('falls back to content and prefers the newest temp', () => {
    const list = [
      chatMsg({ id: `${TEMP_ID_PREFIX}2-b`, clientId: `${TEMP_ID_PREFIX}2-b`, status: 'sending' }),
      chatMsg({ id: `${TEMP_ID_PREFIX}1-a`, clientId: `${TEMP_ID_PREFIX}1-a`, status: 'failed' }),
    ];
    expect(findTempFor(list, chatMsg({ id: 's1' }))).toBe(0);
  });

  it('requires text, image and reply target to all agree', () => {
    const list = [chatMsg({ id: `${TEMP_ID_PREFIX}1-a`, clientId: `${TEMP_ID_PREFIX}1-a`, imageUrl: '/api/uploads/a.jpg' })];
    expect(findTempFor(list, chatMsg({ id: 's1', imageUrl: '/api/uploads/b.jpg' }))).toBe(-1);
    expect(findTempFor(list, chatMsg({ id: 's1', imageUrl: '/api/uploads/a.jpg' }))).toBe(0);
  });
});


describe('adoptTemp', () => {
  it('keeps the temp key and local photo on the server row', () => {
    const temp = chatMsg({ id: `${TEMP_ID_PREFIX}1-a`, clientId: `${TEMP_ID_PREFIX}1-a`, localImageUri: 'file:///a.jpg' });
    const adopted = adoptTemp(chatMsg({ id: 's1', clientId: undefined }), temp);
    expect(adopted.id).toBe('s1');
    expect(adopted.clientId).toBe(`${TEMP_ID_PREFIX}1-a`);
    expect(adopted.localImageUri).toBe('file:///a.jpg');
  });
});


describe('markDeleted', () => {
  it('blanks the target and every quote of it, and nothing else', () => {
    const target = chatMsg({ id: 'm1', text: 'slapta', imageUrl: '/api/uploads/a.jpg' });
    const quoting = chatMsg({
      id: 'm2',
      text: 'atsakymas',
      replyTo: { id: 'm1', senderId: 'u1', senderName: 'Me', text: 'slapta', deleted: false },
    });
    const bystander = chatMsg({ id: 'm3', text: 'kita' });

    const deleted = markDeleted(target, 'm1');
    expect(deleted).toMatchObject({ text: '', imageUrl: undefined, deleted: true });

    const flipped = markDeleted(quoting, 'm1');
    expect(flipped.text).toBe('atsakymas');
    expect(flipped.replyTo).toMatchObject({ text: '', deleted: true });

    expect(markDeleted(bystander, 'm1')).toBe(bystander);
  });
});


describe('useChatMessages', () => {
  beforeEach(() => {
    mockFetchMessages.mockReset();
    mockShowToast.mockReset();
    mockHandlers.newMessage.length = 0;
    mockHandlers.status.length = 0;
    mockFetchMessages.mockResolvedValue(page([]));
  });

  it('renders the first page newest-first', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1', createdAt: iso(0) }), apiMsg({ id: 'm2', createdAt: iso(1) })]));
    const { result } = await renderHook(() => useChatMessages('c1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.messages)).toEqual(['m2', 'm1']);
  });

  it('adopts the optimistic temp when the own echo lands first', async () => {
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const tempId = `${TEMP_ID_PREFIX}1-a`;
    await act(async () => {
      result.current.setMessages((prev) => [chatMsg({ id: tempId, clientId: tempId, status: 'sending' }), ...prev]);
    });
    await act(async () => {
      emitNewMessage(apiMsg({ id: 's1', clientMsgId: tempId, senderId: 'u1', senderName: 'Me', createdAt: iso(2) }));
    });

    expect(ids(result.current.messages)).toEqual(['s1']);
    expect(result.current.messages[0].clientId).toBe(tempId);
  });

  it('ignores an echo whose row the REST response already delivered', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1', senderId: 'u1', senderName: 'Me', isOwn: true })]));
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      emitNewMessage(apiMsg({ id: 'm1', senderId: 'u1', senderName: 'Me' }));
    });
    expect(ids(result.current.messages)).toEqual(['m1']);
  });

  it('two identical texts in flight adopt two distinct temps', async () => {
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const older = `${TEMP_ID_PREFIX}1-a`;
    const newer = `${TEMP_ID_PREFIX}2-b`;
    await act(async () => {
      result.current.setMessages((prev) => [
        chatMsg({ id: newer, clientId: newer, text: 'dvigubas', status: 'sending' }),
        chatMsg({ id: older, clientId: older, text: 'dvigubas', status: 'sending' }),
        ...prev,
      ]);
    });

    // Echoes WITHOUT the nonce — the content fallback must hand
    // each server row its own temp, newest first
    await act(async () => {
      emitNewMessage(apiMsg({ id: 'sA', senderId: 'u1', senderName: 'Me', text: 'dvigubas', createdAt: iso(3) }));
    });
    await act(async () => {
      emitNewMessage(apiMsg({ id: 'sB', senderId: 'u1', senderName: 'Me', text: 'dvigubas', createdAt: iso(4) }));
    });

    expect(ids(result.current.messages).sort()).toEqual(['sA', 'sB']);
    expect(result.current.messages.map((m) => m.clientId).sort()).toEqual([older, newer]);
  });

  it('resync merges an overlapping page by id and re-sorts by stamp', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1', createdAt: iso(0) }), apiMsg({ id: 'm2', createdAt: iso(1) })]));
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const reactions = [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }];
    mockFetchMessages.mockResolvedValue(
      page([apiMsg({ id: 'm2', createdAt: iso(1), reactions }), apiMsg({ id: 'm3', createdAt: iso(2) })], true),
    );
    await act(async () => {
      await result.current.resync();
    });

    expect(ids(result.current.messages)).toEqual(['m3', 'm2', 'm1']);
    expect(result.current.messages[1].reactions).toHaveLength(1);
  });

  it('resync with a disjoint page restarts from the fresh head', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1', createdAt: iso(0) })]));
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm5', createdAt: iso(60) }), apiMsg({ id: 'm6', createdAt: iso(61) })], true));
    await act(async () => {
      await result.current.resync();
    });

    expect(ids(result.current.messages)).toEqual(['m6', 'm5']);
    expect(result.current.hasMore).toBe(true);
  });

  it('a conversationId switch clears the previous room before the new page lands', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1' })]));
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useChatMessages(id), {
      initialProps: { id: 'c1' },
    });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['m1']));

    // The next room's page stays pending — the whole fetch RTT
    // must show the new room's empty state, never c1's messages
    let resolveNext: (v: unknown) => void = () => {};
    mockFetchMessages.mockImplementation(() => new Promise((resolve) => { resolveNext = resolve; }));
    await act(async () => {
      rerender({ id: 'c2' });
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversation).toBeNull();

    await act(async () => {
      resolveNext(page([apiMsg({ id: 'x1', conversationId: 'c2' })]));
    });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['x1']));
  });

  it('an in-flight older page from the previous room never lands in the new one', async () => {
    type Deferred = { args: unknown[]; resolve: (v: unknown) => void };
    const pendingFetches: Deferred[] = [];
    mockFetchMessages.mockImplementation((...args: unknown[]) =>
      new Promise((resolve) => { pendingFetches.push({ args, resolve }); }),
    );

    const { result, rerender } = await renderHook(({ id }: { id: string }) => useChatMessages(id), {
      initialProps: { id: 'c1' },
    });
    await act(async () => {
      pendingFetches[0].resolve(page([apiMsg({ id: 'm1', createdAt: iso(0) }), apiMsg({ id: 'm2', createdAt: iso(1) })], true));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // c1's older page goes on the wire, then the instance is
    // handed c2 while that request is still in flight
    await act(async () => {
      void result.current.loadOlder();
    });
    await act(async () => {
      rerender({ id: 'c2' });
    });
    await act(async () => {
      pendingFetches[1].resolve(page([apiMsg({ id: 'old1', createdAt: iso(-30) })], true));
    });
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      pendingFetches[2].resolve(page([apiMsg({ id: 'x1', conversationId: 'c2' })]));
    });
    await waitFor(() => expect(ids(result.current.messages)).toEqual(['x1']));
  });

  it('latches older-paging failures: one toast, no automatic retry storm', async () => {
    mockFetchMessages.mockResolvedValue(page([apiMsg({ id: 'm1', createdAt: iso(0) })], true));
    const { result } = await renderHook(() => useChatMessages('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchMessages.mockReset();
    mockFetchMessages.mockRejectedValue(new Error('down'));
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledTimes(1);

    // The scroll bounce re-fires immediately — the backoff must
    // swallow it without another request or toast
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(mockFetchMessages).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });
});
