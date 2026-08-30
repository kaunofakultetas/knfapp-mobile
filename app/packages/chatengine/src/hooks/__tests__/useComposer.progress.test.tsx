// -----------------------------------------------------------
//  [*] Tests — upload progress and the self-retry
//
//  The optimistic bubble carries the upload's fraction while
//  the bytes go up (the fake reports 0.5 before its gate) and
//  drops it on failure; a retryably parked send re-drives
//  itself after the backoff without any tap.
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

const sends = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'sendMessage');

describe('useComposer upload progress', () => {
  it('shows the fraction mid-upload and clears it from the failed bubble', async () => {
    const h = await setup();
    const release = h.transport.stall('upload');
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = h.result.current.composer.attach({ uri: 'file:///p.jpg', name: 'p.jpg', mimeType: 'image/jpeg', size: 1000, kind: 'image' });
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(h.result.current.messages[0].uploadProgress).toBe(0.5);

    await act(async () => {
      release();
      await pending;
    });
    expect(h.result.current.messages[0].status).toBe('sent');
    expect(h.result.current.messages[0].uploadProgress).toBeUndefined();

    // A failing upload leaves no stale ring on the failed bubble
    h.transport.fail('upload', new TransportError('offline', 'network'), 1);
    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///q.jpg', name: 'q.jpg', mimeType: 'image/jpeg', size: 1000, kind: 'image' });
    });
    const failed = h.result.current.messages.find((m) => m.status === 'failed');
    expect(failed?.uploadProgress).toBeUndefined();
  });
});

describe('useComposer auto-retry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('re-drives a retryably parked send after the backoff, no tap needed', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', new TransportError('offline', 'network'), 1);
    await act(async () => {
      h.result.current.composer.onChangeText('labas');
    });
    await act(async () => {
      h.result.current.composer.sendMessage();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(sends(h.transport)).toHaveLength(1);
    expect(h.result.current.messages[0].status).toBe('failed');

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(sends(h.transport)).toHaveLength(2);
    expect(h.result.current.messages[0].status).toBe('sent');
  });
});
