// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine useComposer
//
//  The concurrency guarantees: a synchronous draft clear that
//  makes a double tap send once, the in-flight guard that stops
//  a retry tap racing the restore sweep onto the same temp, a
//  failed upload that re-uploads exactly once on retry, the
//  outbox persisted and rehydrated, edit mode (save, cancel,
//  unchanged, refused), quick like, typing signals, and the
//  attach caps.
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, memoryStorage, useComposer, type ChatMessage, type EngineNotice } from '../../index';


const SELF = { id: 'u1', displayName: 'Me' };

async function setup(options: { echoSends?: boolean } = {}) {
  const transport = fakeTransport({ self: SELF, echoSends: options.echoSends });
  const storage = memoryStorage();
  const notices: EngineNotice[] = [];
  const restoreListeners: (() => void)[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider
      transport={transport}
      currentUser={SELF}
      storage={storage}
      notify={(n) => notices.push(n)}
      onNetworkRestore={(cb) => {
        restoreListeners.push(cb);
        return () => {};
      }}
      makeVideoPoster={async () => ({ uri: 'file:///poster.jpg', width: 640, height: 360 })}
    >
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const composer = useComposer('c1', setMessages, messages);
      return { messages, composer, setMessages };
    },
    { wrapper },
  );
  const restore = () => restoreListeners.forEach((cb) => cb());
  return { transport, storage, notices, restore, result: hook.result, rerender: hook.rerender, unmount: hook.unmount };
}

const sends = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'sendMessage');
const uploads = (t: ReturnType<typeof fakeTransport>) => t.calls.filter((c) => c.method === 'upload');


describe('useComposer', () => {
  it('a double tap in one tick sends exactly once and swaps in the server row keeping the temp key', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.composer.onChangeText('labas');
    });
    await act(async () => {
      h.result.current.composer.sendMessage();
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('sent'));
    expect(sends(h.transport)).toHaveLength(1);
    expect(h.result.current.messages).toHaveLength(1);
    expect(h.result.current.messages[0].id.startsWith('srv-')).toBe(true);
    expect(h.result.current.messages[0].clientId?.startsWith('temp-')).toBe(true);
    expect(h.result.current.composer.text).toBe('');
  });

  it('a whitespace-only draft is cleared, never sent', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.composer.onChangeText('   ');
      h.result.current.composer.sendMessage();
    });
    expect(sends(h.transport)).toHaveLength(0);
    expect(h.result.current.composer.text).toBe('');
  });

  it('a retryable failure queues the temp, persists it, and a retry tap racing the sweep sends once', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', new Error('offline'));
    await act(async () => {
      h.result.current.composer.onChangeText('labas');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('failed'));
    expect(h.notices.map((n) => n.code)).toEqual(['send_failed']);
    expect(JSON.parse((await h.storage.getItem('outbox:c1')) ?? '{}')).toHaveProperty(h.result.current.messages[0].id);

    const release = h.transport.stall('sendMessage');
    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      h.restore();
    });
    release();
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('sent'));
    expect(sends(h.transport)).toHaveLength(2);
    expect(await h.storage.getItem('outbox:c1')).toBeNull();
  });

  it('a definitive 4xx keeps the bubble failed with a specific notice and out of the sweep', async () => {
    const h = await setup();
    h.transport.fail('sendMessage', Object.assign(new Error('too long'), { status: 400, code: 'http' }));
    await act(async () => {
      h.result.current.composer.onChangeText('x');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('failed'));
    expect(h.notices.map((n) => n.code)).toEqual(['send_too_long']);
    await act(async () => {
      h.restore();
    });
    expect(sends(h.transport)).toHaveLength(1);
    await act(async () => {
      h.result.current.composer.discardMessage(h.result.current.messages[0].id);
    });
    expect(h.result.current.messages).toHaveLength(0);
  });

  it('a failed photo upload retried through the sweep re-uploads exactly once, then sends with the path and frame', async () => {
    const h = await setup();
    h.transport.fail('upload', new Error('offline'));
    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 100, kind: 'image', width: 1200, height: 800 });
    });
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('failed'));
    expect(h.result.current.messages[0]).toMatchObject({ localImageUri: 'file:///a.jpg', mediaSize: { width: 1200, height: 800 } });
    expect(uploads(h.transport)).toHaveLength(1);

    const release = h.transport.stall('upload');
    await act(async () => {
      h.result.current.composer.retryMessage(h.result.current.messages[0]);
      h.restore();
    });
    release();
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('sent'));
    expect(uploads(h.transport)).toHaveLength(2);
    expect(sends(h.transport)).toHaveLength(1);
    const outgoing = sends(h.transport)[0].args[1] as { imageUrl?: string; media?: { width: number } };
    expect(outgoing.imageUrl).toMatch(/^\/api\/uploads\//);
    expect(outgoing.media?.width).toBe(1200);
  });

  it('a video uploads its poster, then the clip, and sends kind video with the frame and duration', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///v.mp4', name: 'v.mp4', mimeType: 'video/mp4', size: 1000, kind: 'video', width: 1920, height: 1080, duration: 12 });
    });
    await waitFor(() => expect(h.result.current.messages[0]?.status).toBe('sent'));
    expect(uploads(h.transport).map((c) => (c.args[0] as { kind: string }).kind)).toEqual(['image', 'video']);
    const outgoing = sends(h.transport)[0].args[1] as { kind: string; attachment: { mime: string }; media: { duration: number; thumbnailUrl: string } };
    expect(outgoing.kind).toBe('video');
    expect(outgoing.attachment.mime).toBe('video/mp4');
    expect(outgoing.media.duration).toBe(12);
    expect(outgoing.media.thumbnailUrl).toMatch(/^\/api\/uploads\//);
    expect(h.result.current.messages[0].video?.uri).toMatch(/^\/api\/uploads\//);
  });

  it('refuses over-cap assets before any upload', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///big.mp4', kind: 'video', size: 60 * 1024 * 1024 });
      await h.result.current.composer.attach({ uri: 'file:///long.mp4', kind: 'video', duration: 400 });
      await h.result.current.composer.attach({ uri: 'file:///big.pdf', kind: 'file', size: 6 * 1024 * 1024 });
    });
    expect(uploads(h.transport)).toHaveLength(0);
    expect(h.result.current.messages).toHaveLength(0);
    expect(h.notices.map((n) => n.detail)).toEqual(['video', 'video_duration', 'file']);
  });

  it('edit mode saves through the transport, restores the parked draft, and reverts when refused', async () => {
    const h = await setup();
    const own: ChatMessage = { id: 'srv-own', conversationId: 'c1', senderId: 'u1', senderName: 'Me', text: 'senas', createdAt: new Date().toISOString(), isOwn: true, status: 'sent', reactions: [], deleted: false };
    h.transport.rows.push(own);
    await act(async () => {
      h.result.current.setMessages([own]);
      h.result.current.composer.onChangeText('parked');
    });
    await act(async () => {
      h.result.current.composer.startEdit(own);
    });
    expect(h.result.current.composer.editing?.id).toBe('srv-own');
    expect(h.result.current.composer.text).toBe('senas');
    await act(async () => {
      h.result.current.composer.onChangeText('naujas');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(h.result.current.messages[0].text).toBe('naujas'));
    expect(h.result.current.composer.editing).toBeNull();
    expect(h.result.current.composer.text).toBe('parked');
    expect(h.transport.calls.filter((c) => c.method === 'editMessage')).toHaveLength(1);
    expect(sends(h.transport)).toHaveLength(0);

    // Unchanged text: no call. Cancel: draft back. Refused: revert
    await act(async () => {
      h.result.current.composer.startEdit({ ...own, text: 'naujas' });
      h.result.current.composer.sendMessage();
    });
    expect(h.transport.calls.filter((c) => c.method === 'editMessage')).toHaveLength(1);
    await act(async () => {
      h.result.current.composer.startEdit({ ...own, text: 'naujas' });
      h.result.current.composer.cancelEdit();
    });
    expect(h.result.current.composer.text).toBe('parked');
    h.transport.fail('editMessage', Object.assign(new Error('no'), { status: 403, code: 'http' }));
    await act(async () => {
      h.result.current.composer.startEdit({ ...own, text: 'naujas' });
      h.result.current.composer.onChangeText('trecias');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(h.notices.map((n) => n.code)).toContain('edit_failed'));
    expect(h.result.current.messages[0].text).toBe('naujas');
  });

  it('quick like sends the emoji on an empty field and the draft otherwise', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.composer.sendQuickLike();
    });
    await waitFor(() => expect(sends(h.transport)).toHaveLength(1));
    expect((sends(h.transport)[0].args[1] as { text: string }).text).toBe('👍');
    await act(async () => {
      h.result.current.composer.onChangeText('tekstas');
      h.result.current.composer.sendQuickLike();
    });
    await waitFor(() => expect(sends(h.transport)).toHaveLength(2));
    expect((sends(h.transport)[1].args[1] as { text: string }).text).toBe('tekstas');
  });

  it('typing: first keystroke signals at once, a send stops it, and the draft clamps to the limit', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.composer.onChangeText('a');
      h.result.current.composer.onChangeText('ab');
    });
    expect(h.transport.signals.filter((s) => s.name === 'typing')).toEqual([{ name: 'typing', args: ['c1', true] }]);
    await act(async () => {
      h.result.current.composer.sendMessage();
    });
    expect(h.transport.signals.filter((s) => s.name === 'typing').at(-1)).toEqual({ name: 'typing', args: ['c1', false] });
    await act(async () => {
      h.result.current.composer.onChangeText('x'.repeat(6000));
    });
    expect(h.result.current.composer.text).toHaveLength(5000);
  });

  it('the reply target is consumed by the next send and quoted on the wire', async () => {
    const h = await setup();
    const quoted: ChatMessage = { id: 'q', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'klausimas', createdAt: new Date().toISOString(), isOwn: false, status: 'read', reactions: [], deleted: false };
    h.transport.rows.push(quoted);
    await act(async () => {
      h.result.current.composer.setReplyTo(quoted);
      h.result.current.composer.onChangeText('atsakymas');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(sends(h.transport)).toHaveLength(1));
    expect((sends(h.transport)[0].args[1] as { replyToId?: string }).replyToId).toBe('q');
    expect(h.result.current.composer.replyTo).toBeNull();
    expect(h.result.current.messages[0].replyTo?.senderName).toBe('Ona');
  });
});
