// -----------------------------------------------------------
//  [*] Tests — several photos as ONE gallery message
//
//  attachMany uploads every photo in pick order and sends one
//  message carrying the stored list; a mixed pick falls back to
//  one message per asset; a failure anywhere parks the whole
//  set and the retry uploads them all again.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, TransportError, fakeTransport, memoryStorage, useComposer, type ChatMessage, type EngineNotice } from '../../index';


const SELF = { id: 'u1', displayName: 'Me' };
const photo = (n: number) => ({ uri: `file:///p${n}.jpg`, name: `p${n}.jpg`, mimeType: 'image/jpeg', size: 1000 + n, width: 800, height: 600, kind: 'image' as const });

async function setup() {
  const transport = fakeTransport({ self: SELF });
  const storage = memoryStorage();
  const notices: EngineNotice[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={storage} notify={(n) => notices.push(n)}>
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const composer = useComposer('c1', setMessages, messages);
      return { messages, composer };
    },
    { wrapper },
  );
  return { transport, notices, result: hook.result };
}

const sends = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'sendMessage');
const uploads = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'upload');


describe('useComposer gallery', () => {
  it('uploads every photo in order and sends one message carrying the stored list', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2), photo(3)]);
    });
    expect(uploads(h.transport)).toHaveLength(3);
    expect(sends(h.transport)).toHaveLength(1);
    const row = h.result.current.messages[0];
    expect(row.kind).toBe('image');
    expect(row.status).toBe('sent');
    expect(row.gallery?.map((g) => g.url)).toHaveLength(3);
    // Stored paths, not the local uris — and the frame rode along
    expect(row.gallery?.every((g) => !g.url.startsWith('file:'))).toBe(true);
    expect(row.gallery?.[0].width).toBeTruthy();
  });

  it('a mixed pick falls back to one message per asset — no gallery', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), { uri: 'file:///d.pdf', name: 'd.pdf', mimeType: 'application/pdf', size: 500, kind: 'file' as const }]);
    });
    expect(sends(h.transport)).toHaveLength(2);
    expect(h.result.current.messages.every((m) => !m.gallery)).toBe(true);
  });

  it('a failed upload parks the whole set; the retry uploads every photo again and sends once', async () => {
    const h = await setup();
    h.transport.fail('upload', new TransportError('offline', 'network'), 1);
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2)]);
    });
    expect(sends(h.transport)).toHaveLength(0);
    const failed = h.result.current.messages[0];
    expect(failed.status).toBe('failed');
    // The optimistic bubble keeps showing the local picks
    expect(failed.gallery?.map((g) => g.url)).toEqual(['file:///p1.jpg', 'file:///p2.jpg']);

    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    expect(uploads(h.transport)).toHaveLength(3); // 1 failed + 2 on retry
    expect(sends(h.transport)).toHaveLength(1);
    expect(h.result.current.messages[0].status).toBe('sent');
    expect(h.result.current.messages[0].gallery?.every((g) => !g.url.startsWith('file:'))).toBe(true);
  });
});
