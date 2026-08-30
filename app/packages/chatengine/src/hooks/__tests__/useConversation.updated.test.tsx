import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useConversation, type ChatMessage } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const row = (id: string): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: `see https://knf.vu.lt/${id}`, createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [], deleted: false });

describe("the 'updated' event", () => {
  it('merges the server patch into the held row — a link preview landing after the send', async () => {
    const transport = fakeTransport({ self: SELF, messages: [row('a'), { ...row('gone'), deleted: true, text: '' }] });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const card = { url: 'https://knf.vu.lt/a', title: 'KNF', description: 'Kauno fakultetas', siteName: 'knf.vu.lt', imageUrl: '/api/uploads/p.jpg' };
    await act(async () => {
      transport.push({ type: 'updated', conversationId: 'c1', messageId: 'a', patch: { linkPreview: card } });
      transport.push({ type: 'updated', conversationId: 'c1', messageId: 'gone', patch: { linkPreview: card } });
      transport.push({ type: 'updated', conversationId: 'other', messageId: 'a', patch: { text: 'nope' } });
    });
    expect(h.result.current.messages.find((m) => m.id === 'a')?.linkPreview).toEqual(card);
    expect(h.result.current.messages.find((m) => m.id === 'gone')?.linkPreview).toBeUndefined();
    expect(h.result.current.messages.find((m) => m.id === 'a')?.text).toBe('see https://knf.vu.lt/a');
  });
});
