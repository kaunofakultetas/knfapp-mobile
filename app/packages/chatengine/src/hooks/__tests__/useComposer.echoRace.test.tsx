// -----------------------------------------------------------
//  [*] Tests — the echo racing the send response
//
//  The realtime echo of an own send routinely lands BEFORE the
//  HTTP response on a slow uplink — every production client
//  has shipped a duplicate-bubble fix for it. Here the echo
//  arrives while sendMessage is stalled: the temp must be
//  adopted once, and the late response must reconcile into the
//  SAME row rather than append a twin.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, memoryStorage, useComposer, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };

describe('useComposer echo race', () => {
  it('an echo landing before the send response never doubles the bubble', async () => {
    const transport = fakeTransport({ self: SELF });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatEngineProvider transport={transport} currentUser={SELF} storage={memoryStorage()}>
        {children}
      </ChatEngineProvider>
    );
    const h = await renderHook(
      () => {
        const conversation = useConversation('c1');
        const composer = useComposer('c1', conversation.setMessages, conversation.messages);
        return { conversation, composer };
      },
      { wrapper },
    );
    await act(async () => {
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });

    const release = transport.stall('sendMessage');
    await act(async () => {
      h.result.current.composer.onChangeText('labas');
    });
    await act(async () => {
      h.result.current.composer.sendMessage();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    const tempId = h.result.current.conversation.messages[0].id;
    expect(tempId.startsWith('temp-')).toBe(true);

    // The room's echo overtakes the stalled response — the server
    // row carries the nonce the temp was born with
    await act(async () => {
      transport.push({
        type: 'message',
        message: { id: 'srv-echo', clientId: tempId, conversationId: 'c1', senderId: SELF.id, senderName: SELF.displayName, text: 'labas', createdAt: new Date().toISOString(), isOwn: true, status: 'sent', reactions: [], deleted: false },
      });
    });
    expect(h.result.current.conversation.messages).toHaveLength(1);
    expect(h.result.current.conversation.messages[0].id).toBe('srv-echo');

    // The late response reconciles into the SAME row
    await act(async () => {
      release();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    const rows = h.result.current.conversation.messages;
    expect(rows.filter((m) => m.text === 'labas')).toHaveLength(1);
    expect(rows[0].status).toBe('sent');
  });
});
