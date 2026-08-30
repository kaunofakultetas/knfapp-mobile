// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine useReactions
//
//  Optimistic apply / clear with the two-step reconcile: the
//  transport's groups land only while the per-message epoch
//  still matches (a 'reactions' event or a later pick moves
//  it), and a refusal reverts only this user's membership.
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { ChatEngineProvider, fakeTransport, useReactions, type ChatMessage, type EngineNotice } from '../../index';


const SELF = { id: 'u1', displayName: 'Me' };
const target = (): ChatMessage => ({ id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Ona', text: 'labas', createdAt: '2026-08-29T10:00:00Z', isOwn: false, status: 'read', reactions: [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }], deleted: false });

async function setup() {
  const transport = fakeTransport({ self: SELF, messages: [target()] });
  const notices: EngineNotice[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} notify={(n) => notices.push(n)}>{children}</ChatEngineProvider>
  );
  const hook = await renderHook(
    () => {
      const [messages, setMessages] = useState<ChatMessage[]>([target()]);
      const reactions = useReactions('c1', messages, setMessages);
      return { messages, reactions, setMessages };
    },
    { wrapper },
  );
  return { transport, notices, result: hook.result, rerender: hook.rerender, unmount: hook.unmount };
}


describe('useReactions', () => {
  it('applies optimistically and lands the transport groups with bySelf for the viewer', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.reactions.openPicker('m1');
    });
    expect(h.result.current.reactions.pickerOpen).toBe(true);
    await act(async () => {
      h.result.current.reactions.applyReaction('❤️');
    });
    expect(h.result.current.reactions.pickerOpen).toBe(false);
    expect(h.result.current.messages[0].reactions).toEqual([
      { emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] },
      { emoji: '❤️', count: 1, bySelf: true, byUserIds: ['u1'] },
    ]);
    await waitFor(() => expect(h.transport.calls.filter((c) => c.method === 'setReaction')).toHaveLength(1));
    await waitFor(() => expect(h.result.current.messages[0].reactions.find((r) => r.emoji === '❤️')?.bySelf).toBe(true));
  });

  it('a refused apply reverts only this user, keeping events that landed in flight', async () => {
    const h = await setup();
    h.transport.fail('setReaction', Object.assign(new Error('no'), { status: 403, code: 'http' }));
    const release = h.transport.stall('setReaction');
    await act(async () => {
      h.result.current.reactions.reactTo('m1', '❤️');
    });
    // Another member reacts while our call is in flight — the event
    // bumps the epoch here; useConversation (not rendered in this
    // test) is what lands its payload, so the list is updated by hand
    await act(async () => {
      h.transport.push({ type: 'reactions', conversationId: 'c1', messageId: 'm1', reactions: [{ emoji: '👍', count: 1, byUserIds: ['u2'] }, { emoji: '❤️', count: 2, byUserIds: ['u1', 'u3'] }] });
      h.result.current.setMessages((prev) => prev.map((m) => ({ ...m, reactions: [{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }, { emoji: '❤️', count: 2, bySelf: true, byUserIds: ['u1', 'u3'] }] })));
    });
    release();
    await waitFor(() => expect(h.notices.map((n) => n.code)).toContain('reaction_add_failed'));
    // The revert touched u1 only — u3's heart from the event survives
    await waitFor(() => expect(h.result.current.messages[0].reactions.find((r) => r.emoji === '❤️')?.byUserIds).toEqual(['u3']));
  });

  it('a delayed response never clobbers a newer event', async () => {
    const h = await setup();
    const release = h.transport.stall('setReaction');
    await act(async () => {
      h.result.current.reactions.reactTo('m1', '❤️');
    });
    await act(async () => h.transport.push({ type: 'reactions', conversationId: 'c1', messageId: 'm1', reactions: [{ emoji: '😂', count: 1, byUserIds: ['u2'] }] }));
    // The server's answer would differ from the optimistic state —
    // if it were applied, 😂 would appear
    h.transport.rows[0].reactions = [{ emoji: '😂', count: 1, bySelf: false, byUserIds: ['u2'] }];
    release();
    await new Promise((r) => setTimeout(r, 10));
    // The stale REST body is dropped: the optimistic state stands
    // (useConversation, not this hook, applies the event's payload)
    expect(h.result.current.messages[0].reactions.map((r) => r.emoji)).toEqual(['👍', '❤️']);
  });

  it('clearing removes own reaction and a vanished target is reported', async () => {
    const h = await setup();
    await act(async () => {
      h.result.current.setMessages([{ ...target(), reactions: [{ emoji: '👍', count: 2, bySelf: true, byUserIds: ['u2', 'u1'] }] }]);
    });
    await act(async () => {
      h.result.current.reactions.openPicker('m1');
    });
    await act(async () => {
      h.result.current.reactions.clearReaction();
    });
    expect(h.result.current.messages[0].reactions).toEqual([{ emoji: '👍', count: 1, bySelf: false, byUserIds: ['u2'] }]);
    await act(async () => {
      h.result.current.reactions.reactTo('ghost', '👍');
    });
    expect(h.notices.map((n) => n.code)).toContain('reaction_target_gone');
  });
});
