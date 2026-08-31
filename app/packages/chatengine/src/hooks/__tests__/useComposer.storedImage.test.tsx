// -----------------------------------------------------------
//  [*] Tests — sending a stored picture (the meme library)
//
//  sendStoredImage skips the upload leg entirely: one send
//  carrying the library url and its frame, an optimistic
//  bubble first, a retryable failure parked like any text send.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, TransportError, fakeTransport, memoryStorage, useComposer, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };

async function setup() {
  const transport = fakeTransport({ self: SELF });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={memoryStorage()}>
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return { messages, composer: useComposer('c1', setMessages, messages) };
    },
    { wrapper },
  );
  return { transport, result: hook.result };
}

describe('useComposer sendStoredImage', () => {
  it('sends the library url with its frame and preview — no upload call', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.sendStoredImage('/api/memes/file/aciu.gif', { width: 240, height: 240, preview: 'data:image/jpeg;base64,tiny' });
    });
    expect(h.transport.calls.filter((c) => c.method === 'upload')).toHaveLength(0);
    const send = h.transport.calls.find((c) => c.method === 'sendMessage');
    const outgoing = send?.args[1] as { imageUrl?: string; media?: { width?: number; preview?: string } };
    expect(outgoing.imageUrl).toBe('/api/memes/file/aciu.gif');
    expect(outgoing.media?.width).toBe(240);
    expect(outgoing.media?.preview).toBe('data:image/jpeg;base64,tiny');
    expect(h.result.current.messages[0].status).toBe('sent');
    expect(h.result.current.messages[0].imageUrl).toBe('/api/memes/file/aciu.gif');
  });

  it('a retryable failure parks like any send', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', new TransportError('offline', 'network'), 3);
    await act(async () => {
      await h.result.current.composer.sendStoredImage('/api/memes/file/ne.gif');
    });
    expect(h.result.current.messages[0].status).toBe('failed');
    expect(h.result.current.messages[0].imageUrl).toBe('/api/memes/file/ne.gif');
  });
});
