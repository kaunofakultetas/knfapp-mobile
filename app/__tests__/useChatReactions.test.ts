// -----------------------------------------------------------
//  [*] Tests — useChatReactions
//
//  The reaction state machine: optimistic self-reaction, the
//  authoritative REST reconcile, the epoch guard that drops a
//  stale REST body once a newer socket event (or room switch)
//  moved the state, the failure revert, and the vanished-
//  target toast.
// -----------------------------------------------------------

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockReactApi = jest.fn();
const mockRemoveApi = jest.fn();
jest.mock('@/services/api', () => ({
  reactToMessageApi: (...args: unknown[]) => mockReactApi(...args),
  removeReactionApi: (...args: unknown[]) => mockRemoveApi(...args),
}));

const mockSocket: { reactionUpdate?: (event: unknown) => void } = {};
jest.mock('@/services/socket', () => ({
  onReactionUpdate: (cb: (event: unknown) => void) => {
    mockSocket.reactionUpdate = cb;
    return () => {};
  },
}));

import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';

import { useChatReactions } from '@/hooks/chat/useChatReactions';
import type { ChatMessage } from '@/types';


const message = (id: string, reactions: ChatMessage['reactions'] = []): ChatMessage =>
  ({
    id,
    conversationId: 'conv-1',
    senderId: 'friend',
    senderName: 'Friend',
    text: 'labas',
    reactions,
  }) as ChatMessage;

// Harness: real message state living next to the hook, exactly
// like the chat room wires it
const mount = async (initial: ChatMessage[], conversationId = 'conv-1') => {
  const utils = await renderHook(
    ({ conv }: { conv: string }) => {
      const [messages, setMessages] = useState(initial);
      const reactions = useChatReactions(conv, messages, setMessages);
      return { messages, reactions };
    },
    { initialProps: { conv: conversationId } },
  );
  return utils;
};

const selfGroups = (msg: ChatMessage) => msg.reactions.filter((r) => r.bySelf).map((r) => r.emoji);


beforeEach(() => {
  delete mockSocket.reactionUpdate;
  mockShowToast.mockClear();
  mockReactApi.mockReset();
  mockRemoveApi.mockReset();
});


describe('useChatReactions', () => {
  it('applies an optimistic self-reaction, then the authoritative server list', async () => {
    mockReactApi.mockResolvedValue([{ emoji: '❤️', count: 2, byUserIds: ['friend', 'me'] }]);
    const { result } = await mount([message('m1')]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });

    const m1 = result.current.messages[0];
    expect(selfGroups(m1)).toEqual(['❤️']);
    expect(m1.reactions[0].count).toBe(2);
    expect(m1.reactions[0].byUserIds).toContain('friend');
    expect(result.current.reactions.pickerOpen).toBe(false);
  });

  it('drops a stale REST body once a socket event moved the epoch', async () => {
    let resolveRest: (value: unknown) => void = () => {};
    mockReactApi.mockReturnValue(
      new Promise((resolve) => {
        resolveRest = resolve;
      }),
    );
    const { result } = await mount([message('m1')]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });
    expect(selfGroups(result.current.messages[0])).toEqual(['❤️']);

    // A newer socket-committed state for the same message lands
    // while the REST call is still in flight
    await act(async () => {
      mockSocket.reactionUpdate?.({ conversationId: 'conv-1', messageId: 'm1' });
    });

    // The stale REST body (an EMPTY reaction list) resolves now
    // — it must be dropped, not clobber the newer state
    await act(async () => {
      resolveRest([]);
    });
    expect(selfGroups(result.current.messages[0])).toEqual(['❤️']);
  });

  it('ignores socket events for other rooms when guarding', async () => {
    let resolveRest: (value: unknown) => void = () => {};
    mockReactApi.mockReturnValue(
      new Promise((resolve) => {
        resolveRest = resolve;
      }),
    );
    const { result } = await mount([message('m1')]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });

    // Another room's event must NOT move this message's epoch
    await act(async () => {
      mockSocket.reactionUpdate?.({ conversationId: 'conv-OTHER', messageId: 'm1' });
    });
    await act(async () => {
      resolveRest([{ emoji: '❤️', count: 1, byUserIds: ['me'] }]);
    });
    // The REST body applied — same epoch, authoritative count
    expect(result.current.messages[0].reactions[0].byUserIds).toEqual(['me']);
  });

  it('reverts the optimistic reaction and toasts when the call fails', async () => {
    mockReactApi.mockRejectedValue(new Error('offline'));
    const prior = [{ emoji: '👍', count: 1, bySelf: true, byUserIds: ['me'] }];
    const { result } = await mount([message('m1', prior)]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });

    // Back to the pre-tap 👍, and the failure surfaced
    expect(selfGroups(result.current.messages[0])).toEqual(['👍']);
    expect(mockShowToast).toHaveBeenCalledWith('error', 'chat.reactionAddError');
  });

  it('clears the own reaction through the same optimistic/reconcile path', async () => {
    mockRemoveApi.mockResolvedValue([]);
    const prior = [{ emoji: '👍', count: 2, bySelf: true, byUserIds: ['friend', 'me'] }];
    const { result } = await mount([message('m1', prior)]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.clearReaction();
    });

    expect(selfGroups(result.current.messages[0])).toEqual([]);
    expect(mockRemoveApi).toHaveBeenCalledWith('conv-1', 'm1');
  });

  it('toasts instead of silently aborting when the target vanished', async () => {
    const { result } = await mount([message('m1')]);

    await act(async () => {
      result.current.reactions.openPicker('gone-id');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });

    expect(mockShowToast).toHaveBeenCalledWith('error', 'chat.reactionTargetGone');
    expect(mockReactApi).not.toHaveBeenCalled();
  });

  it('drops a straggler REST body after a room switch', async () => {
    let resolveRest: (value: unknown) => void = () => {};
    mockReactApi.mockReturnValue(
      new Promise((resolve) => {
        resolveRest = resolve;
      }),
    );
    const { result, rerender } = await mount([message('m1')]);

    await act(async () => {
      result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      result.current.reactions.applyReaction('❤️');
    });

    // Leave for another room — the epoch map clears
    await rerender({ conv: 'conv-2' });
    await act(async () => {
      resolveRest([]);
    });

    // The optimistic state stays; the cross-room straggler was dropped
    expect(selfGroups(result.current.messages[0])).toEqual(['❤️']);
  });
});
