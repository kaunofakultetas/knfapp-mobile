// -----------------------------------------------------------
//  [*] Tests — several photos as ONE gallery message
//
//  attachMany uploads every photo in pick order and sends one
//  message carrying the stored list; a mixed pick falls back to
//  one message per asset; a failure anywhere parks the whole
//  set and the retry uploads them all again — through the
//  persisted outbox too, which must hand the picked set back;
//  and a parked entry with nothing left to send is refused
//  rather than posted as an empty body.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, TEMP_ID_PREFIX, TransportError, fakeTransport, memoryStorage, readOutbox, useComposer, type ChatMessage, type EngineNotice } from '../../index';


const SELF = { id: 'u1', displayName: 'Me' };
const photo = (n: number) => ({ uri: `file:///p${n}.jpg`, name: `p${n}.jpg`, mimeType: 'image/jpeg', size: 1000 + n, width: 800, height: 600, kind: 'image' as const });

// The provider scopes persistence per account — the same view
// the composer reads and writes through
const scoped = (storage: ReturnType<typeof memoryStorage>) => ({
  getItem: (key: string) => storage.getItem(`u:${SELF.id}:${key}`),
  setItem: (key: string, value: string) => storage.setItem(`u:${SELF.id}:${key}`, value),
  removeItem: (key: string) => storage.removeItem(`u:${SELF.id}:${key}`),
});

async function setup(initial: ChatMessage[] = [], storage = memoryStorage()) {
  const transport = fakeTransport({ self: SELF });
  const notices: EngineNotice[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={storage} notify={(n) => notices.push(n)}>
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>(initial);
      const composer = useComposer('c1', setMessages, messages);
      return { messages, composer };
    },
    { wrapper },
  );
  return { transport, storage, notices, result: hook.result };
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

  it('a parked gallery persists its picked set — the outbox hands it back with assets', async () => {
    const h = await setup();
    h.transport.fail('upload', new TransportError('offline', 'network'), 1);
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2)]);
    });
    expect(h.result.current.messages[0].status).toBe('failed');

    // The sanitizer used to rebuild the entry without `assets`,
    // so every redrive path posted an empty body
    const entries = await readOutbox(scoped(h.storage), 'c1');
    expect(entries.size).toBe(1);
    const [entry] = Array.from(entries.values());
    expect(entry.assets?.map((a) => a.uri)).toEqual(['file:///p1.jpg', 'file:///p2.jpg']);
  });

  it('a persisted entry with nothing left to send is refused — no request, the bubble stays failed', async () => {
    const tempId = `${TEMP_ID_PREFIX}dead`;
    const storage = memoryStorage();
    // What an older build's sanitizer left behind for a parked
    // gallery: the body, without the picked set
    await scoped(storage).setItem('outbox:c1', JSON.stringify({ [tempId]: { text: '' } }));
    const bubble: ChatMessage = {
      id: tempId, clientId: tempId, conversationId: 'c1', senderId: SELF.id, senderName: SELF.displayName,
      text: '', kind: 'image', createdAt: '2026-09-21T10:00:00Z', isOwn: true, status: 'failed', reactions: [], deleted: false,
    };
    const h = await setup([bubble], storage);
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    expect(sends(h.transport)).toHaveLength(0);
    expect(h.result.current.messages[0].status).toBe('failed');
    expect(h.notices.map((n) => n.code)).toContain('upload_failed');
  });
});
