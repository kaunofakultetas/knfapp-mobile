// -----------------------------------------------------------
//  [*] Tests — several photos as ONE gallery message
//
//  attachMany uploads every photo in pick order and sends one
//  message carrying the stored list; a mixed pick falls back to
//  one message per asset; a failure anywhere parks the whole
//  set and the retry uploads only what is still missing — the
//  photos that made it are reused, in memory and through the
//  persisted outbox, which must hand the picked set back; a
//  send that will never happen hands its stored photos back;
//  and a parked entry with nothing left to send is refused
//  rather than posted as an empty body.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, TEMP_ID_PREFIX, TransportError, fakeTransport, memoryStorage, readOutbox, useComposer, type ChatMessage, type EngineNotice } from '../../index';


// The signed-in viewer
const SELF = { id: 'u1', displayName: 'Me' };







// -----------------------------------------------------------
// photo
// -----------------------------------------------------------
//
// The n-th picked photo, as the host's picker hands it over.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const photo = (n: number) => ({ uri: `file:///p${n}.jpg`, name: `p${n}.jpg`, mimeType: 'image/jpeg', size: 1000 + n, width: 800, height: 600, kind: 'image' as const });







// -----------------------------------------------------------
// scoped
// -----------------------------------------------------------
//
// The provider scopes persistence per account — the same view
// the composer reads and writes through.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const scoped = (storage: ReturnType<typeof memoryStorage>) => ({
  getItem: (key: string) => storage.getItem(`u:${SELF.id}:${key}`),
  setItem: (key: string, value: string) => storage.setItem(`u:${SELF.id}:${key}`, value),
  removeItem: (key: string) => storage.removeItem(`u:${SELF.id}:${key}`),
});







// -----------------------------------------------------------
// setup
// -----------------------------------------------------------
//
// The composer over the fake transport and a (shareable)
// memory storage, with the engine's notices collected.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// sends
// -----------------------------------------------------------
//
// The transport's sendMessage calls, from its own log.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const sends = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'sendMessage');







// -----------------------------------------------------------
// uploads
// -----------------------------------------------------------
//
// The transport's upload calls, from its own log.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

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

  it('a failed first upload parks the whole set; the retry uploads it and sends once', async () => {
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


// KNF-118: every stored photo counts against the sender's quota —
// a retry must not store what is already stored, and a send that
// will never happen must hand its files back
describe('useComposer gallery uploads are never paid twice', () => {
  // The transport's upload, failing (retryably) on exactly the
  // n-th call — counted here, independent of the fake's own log
  const failNth = (h: Awaited<ReturnType<typeof setup>>, nth: number) => {
    const original = h.transport.upload.bind(h.transport);
    const seen: string[] = [];
    h.transport.upload = async (asset, onProgress) => {
      seen.push(asset.uri);
      if (seen.length === nth) throw new TransportError('offline', 'network');
      return original(asset, onProgress);
    };
    return seen;
  };

  it('a failure mid-set retries only the photos still missing', async () => {
    const h = await setup();
    const seen = failNth(h, 2);
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2), photo(3)]);
    });
    expect(h.result.current.messages[0].status).toBe('failed');
    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    // p1 stored once, p2 failed then stored, p3 stored — never p1 twice
    expect(seen).toEqual(['file:///p1.jpg', 'file:///p2.jpg', 'file:///p2.jpg', 'file:///p3.jpg']);
    expect(sends(h.transport)).toHaveLength(1);
    expect(h.result.current.messages[0].gallery).toHaveLength(3);
  });

  it('the reuse survives a relaunch through the persisted outbox', async () => {
    const storage = memoryStorage();
    const first = await setup([], storage);
    failNth(first, 2);
    await act(async () => {
      await first.result.current.composer.attachMany([photo(1), photo(2)]);
    });
    const [entry] = Array.from((await readOutbox(scoped(storage), 'c1')).values());
    expect(entry.uploaded?.map((u) => u.uri)).toEqual(['file:///p1.jpg']);
    expect(entry.ownUploads).toHaveLength(1);

    // A fresh composer over the same storage and the failed bubble
    const bubble = first.result.current.messages[0];
    const second = await setup([bubble], storage);
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    await act(async () => {
      second.result.current.composer.retryMessage(second.result.current.messages[0]);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    expect(uploads(second.transport).map((c) => (c.args[0] as { uri: string }).uri)).toEqual(['file:///p2.jpg']);
    expect(sends(second.transport)).toHaveLength(1);
  });

  it('a send refused for good hands every stored photo back', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', new TransportError('blocked', 'http', 403, 'pair_blocked'));
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2)]);
    });
    const deleted = h.transport.calls.filter((c) => c.method === 'deleteUpload').map((c) => c.args[0]);
    expect(deleted).toHaveLength(2);
    expect(deleted.every((url) => typeof url === 'string' && (url as string).startsWith('/api/uploads/'))).toBe(true);
  });

  it('discarding a parked set hands its stored photos back', async () => {
    const h = await setup();
    failNth(h, 2);
    await act(async () => {
      await h.result.current.composer.attachMany([photo(1), photo(2)]);
    });
    await act(async () => {
      h.result.current.composer.discardMessage(h.result.current.messages[0].id);
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(h.result.current.messages).toHaveLength(0);
    expect(h.transport.calls.filter((c) => c.method === 'deleteUpload')).toHaveLength(1);
  });

  it('a stored picture that was never ours (a library meme) is never deleted', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', new TransportError('blocked', 'http', 403, 'pair_blocked'));
    await act(async () => {
      await h.result.current.composer.sendStoredImage('/api/memes/file/' + 'a'.repeat(32) + '.gif', { width: 200, height: 200 });
    });
    expect(h.result.current.messages[0].status).toBe('failed');
    expect(h.transport.calls.filter((c) => c.method === 'deleteUpload')).toHaveLength(0);
  });

  it('a video whose clip failed reuses its stored poster on the retry', async () => {
    const h = await setup();
    const seen = failNth(h, 2);
    // The host's own poster frame: uploaded first, then the clip
    const clip = { uri: 'file:///v.mp4', name: 'v.mp4', mimeType: 'video/mp4', size: 5000, kind: 'video' as const, duration: 4, width: 640, height: 360, posterUri: 'file:///poster.jpg' };
    await act(async () => {
      await h.result.current.composer.attach(clip);
    });
    expect(h.result.current.messages[0].status).toBe('failed');
    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    // poster, clip (failed), clip again — the poster stays stored once
    expect(seen.filter((uri) => uri !== 'file:///v.mp4')).toHaveLength(1);
    expect(sends(h.transport)).toHaveLength(1);
  });
});
