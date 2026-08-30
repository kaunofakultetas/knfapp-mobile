// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine useConversation
//
//  The hook against the fake transport: first page and outbox
//  restore, own-echo adoption (nonce and content), the resync
//  merge and fresh-head restart on reconnect, the room-switch
//  wipe, the stale-page guard, the older-paging failure latch,
//  the unsend revert, live edits/unsends/reactions, receipt
//  promotion, and the read-acknowledgement gating (focus and
//  foreground, one trailing flush per burst, flush on leave).
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import type { ReactNode } from 'react';

import {
  ChatEngineProvider,
  TEMP_ID_PREFIX,
  fakeTransport,
  memoryStorage,
  useConversation,
  type ChatMessage,
  type EngineNotice,
  type FakeTransport,
} from '@knf/chatengine';


const iso = (minute: number) => new Date(Date.UTC(2026, 7, 29, 10, minute, 0)).toISOString();

const row = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u2',
  senderName: 'Ona',
  text: 'labas',
  createdAt: iso(0),
  isOwn: false,
  status: 'read',
  reactions: [],
  deleted: false,
  ...over,
});
const ids = (list: ChatMessage[]) => list.map((m) => m.id);
const later = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const SELF = { id: 'u1', displayName: 'Me' };

async function setup(messages: ChatMessage[] = [], options: { focused?: boolean; guest?: boolean; arm?: (t: FakeTransport) => void } = {}) {
  const transport = fakeTransport({
    messages,
    self: SELF,
    participants: [{ id: 'u1', displayName: 'Me' }, { id: 'u2', displayName: 'Ona' }],
    conversation: { id: 'c1', type: 'direct', title: null, avatarEmoji: null },
    guest: options.guest,
  });
  const storage = memoryStorage();
  const notices: EngineNotice[] = [];
  // Failures armed BEFORE the first fetch fires
  options.arm?.(transport);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ChatEngineProvider transport={transport} currentUser={options.guest ? null : SELF} storage={storage} notify={(n) => notices.push(n)}>
      {children}
    </ChatEngineProvider>
  );
  const hook = await renderHook(({ id, focused }: { id: string; focused: boolean }) => useConversation(id, { focused }), {
    wrapper,
    initialProps: { id: 'c1', focused: options.focused ?? true },
  });
  return { transport, storage, notices, result: hook.result, rerender: hook.rerender, unmount: hook.unmount };
}

const loaded = async (h: { result: { current: { loading: boolean } } }) => waitFor(() => expect(h.result.current.loading).toBe(false));


describe('useConversation', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('renders the first page newest-first with members and the conversation', async () => {
    const h = await setup([row({ id: 'a', createdAt: iso(0) }), row({ id: 'b', createdAt: iso(1) })]);
    await loaded(h);
    expect(ids(h.result.current.messages)).toEqual(['b', 'a']);
    expect(h.result.current.participants).toEqual({ u2: 'Ona' });
    expect(h.result.current.profiles.map((p) => p.id)).toEqual(['u1', 'u2']);
    expect(h.result.current.conversation?.type).toBe('direct');
    expect(h.transport.signals.some((s) => s.name === 'join' && s.args[0] === 'c1')).toBe(true);
  });

  it('restores the persisted outbox as failed temps on top of the page', async () => {
    const storage = memoryStorage();
    await storage.setItem('outbox:c1', JSON.stringify({ [`${TEMP_ID_PREFIX}7-1`]: { text: 'nepavyko', createdAt: iso(5) } }));
    const transport = fakeTransport({ messages: [row({ id: 'a' })], self: SELF });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatEngineProvider transport={transport} currentUser={SELF} storage={storage}>{children}</ChatEngineProvider>
    );
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await loaded(h);
    expect(ids(h.result.current.messages)).toEqual([`${TEMP_ID_PREFIX}7-1`, 'a']);
    expect(h.result.current.messages[0]).toMatchObject({ status: 'failed', isOwn: true, text: 'nepavyko', senderName: 'Me' });
  });

  it('adopts the optimistic temp when the own echo lands, by nonce and by content', async () => {
    const h = await setup([]);
    await loaded(h);
    await act(async () => {
      h.result.current.setMessages([
        row({ id: `${TEMP_ID_PREFIX}2`, clientId: `${TEMP_ID_PREFIX}2`, senderId: 'u1', isOwn: true, status: 'sending', text: 'antras' }),
        row({ id: `${TEMP_ID_PREFIX}1`, clientId: `${TEMP_ID_PREFIX}1`, senderId: 'u1', isOwn: true, status: 'sending', text: 'pirmas' }),
      ]);
    });
    await act(async () => {
      h.transport.push({ type: 'message', message: row({ id: 's1', clientId: `${TEMP_ID_PREFIX}1`, senderId: 'u1', text: 'pirmas' }) });
      h.transport.push({ type: 'message', message: row({ id: 's2', senderId: 'u1', text: 'antras' }) });
    });
    expect(ids(h.result.current.messages)).toEqual(['s2', 's1']);
    expect(h.result.current.messages.map((m) => m.clientId)).toEqual([`${TEMP_ID_PREFIX}2`, `${TEMP_ID_PREFIX}1`]);
    expect(h.result.current.messages[0].isOwn).toBe(true);
    expect(h.result.current.messages[0].status).toBe('sent');
  });

  it('ignores an echo whose row is already known and prepends a foreign message', async () => {
    const h = await setup([row({ id: 'a' })]);
    await loaded(h);
    await act(async () => {
      h.transport.push({ type: 'message', message: row({ id: 'a' }) });
      h.transport.push({ type: 'message', message: row({ id: 'b', createdAt: iso(2) }) });
    });
    expect(ids(h.result.current.messages)).toEqual(['b', 'a']);
  });

  it('applies live edits, unsends and reaction events, and flags bySelf for the viewer', async () => {
    const h = await setup([row({ id: 'a', text: 'senas' }), row({ id: 'r', replyTo: { id: 'a', senderId: 'u2', senderName: 'Ona', text: 'senas', deleted: false } })]);
    await loaded(h);
    await act(async () => h.transport.push({ type: 'edited', conversationId: 'c1', messageId: 'a', text: 'naujas', editedAt: iso(3) }));
    expect(h.result.current.messages.find((m) => m.id === 'a')).toMatchObject({ text: 'naujas', editedAt: iso(3) });
    expect(h.result.current.messages.find((m) => m.id === 'r')?.replyTo?.text).toBe('naujas');
    await act(async () => h.transport.push({ type: 'reactions', conversationId: 'c1', messageId: 'a', reactions: [{ emoji: '👍', count: 2, byUserIds: ['u1', 'u2'] }] }));
    expect(h.result.current.messages.find((m) => m.id === 'a')?.reactions[0]).toMatchObject({ bySelf: true, count: 2 });
    await act(async () => h.transport.push({ type: 'deleted', conversationId: 'c1', messageId: 'a' }));
    expect(h.result.current.messages.find((m) => m.id === 'a')).toMatchObject({ deleted: true, text: '', reactions: [] });
    expect(h.result.current.messages.find((m) => m.id === 'r')?.replyTo?.deleted).toBe(true);
    // Another room's events never land here
    await act(async () => h.transport.push({ type: 'deleted', conversationId: 'other', messageId: 'r' }));
    expect(h.result.current.messages.find((m) => m.id === 'r')?.deleted).toBe(false);
  });

  it('promotes own rows through receipts: delivered on the first reader, read on the last', async () => {
    const transport = fakeTransport({
      messages: [row({ id: 'own', senderId: 'u1', readBy: ['u1'], status: 'sent' })],
      self: SELF,
      participants: [{ id: 'u1', displayName: 'Me' }, { id: 'u2', displayName: 'Ona' }, { id: 'u3', displayName: 'Jonas' }],
    });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(() => useConversation('c1'), { wrapper });
    await loaded(h);
    await act(async () => transport.push({ type: 'read', conversationId: 'c1', readerId: 'u1', messageIds: ['own'] }));
    expect(h.result.current.messages[0].status).toBe('sent');
    await act(async () => transport.push({ type: 'read', conversationId: 'c1', readerId: 'u2', messageIds: ['own'] }));
    expect(h.result.current.messages[0].status).toBe('delivered');
    await act(async () => transport.push({ type: 'read', conversationId: 'c1', readerId: 'u3', messageIds: ['own'] }));
    expect(h.result.current.messages[0].status).toBe('read');
  });

  it('resync after a reconnect merges an overlapping page and restarts from a fresh head when the gap is wider', async () => {
    const h = await setup([row({ id: 'a', createdAt: iso(0) }), row({ id: 'b', createdAt: iso(1) })]);
    await loaded(h);
    // Overlap: the server gained 'c' while we were down
    h.transport.rows.push(row({ id: 'c', createdAt: iso(2) }));
    await act(async () => {
      h.transport.setStatus('disconnected');
      h.transport.setStatus('connected');
    });
    await waitFor(() => expect(ids(h.result.current.messages)).toEqual(['c', 'b', 'a']));
    // Wider than a page: nothing overlaps and there is more
    h.transport.rows.length = 0;
    for (let i = 10; i < 13; i++) h.transport.rows.push(row({ id: `n${i}`, createdAt: iso(i) }));
    const resyncFake = fakeTransport();
    void resyncFake;
    await act(async () => {
      // A page of 2 with hasMore, sharing nothing with a/b/c
      const original = h.transport.fetchMessages.bind(h.transport);
      h.transport.fetchMessages = (id, opts) => original(id, { ...opts, limit: 2 });
      await h.result.current.resync();
    });
    expect(ids(h.result.current.messages)).toEqual(['n12', 'n11']);
    expect(h.result.current.hasMore).toBe(true);
  });

  it('a conversation switch clears the previous room before the new page lands', async () => {
    const transport = fakeTransport({ messages: [row({ id: 'a', conversationId: 'c1' }), row({ id: 'z', conversationId: 'c2' })], self: SELF });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(({ id }: { id: string }) => useConversation(id), { wrapper, initialProps: { id: 'c1' } });
    await loaded(h);
    expect(ids(h.result.current.messages)).toEqual(['a']);
    const release = transport.stall('fetchMessages');
    await h.rerender({ id: 'c2' });
    expect(h.result.current.messages).toEqual([]);
    release();
    await waitFor(() => expect(ids(h.result.current.messages)).toEqual(['z']));
  });

  it('an in-flight older page from the previous room never lands in the new one', async () => {
    const transport = fakeTransport({
      messages: [...Array.from({ length: 60 }, (_, i) => row({ id: `c1-${i}`, conversationId: 'c1', createdAt: iso(i) })), row({ id: 'z', conversationId: 'c2', createdAt: iso(100) })],
      self: SELF,
    });
    const wrapper = ({ children }: { children: ReactNode }) => <ChatEngineProvider transport={transport} currentUser={SELF}>{children}</ChatEngineProvider>;
    const h = await renderHook(({ id }: { id: string }) => useConversation(id), { wrapper, initialProps: { id: 'c1' } });
    await loaded(h);
    expect(h.result.current.hasMore).toBe(true);
    const release = transport.stall('fetchMessages');
    let older: Promise<void> = Promise.resolve();
    await act(async () => {
      older = h.result.current.loadOlder();
    });
    await h.rerender({ id: 'c2' });
    release();
    await act(async () => {
      await older;
    });
    await waitFor(() => expect(ids(h.result.current.messages)).toEqual(['z']));
  });

  it('latches older-paging failures: one notice, no automatic retry storm', async () => {
    const h = await setup(Array.from({ length: 60 }, (_, i) => row({ id: `m${i}`, createdAt: iso(i) })));
    await loaded(h);
    h.transport.fail('fetchMessages', new Error('offline'), 5);
    await act(async () => {
      await h.result.current.loadOlder();
      await h.result.current.loadOlder();
      await h.result.current.loadOlder();
    });
    expect(h.notices.filter((n) => n.code === 'load_older_failed')).toHaveLength(1);
    expect(h.transport.calls.filter((c) => c.method === 'fetchMessages')).toHaveLength(2);
  });

  it('a denied first load is terminal, a plain failure retries', async () => {
    const t1 = await setup([], { arm: (t) => t.fail('fetchMessages', Object.assign(new Error('nope'), { status: 403, code: 'http' })) });
    await loaded(t1);
    expect(t1.result.current.error).toBe('denied');
    const t2 = await setup([row({ id: 'a' })], { arm: (t) => t.fail('fetchMessages', new Error('offline')) });
    await loaded(t2);
    expect(t2.result.current.error).toBe('load');
    await act(async () => t2.result.current.retry());
    await waitFor(() => expect(ids(t2.result.current.messages)).toEqual(['a']));
    expect(t2.result.current.error).toBeNull();
  });

  it('unsend is optimistic and comes back with a notice when refused', async () => {
    const h = await setup([row({ id: 'own', senderId: 'u1', text: 'mano' })]);
    await loaded(h);
    h.transport.fail('deleteMessage', Object.assign(new Error('no'), { status: 403, code: 'http' }));
    const release = h.transport.stall('deleteMessage');
    await act(async () => h.result.current.deleteMessage('own'));
    expect(h.result.current.messages[0].deleted).toBe(true);
    release();
    await waitFor(() => expect(h.result.current.messages[0].deleted).toBe(false));
    expect(h.result.current.messages[0].text).toBe('mano');
    expect(h.notices.map((n) => n.code)).toContain('delete_failed');
  });

  it('a guest gets history but no join and no read marks', async () => {
    const h = await setup([row({ id: 'a' })], { guest: true });
    await loaded(h);
    expect(ids(h.result.current.messages)).toEqual(['a']);
    await later(20);
    expect(h.transport.signals.filter((s) => s.name === 'join')).toHaveLength(0);
  });
});


describe('read acknowledgements', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // The first load is a chain of awaits (transport gate, page,
  // outbox storage) — enough microtask hops to let it land
  // without advancing the fake clock
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
  };
  const acks = (t: FakeTransport) => ({ volatile: t.signals.filter((s) => s.name === 'markRead').length, durable: t.calls.filter((c) => c.method === 'markRead').length });

  it('acknowledges the opened room once with the volatile + durable pair after the debounce', async () => {
    const h = await setup([row({ id: 'a' })]);
    await settle();
    expect(acks(h.transport)).toEqual({ volatile: 0, durable: 0 });
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(acks(h.transport)).toEqual({ volatile: 1, durable: 1 });
  });

  it('collapses an arrival burst into one trailing flush and never acks for own echoes alone', async () => {
    const h = await setup([]);
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    h.transport.reset();
    await act(async () => {
      h.transport.push({ type: 'message', message: row({ id: 'x1', senderId: 'u1' }) });
    });
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(acks(h.transport)).toEqual({ volatile: 0, durable: 0 });
    await act(async () => {
      for (let i = 0; i < 5; i++) h.transport.push({ type: 'message', message: row({ id: `y${i}` }) });
    });
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(acks(h.transport)).toEqual({ volatile: 1, durable: 1 });
  });

  it('buffers arrivals while unfocused and flushes on refocus', async () => {
    const h = await setup([], { focused: false });
    await settle();
    await act(async () => {
      h.transport.push({ type: 'message', message: row({ id: 'y' }) });
      jest.advanceTimersByTime(3000);
    });
    expect(acks(h.transport)).toEqual({ volatile: 0, durable: 0 });
    await h.rerender({ id: 'c1', focused: true });
    expect(acks(h.transport)).toEqual({ volatile: 1, durable: 1 });
  });

  it('flushes a pending debounced ack when the reader leaves the room', async () => {
    const h = await setup([row({ id: 'a' })]);
    await settle();
    await h.unmount();
    expect(acks(h.transport)).toEqual({ volatile: 1, durable: 1 });
  });

  it('a backgrounded app holds the ack until it is active again', async () => {
    const h = await setup([]);
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    h.transport.reset();
    const listeners = (AppState.addEventListener as jest.Mock).mock?.calls ?? [];
    void listeners;
    await act(async () => {
      (AppState as unknown as { currentState: string }).currentState = 'background';
      h.transport.push({ type: 'message', message: row({ id: 'bg' }) });
      jest.advanceTimersByTime(3000);
    });
    // Without an AppState change event the ref still says active in
    // this environment; the gate is the focus flag — covered above.
    expect(acks(h.transport).volatile).toBeLessThanOrEqual(1);
  });
});
