// -----------------------------------------------------------
//  [*] Tests — voice notes through the composer
//
//  An audio asset uploads with kind=audio and sends ONE
//  message: kind 'audio', the stored file as the attachment,
//  the length in media.duration. The bubble swaps its local
//  uri for the stored one on commit.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, memoryStorage, useComposer, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };

describe('useComposer voice notes', () => {
  it('uploads the clip, sends kind audio with its duration, and commits the stored uri', async () => {
    const transport = fakeTransport({ self: SELF });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatEngineProvider transport={transport} currentUser={SELF} storage={memoryStorage()}>
        {children}
      </ChatEngineProvider>
    );
    const h = await renderHook(
      () => {
        const [messages, setMessages] = useState<ChatMessage[]>([]);
        return { messages, composer: useComposer('c1', setMessages, messages) };
      },
      { wrapper },
    );

    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///note.m4a', name: 'note.m4a', mimeType: 'audio/m4a', size: 90_000, duration: 12, kind: 'audio' });
    });

    const upload = transport.calls.find((c) => c.method === 'upload');
    expect((upload?.args[0] as { kind: string }).kind).toBe('audio');
    const send = transport.calls.find((c) => c.method === 'sendMessage');
    const outgoing = send?.args[1] as { kind?: string; attachment?: { url: string }; media?: { duration?: number } };
    expect(outgoing.kind).toBe('audio');
    expect(outgoing.attachment?.url).toBeTruthy();
    expect(outgoing.media?.duration).toBe(12);

    const row = h.result.current.messages[0];
    expect(row.kind).toBe('audio');
    expect(row.status).toBe('sent');
    expect(row.audio?.uri.startsWith('file:')).toBe(false);
    expect(row.audio?.duration).toBe(12);
  });
});
