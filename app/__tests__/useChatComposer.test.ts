// -----------------------------------------------------------
//  [*] Tests — hooks/chat/useChatComposer
//
//  The concurrency guarantees the file header promises: the
//  synchronous draft clear that makes a double tap send once,
//  the inFlightRef Set that stops a retry tap racing the
//  network-restore sweep onto the same temp id, and the
//  failed-upload retry that re-uploads exactly once.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/chatkit/Composer', () => ({ DEFAULT_MAX_LENGTH: 5000 }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Me' }, isAuthenticated: true }),
}));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

// The restore sweep is captured so tests can fire it by hand,
// racing it against a retry tap in the same tick
const mockRestoreCbs: (() => void)[] = [];
jest.mock('@/hooks/useNetworkRestore', () => ({
  useNetworkRestore: (cb: () => void) => {
    mockRestoreCbs.push(cb);
  },
}));

const mockSendMessage = jest.fn();
const mockUploadImage = jest.fn();
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
    sendMessageApi: (...a: unknown[]) => mockSendMessage(...a),
    uploadImageApi: (...a: unknown[]) => mockUploadImage(...a),
    fetchMessages: jest.fn(),
    deleteMessageApi: jest.fn(),
    markConversationRead: jest.fn(),
  };
});

jest.mock('@/services/socket', () => ({
  connectSocket: () => Promise.resolve(null),
  emitMarkRead: jest.fn(),
  emitTyping: jest.fn(),
  emitStopTyping: jest.fn(),
  getSocketStatus: () => 'connected',
  joinConversation: jest.fn(),
  onMessageDeleted: () => () => {},
  onMessagesRead: () => () => {},
  onNewMessage: () => () => {},
  onSocketStatusChange: () => () => {},
  onReactionUpdate: () => () => {},
}));

const mockLaunchPicker = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunchPicker(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { useChatComposer } from '@/hooks/chat/useChatComposer';
import type { ChatMessage } from '@/types';


// A server row echoing the send — what sendMessageApi resolves
const serverMessage = (id: string, text: string, imageUrl?: string) => ({
  message: {
    id,
    conversationId: 'c1',
    senderId: 'u1',
    senderName: 'Me',
    text,
    imageUrl: imageUrl ?? null,
    createdAt: new Date().toISOString(),
    isOwn: true,
    status: 'sent',
    reactions: [],
    replyTo: null,
    deleted: false,
  },
});

// The hook under a real messages state, exactly as the screen
// wires it — the sweep and the prune read this list
const renderComposer = () =>
  renderHook(() => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const composer = useChatComposer('c1', setMessages, messages);
    return { messages, composer };
  });


describe('useChatComposer', () => {
  beforeEach(async () => {
    mockSendMessage.mockReset();
    mockUploadImage.mockReset();
    mockLaunchPicker.mockReset();
    mockShowToast.mockReset();
    mockRestoreCbs.length = 0;
    await AsyncStorage.clear();
  });

  it('a double tap in one tick sends exactly once', async () => {
    mockSendMessage.mockResolvedValue(serverMessage('s1', 'labas'));
    const { result } = await renderComposer();

    await act(async () => {
      result.current.composer.onChangeText('labas');
    });
    await act(async () => {
      result.current.composer.sendMessage();
      result.current.composer.sendMessage();
    });

    await waitFor(() => expect(result.current.messages[0]?.status).toBe('sent'));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe('s1');
  });

  it('a retry tap racing the restore sweep delivers once', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderComposer();

    await act(async () => {
      result.current.composer.onChangeText('bandymas');
    });
    await act(async () => {
      result.current.composer.sendMessage();
    });
    await waitFor(() => expect(result.current.messages[0]?.status).toBe('failed'));

    // The retry stays on the wire while the sweep fires — the
    // inFlight guard must keep it to ONE request
    let resolveSend: (v: unknown) => void = () => {};
    mockSendMessage.mockImplementation(() => new Promise((resolve) => { resolveSend = resolve; }));
    const failed = result.current.messages[0];
    await act(async () => {
      result.current.composer.retryMessage(failed);
      for (const cb of mockRestoreCbs) cb();
    });
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSend(serverMessage('s2', 'bandymas'));
    });
    await waitFor(() => expect(result.current.messages[0]?.status).toBe('sent'));
    expect(result.current.messages).toHaveLength(1);
  });

  it('a failed upload retried through the sweep re-uploads exactly once', async () => {
    mockLaunchPicker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 100 }],
    });
    mockUploadImage.mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderComposer();

    await act(async () => {
      await result.current.composer.attachImage();
    });
    await waitFor(() => expect(result.current.messages[0]?.status).toBe('failed'));
    expect(mockUploadImage).toHaveBeenCalledTimes(1);

    // Retry tap + restore sweep in the same tick: one re-upload,
    // then one send with the uploaded path
    let resolveUpload: (v: unknown) => void = () => {};
    mockUploadImage.mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    mockSendMessage.mockResolvedValue(serverMessage('s3', '', '/api/uploads/a.jpg'));
    const failed = result.current.messages[0];
    await act(async () => {
      result.current.composer.retryMessage(failed);
      for (const cb of mockRestoreCbs) cb();
    });
    expect(mockUploadImage).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveUpload({ url: '/api/uploads/a.jpg' });
    });
    await waitFor(() => expect(result.current.messages[0]?.status).toBe('sent'));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.messages).toHaveLength(1);
  });

  describe('draft hygiene', () => {
    it('clears a whitespace-only draft instead of posting it', async () => {
      const { result } = await renderComposer();

      await act(async () => {
        result.current.composer.onChangeText('   \n\t  ');
      });
      await act(async () => {
        result.current.composer.sendMessage();
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(result.current.composer.text).toBe('');
      expect(result.current.messages).toHaveLength(0);
    });

    it('trims the body it sends', async () => {
      mockSendMessage.mockResolvedValue(serverMessage('s1', 'labas'));
      const { result } = await renderComposer();

      await act(async () => {
        result.current.composer.onChangeText('  labas  ');
      });
      await act(async () => {
        result.current.composer.sendMessage();
      });

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage.mock.calls[0]).toContain('labas');
    });

    it('clamps pasted text at the kit limit', async () => {
      const { result } = await renderComposer();

      await act(async () => {
        result.current.composer.onChangeText('x'.repeat(6000));
      });
      expect(result.current.composer.text).toHaveLength(5000);
    });
  });

});
