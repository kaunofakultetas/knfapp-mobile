// -----------------------------------------------------------
//  [*] Tests — group read-receipt promotion
//
//  The register major: own bubbles used to flip straight to
//  'read' when ONE of N members read. The rule now: the first
//  reader promotes sent → delivered; 'read' only once every
//  OTHER member has read; direct chats read on the first
//  receipt; duplicates and own receipts change nothing.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' }, isAuthenticated: true }),
}));
jest.mock('@/context/NetworkContext', () => ({
  showToast: jest.fn(),
  useNetwork: () => ({ onNetworkRestore: () => () => {} }),
}));

const mockParticipants: { list: { id: string; displayName: string }[] } = { list: [] };
jest.mock('@/services/api', () => {
  class ApiError extends Error {}
  return {
    ApiError,
    fetchMessages: jest.fn(async () => ({
      messages: [
        {
          id: 'own-1',
          conversationId: 'c1',
          senderId: 'me',
          senderName: 'Me',
          text: 'labas visiems',
          imageUrl: null,
          createdAt: '2026-08-29T10:00:00Z',
          isOwn: true,
          status: 'sent',
          reactions: [],
          replyTo: null,
          deleted: false,
        },
      ],
      participants: mockParticipants.list,
      conversation: { id: 'c1', type: 'group', title: 'Grupė', avatarEmoji: null },
      hasMore: false,
    })),
    markConversationRead: jest.fn(async () => {}),
    deleteMessageApi: jest.fn(),
    fetchOnlineStatus: jest.fn(async () => ({})),
  };
});

const mockSocket: { messagesRead?: (data: unknown) => void } = {};
jest.mock('@/services/socket', () => ({
  connectSocket: () => Promise.resolve(null),
  getSocketStatus: () => 'connected',
  emitMarkRead: jest.fn(),
  emitTyping: jest.fn(),
  emitStopTyping: jest.fn(),
  joinConversation: jest.fn(),
  onNewMessage: () => () => {},
  onMessagesRead: (cb: (data: unknown) => void) => {
    mockSocket.messagesRead = cb;
    return () => {};
  },
  onMessageDeleted: () => () => {},
  onReactionUpdate: () => () => {},
  onSocketStatusChange: () => () => {},
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useChatMessages } from '@/hooks/chat/useChatMessages';


const member = (id: string) => ({ id, displayName: id.toUpperCase() });

const readBy = (readerId: string) => ({
  conversationId: 'c1',
  readerId,
  messageIds: ['own-1'],
});

const mount = async () => {
  const utils = await renderHook(() => useChatMessages('c1'));
  await waitFor(() => expect(utils.result.current.loading).toBe(false));
  return utils;
};


beforeEach(() => {
  delete mockSocket.messagesRead;
  mockParticipants.list = [member('me'), member('anna'), member('bob')];
});


describe('group receipt promotion', () => {
  it('promotes sent → delivered on the first reader, read only when all others read', async () => {
    const { result } = await mount();
    expect(result.current.messages[0].status).toBe('sent');

    await act(async () => {
      mockSocket.messagesRead?.(readBy('anna'));
    });
    expect(result.current.messages[0].status).toBe('delivered');

    await act(async () => {
      mockSocket.messagesRead?.(readBy('bob'));
    });
    expect(result.current.messages[0].status).toBe('read');
  });

  it('ignores a duplicate receipt from the same reader', async () => {
    const { result } = await mount();

    await act(async () => {
      mockSocket.messagesRead?.(readBy('anna'));
      mockSocket.messagesRead?.(readBy('anna'));
      mockSocket.messagesRead?.(readBy('anna'));
    });
    // Three receipts from one reader are still one reader
    expect(result.current.messages[0].status).toBe('delivered');
  });

  it('ignores the sender own receipt entirely', async () => {
    const { result } = await mount();

    await act(async () => {
      mockSocket.messagesRead?.(readBy('me'));
    });
    expect(result.current.messages[0].status).toBe('sent');
  });

  it('ignores receipts for another conversation', async () => {
    const { result } = await mount();

    await act(async () => {
      mockSocket.messagesRead?.({ ...readBy('anna'), conversationId: 'c-OTHER' });
    });
    expect(result.current.messages[0].status).toBe('sent');
  });

  it('reads a direct chat on the single counterpart receipt', async () => {
    mockParticipants.list = [member('me'), member('anna')];
    const { result } = await mount();

    await act(async () => {
      mockSocket.messagesRead?.(readBy('anna'));
    });
    expect(result.current.messages[0].status).toBe('read');
  });

  it('accumulates readers across events in a larger group', async () => {
    mockParticipants.list = [member('me'), member('anna'), member('bob'), member('carla')];
    const { result } = await mount();

    await act(async () => {
      mockSocket.messagesRead?.(readBy('anna'));
    });
    await act(async () => {
      mockSocket.messagesRead?.(readBy('bob'));
    });
    expect(result.current.messages[0].status).toBe('delivered');

    await act(async () => {
      mockSocket.messagesRead?.(readBy('carla'));
    });
    expect(result.current.messages[0].status).toBe('read');
  });
});
