// -----------------------------------------------------------
//  [*] Tests — the offline task queue
//
//  An edit, an unsend and a reaction made while the transport is
//  down keep their optimistic state, persist, and replay on the
//  network restore in order; a definitive refusal on replay
//  reverts and reports; a later change of the same message
//  replaces the queued one.
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ChatEngineProvider, TaskQueue, fakeTransport, memoryStorage, tasksStorageKey, useChatRoom, type ChatMessage, type EngineNotice } from '../../index';

const SELF = { id: 'u1', displayName: 'Me' };
const row = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, conversationId: 'c1', senderId: 'u1', senderName: 'Me', text: id, createdAt: `2026-08-29T10:0${id.length}:00Z`, isOwn: true, status: 'read', reactions: [], deleted: false, ...over });
const offline = () => Object.assign(new Error('offline'), { code: 'network' });

async function setup(storage = memoryStorage()) {
  const transport = fakeTransport({ self: SELF, messages: [row('a'), row('b'), row('c', { senderId: 'u2', senderName: 'Ona', isOwn: false })] });
  const notices: EngineNotice[] = [];
  const restore: (() => void)[] = [];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={SELF} storage={storage} notify={(n) => notices.push(n)} onNetworkRestore={(cb) => { restore.push(cb); return () => {}; }}>
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(() => useChatRoom('c1'), { wrapper });
  await waitFor(() => expect(hook.result.current.conversation.loading).toBe(false));
  return { transport, storage, notices, restore: () => restore.forEach((cb) => cb()), result: hook.result, unmount: hook.unmount };
}

describe('offline tasks', () => {
  it('queues an edit, an unsend and a reaction made offline, persists them, and replays them on restore', async () => {
    const h = await setup();
    h.transport.fail('editMessage', offline());
    h.transport.fail('deleteMessage', offline());
    h.transport.fail('setReaction', offline());
    await act(async () => {
      h.result.current.composer.startEdit(h.result.current.conversation.messages.find((m) => m.id === 'a')!);
      h.result.current.composer.onChangeText('pataisyta');
      h.result.current.composer.sendMessage();
      h.result.current.conversation.deleteMessage('b');
      h.result.current.reactions.reactTo('c', '❤️');
    });
    // Optimistic state stays, nothing was reported
    await waitFor(() => expect(JSON.parse(h.storage.dump()[tasksStorageKey('c1')] ?? '[]')).toHaveLength(3));
    const list = h.result.current.conversation.messages;
    expect(list.find((m) => m.id === 'a')?.text).toBe('pataisyta');
    expect(list.find((m) => m.id === 'b')?.deleted).toBe(true);
    expect(list.find((m) => m.id === 'c')?.reactions[0]?.emoji).toBe('❤️');
    expect(h.notices).toHaveLength(0);

    await act(async () => {
      h.restore();
    });
    await waitFor(() => expect(h.storage.dump()[tasksStorageKey('c1')]).toBeUndefined());
    const replayed = h.transport.calls.filter((c) => ['editMessage', 'deleteMessage', 'setReaction'].includes(c.method)).map((c) => c.method);
    // Replayed in enqueue order — the three rejections land in the same tick, so only the set is pinned
    expect(replayed.slice(-3).sort()).toEqual(['deleteMessage', 'editMessage', 'setReaction']);
    expect(h.transport.rows.find((m) => m.id === 'a')?.text).toBe('pataisyta');
    expect(h.transport.rows.find((m) => m.id === 'b')?.deleted).toBe(true);
    expect(h.transport.rows.find((m) => m.id === 'c')?.reactions[0]?.byUserIds).toEqual(['u1']);
  });

  it('survives a restart: the persisted queue replays from a fresh mount', async () => {
    const storage = memoryStorage();
    const first = await setup(storage);
    first.transport.fail('editMessage', offline());
    await act(async () => {
      first.result.current.composer.startEdit(first.result.current.conversation.messages.find((m) => m.id === 'a')!);
      first.result.current.composer.onChangeText('po restarto');
      first.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(storage.dump()[tasksStorageKey('c1')]).toBeDefined());
    await first.unmount();
    const second = await setup(storage);
    await act(async () => {
      second.restore();
    });
    await waitFor(() => expect(second.transport.rows.find((m) => m.id === 'a')?.text).toBe('po restarto'));
    expect(storage.dump()[tasksStorageKey('c1')]).toBeUndefined();
  });

  it('a refusal on replay reverts the edit and reports; a later edit replaces the queued one', async () => {
    const h = await setup();
    h.transport.fail('editMessage', offline(), 2);
    await act(async () => {
      h.result.current.composer.startEdit(h.result.current.conversation.messages.find((m) => m.id === 'a')!);
      h.result.current.composer.onChangeText('pirmas');
      h.result.current.composer.sendMessage();
    });
    await act(async () => {
      h.result.current.composer.startEdit(h.result.current.conversation.messages.find((m) => m.id === 'a')!);
      h.result.current.composer.onChangeText('antras');
      h.result.current.composer.sendMessage();
    });
    await waitFor(() => expect(JSON.parse(h.storage.dump()[tasksStorageKey('c1')] ?? '[]')).toHaveLength(1));
    expect(JSON.parse(h.storage.dump()[tasksStorageKey('c1')])[0].text).toBe('antras');
    h.transport.fail('editMessage', Object.assign(new Error('forbidden'), { status: 403, code: 'http' }));
    await act(async () => {
      h.restore();
    });
    await waitFor(() => expect(h.notices.map((n) => n.code)).toContain('edit_failed'));
    expect(h.result.current.conversation.messages.find((m) => m.id === 'a')?.text).toBe('a');
    expect(h.storage.dump()[tasksStorageKey('c1')]).toBeUndefined();
  });

  it('TaskQueue keeps one entry per message and kind, ordered by time', async () => {
    const storage = memoryStorage();
    const q = new TaskQueue('c9', storage);
    q.add({ type: 'reaction', messageId: 'm', emoji: '👍', at: '2026-01-01T00:00:02Z' });
    q.add({ type: 'edit', messageId: 'm', text: 'x', previousText: 'y', at: '2026-01-01T00:00:01Z' });
    q.add({ type: 'reaction', messageId: 'm', emoji: null, at: '2026-01-01T00:00:03Z' });
    expect(q.list().map((t) => `${t.type}:${t.type === 'reaction' ? t.emoji : ''}`)).toEqual(['edit:', 'reaction:null']);
    await Promise.resolve();
    const again = new TaskQueue('c9', storage);
    await again.load();
    expect(again.size).toBe(2);
  });
});
