// -----------------------------------------------------------
//  [*] Tests — guest composer, asset naming, quote-in-draft
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, draftReplyKey, fakeTransport, memoryStorage, useComposer, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };

async function setup(options: { guest?: boolean; storage?: ReturnType<typeof memoryStorage> } = {}) {
  const transport = fakeTransport({ self: SELF });
  const storage = options.storage ?? memoryStorage();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={options.guest ? null : SELF} storage={storage}>{children}</ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      const composer = useComposer('c1', setMessages, messages);
      return { messages, composer };
    },
    { wrapper },
  );
  return { transport, storage, result: hook.result, unmount: hook.unmount };
}

describe('useComposer', () => {
  it('a guest cannot send: canSend is false and a send leaves no row and no request', async () => {
    const h = await setup({ guest: true });
    expect(h.result.current.composer.canSend).toBe(false);
    await act(async () => {
      h.result.current.composer.onChangeText('labas');
      h.result.current.composer.sendMessage();
      await h.result.current.composer.attach({ uri: 'file:///a.jpg', kind: 'image' });
    });
    expect(h.result.current.messages).toHaveLength(0);
    expect(h.transport.calls).toHaveLength(0);
  });

  it('names the upload after its bytes (HEIC → jpg)', async () => {
    const h = await setup();
    await act(async () => {
      await h.result.current.composer.attach({ uri: 'file:///IMG_1.HEIC', name: 'IMG_1.HEIC', mimeType: 'image/jpeg', size: 10, kind: 'image' });
    });
    await waitFor(() => expect(h.transport.calls.some((c) => c.method === 'upload')).toBe(true));
    const upload = h.transport.calls.find((c) => c.method === 'upload')!.args[0] as { name: string };
    expect(upload.name).toBe('IMG_1.jpg');
  });

  it('persists the quoted message beside the draft and restores both', async () => {
    const storage = memoryStorage();
    const first = await setup({ storage });
    const quoted: ChatMessage = { id: 'q', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'klausimas', createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [], deleted: false };
    await act(async () => {
      first.result.current.composer.setReplyTo(quoted);
      first.result.current.composer.onChangeText('atsakymas');
    });
    await waitFor(() => expect(storage.dump()[draftReplyKey('c1')]).toBeDefined());
    await first.unmount();
    const second = await setup({ storage });
    await waitFor(() => expect(second.result.current.composer.text).toBe('atsakymas'));
    expect(second.result.current.composer.replyTo?.id).toBe('q');
    // Sending consumes the quote and clears it from storage
    await act(async () => {
      second.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(second.result.current.messages[0]?.status).toBe('sent'));
    expect(storage.dump()[draftReplyKey('c1')]).toBeUndefined();
  });
});
