// -----------------------------------------------------------
//  [*] chatengine — testing: transportContract
//
//  The conformance suite for a ChatTransport. An adapter author
//  calls describeTransportContract('my adapter', makeHarness)
//  inside a jest file and gets the behaviours the engine relies
//  on checked against their implementation: page shape and
//  order, the cursor, idempotent sends on clientId, edit and
//  unsend semantics, reaction groups, uploads, and the realtime
//  half — registration before connect, event shapes, unsubscribe,
//  status fan-out. The fake transport passes it; so must the
//  KNF adapter (with its HTTP client and socket stubbed).
//
//  The harness answers a fresh transport plus the levers the
//  suite needs to observe the other side: seed rows, read what
//  the "server" holds, and push a raw realtime event.
//
//  Used by:
//    - __tests__ of the engine (fake + knf)
//    - any adapter's own test file
// -----------------------------------------------------------

import type { ChatEvent, ChatTransport } from '../core/transport';
import type { ChatMessage } from '../core/types';


export interface TransportHarness {
  transport: ChatTransport;
  // The id of the user the transport acts as
  selfId: string;
  // Put a row into the backend's store (oldest-first order is
  // by createdAt); returns the stored row's id
  seed(row: Omit<ChatMessage, 'id'> & { id?: string }): Promise<string>;
  // Simulate the backend broadcasting an event to this client
  emit(event: ChatEvent): void;
  // Simulate the connection state changing
  setStatus?(status: 'connected' | 'disconnected' | 'reconnecting'): void;
}


const later = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const iso = (minute: number) => new Date(Date.UTC(2026, 7, 30, 12, minute, 0)).toISOString();

const baseRow = (conversationId: string, over: Partial<ChatMessage> = {}): Omit<ChatMessage, 'id'> => ({
  conversationId,
  senderId: 'other',
  senderName: 'Ona',
  text: 'labas',
  createdAt: iso(0),
  isOwn: false,
  status: 'read',
  reactions: [],
  deleted: false,
  ...over,
});


export function describeTransportContract(name: string, makeHarness: () => Promise<TransportHarness> | TransportHarness): void {
  describe(`ChatTransport contract — ${name}`, () => {
    let h: TransportHarness;
    beforeEach(async () => {
      h = await makeHarness();
    });

    it('exposes every method of the contract', () => {
      const t = h.transport;
      for (const method of ['fetchMessages', 'sendMessage', 'editMessage', 'deleteMessage', 'setReaction', 'removeReaction', 'markRead', 'upload'] as const) {
        expect(typeof t[method]).toBe('function');
      }
      for (const method of ['connect', 'status', 'onStatus', 'subscribe', 'join', 'typing', 'markRead'] as const) {
        expect(typeof t.realtime[method]).toBe('function');
      }
    });

    it('pages oldest-first with hasMore, participants and the conversation', async () => {
      const conv = 'c-page';
      for (let i = 0; i < 3; i++) await h.seed(baseRow(conv, { text: `m${i}`, createdAt: iso(i) }));
      const page = await h.transport.fetchMessages(conv, { limit: 2 });
      expect(page.messages.map((m) => m.text)).toEqual(['m1', 'm2']);
      expect(page.hasMore).toBe(true);
      expect(Array.isArray(page.participants)).toBe(true);
      expect('conversation' in page).toBe(true);
      for (const m of page.messages) {
        expect(typeof m.id).toBe('string');
        expect(m.conversationId).toBe(conv);
        expect(typeof m.createdAt).toBe('string');
        expect(Array.isArray(m.reactions)).toBe(true);
      }
    });

    it('takes the before-cursor (stamp + id) and answers the older page', async () => {
      const conv = 'c-cursor';
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) ids.push(await h.seed(baseRow(conv, { text: `m${i}`, createdAt: iso(i) })));
      const older = await h.transport.fetchMessages(conv, { before: { createdAt: iso(2), id: ids[2] }, limit: 50 });
      expect(older.messages.map((m) => m.text)).toEqual(['m0', 'm1']);
      expect(older.hasMore).toBe(false);
    });

    it('answers an around-window that holds the anchor, oldest-first, with honest edge flags', async () => {
      const conv = 'c-around';
      const ids: string[] = [];
      for (let i = 0; i < 9; i++) ids.push(await h.seed(baseRow(conv, { text: `m${i}`, createdAt: iso(i) })));
      const win = await h.transport.fetchMessages(conv, { around: ids[4], limit: 4 });
      const texts = win.messages.map((m) => m.text);
      expect(texts).toContain('m4');
      expect(texts.every((t, i) => i === 0 || texts[i - 1] < t)).toBe(true);
      expect(win.hasMore).toBe(true);
      expect(win.hasNewer).toBe(true);
    });

    it('walks forward from the after-cursor and says when the head is reached', async () => {
      const conv = 'c-after';
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) ids.push(await h.seed(baseRow(conv, { text: `m${i}`, createdAt: iso(i) })));
      const fwd = await h.transport.fetchMessages(conv, { after: { createdAt: iso(1), id: ids[1] }, limit: 50 });
      expect(fwd.messages.map((m) => m.text)).toEqual(['m2', 'm3']);
      expect(!!fwd.hasNewer).toBe(false);
    });

    it('commits a send as the current user and keeps the clientId', async () => {
      const conv = 'c-send';
      const row = await h.transport.sendMessage(conv, { text: 'siunčiu', clientId: 'temp-1-1' });
      expect(row.senderId).toBe(h.selfId);
      expect(row.text).toBe('siunčiu');
      expect(row.clientId).toBe('temp-1-1');
      expect(row.isOwn).toBe(true);
      expect(typeof row.id).toBe('string');
      expect(row.id.startsWith('temp-')).toBe(false);
    });

    it('is idempotent on clientId — a repeated send answers the SAME row', async () => {
      const conv = 'c-idem';
      const first = await h.transport.sendMessage(conv, { text: 'vienas', clientId: 'temp-9-9' });
      const again = await h.transport.sendMessage(conv, { text: 'vienas', clientId: 'temp-9-9' });
      expect(again.id).toBe(first.id);
      const page = await h.transport.fetchMessages(conv);
      expect(page.messages.filter((m) => m.clientId === 'temp-9-9')).toHaveLength(1);
    });

    it('edits own text and stamps editedAt', async () => {
      const conv = 'c-edit';
      const row = await h.transport.sendMessage(conv, { text: 'pirmas', clientId: 'temp-2-2' });
      const saved = await h.transport.editMessage(conv, row.id, 'pataisytas');
      expect(saved).toEqual({ id: row.id, text: 'pataisytas', editedAt: expect.any(String) });
      const page = await h.transport.fetchMessages(conv);
      expect(page.messages.find((m) => m.id === row.id)?.text).toBe('pataisytas');
    });

    it('unsends: the row stays, blank and flagged', async () => {
      const conv = 'c-del';
      const row = await h.transport.sendMessage(conv, { text: 'dings', clientId: 'temp-3-3' });
      await h.transport.deleteMessage(conv, row.id);
      const page = await h.transport.fetchMessages(conv);
      const gone = page.messages.find((m) => m.id === row.id);
      expect(gone?.deleted).toBe(true);
      expect(gone?.text).toBe('');
    });

    it('sets one reaction per user and answers the groups', async () => {
      const conv = 'c-react';
      const id = await h.seed(baseRow(conv));
      const groups = await h.transport.setReaction(conv, id, '👍');
      expect(groups).toEqual([{ emoji: '👍', count: 1, byUserIds: [h.selfId] }]);
      const replaced = await h.transport.setReaction(conv, id, '❤️');
      expect(replaced).toEqual([{ emoji: '❤️', count: 1, byUserIds: [h.selfId] }]);
      const cleared = await h.transport.removeReaction(conv, id);
      expect(cleared).toEqual([]);
    });

    it('a change feed, when offered, reports edits and unsends made after the cursor', async () => {
      const t = h.transport;
      if (!t.fetchChanges) return;
      const conv = 'c-changes';
      const kept = await t.sendMessage(conv, { text: 'lieka', clientId: 'temp-c-1' });
      const page = await t.fetchMessages(conv);
      expect(typeof page.cursor).toBe('string');
      const since = page.cursor as string;
      const edited = await t.sendMessage(conv, { text: 'senas', clientId: 'temp-c-2' });
      const gone = await t.sendMessage(conv, { text: 'dings', clientId: 'temp-c-3' });
      await t.editMessage(conv, edited.id, 'naujas');
      await t.deleteMessage(conv, gone.id);
      const changes = await t.fetchChanges(conv, since);
      const ids = changes.messages.map((m) => m.id);
      expect(ids).toContain(edited.id);
      expect(ids).toContain(gone.id);
      expect(ids).not.toContain(kept.id);
      expect(changes.messages.find((m) => m.id === edited.id)?.text).toBe('naujas');
      expect(changes.messages.find((m) => m.id === gone.id)?.deleted).toBe(true);
      expect(typeof changes.cursor).toBe('string');
      const nothing = await t.fetchChanges(conv, changes.cursor);
      expect(nothing.messages).toEqual([]);
    });

    it('the pin trio, when offered, flips a pin and lists newest first', async () => {
      const t = h.transport;
      if (!t.pinMessage || !t.unpinMessage || !t.fetchPins) return;
      const conv = 'c-pin';
      const id = await h.seed(baseRow(conv, { text: 'pinme', createdAt: iso(0) }));
      await t.pinMessage(conv, id);
      const pinned = await t.fetchPins(conv);
      expect(pinned.map((m) => m.id)).toContain(id);
      await t.unpinMessage(conv, id);
      expect((await t.fetchPins(conv)).map((m) => m.id)).not.toContain(id);
    });

    it('uploads answer a stored reference the message can carry', async () => {
      const result = await h.transport.upload({ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg', size: 10, kind: 'image' });
      expect(typeof result.url).toBe('string');
      expect(result.url.length).toBeGreaterThan(0);
      expect(typeof result.name).toBe('string');
      expect(typeof result.size).toBe('number');
      expect(typeof result.mime).toBe('string');
    });

    it('marks a conversation read without complaint', async () => {
      await expect(h.transport.markRead('c-read')).resolves.toBeUndefined();
    });

    it('delivers realtime events registered BEFORE connect, in order, and honours unsubscribe', async () => {
      const seen: ChatEvent[] = [];
      const off = h.transport.realtime.subscribe((e) => seen.push(e));
      await h.transport.realtime.connect();
      const msg: ChatMessage = { ...baseRow('c-rt'), id: 'rt-1' };
      h.emit({ type: 'message', message: msg });
      h.emit({ type: 'deleted', conversationId: 'c-rt', messageId: 'rt-1' });
      h.emit({ type: 'edited', conversationId: 'c-rt', messageId: 'rt-1', text: 'x', editedAt: iso(1) });
      h.emit({ type: 'reactions', conversationId: 'c-rt', messageId: 'rt-1', reactions: [{ emoji: '👍', count: 1, byUserIds: ['other'] }] });
      h.emit({ type: 'read', conversationId: 'c-rt', readerId: 'other', messageIds: ['rt-1'] });
      h.emit({ type: 'typing', conversationId: 'c-rt', userId: 'other', displayName: 'Ona', active: true });
      await later();
      expect(seen.map((e) => e.type)).toEqual(['message', 'deleted', 'edited', 'reactions', 'read', 'typing']);
      const first = seen[0];
      expect(first.type === 'message' && first.message.id).toBe('rt-1');
      off();
      h.emit({ type: 'deleted', conversationId: 'c-rt', messageId: 'rt-2' });
      await later();
      expect(seen).toHaveLength(6);
    });

    it('reports status and fans changes out to every listener', async () => {
      const a: string[] = [];
      const b: string[] = [];
      const offA = h.transport.realtime.onStatus((s) => a.push(s));
      h.transport.realtime.onStatus((s) => b.push(s));
      expect(['disconnected', 'connecting', 'connected', 'reconnecting', 'unauthorized']).toContain(h.transport.realtime.status());
      await h.transport.realtime.connect();
      if (h.setStatus) {
        h.setStatus('disconnected');
        h.setStatus('connected');
        expect(a.slice(-2)).toEqual(['disconnected', 'connected']);
        expect(b.slice(-2)).toEqual(['disconnected', 'connected']);
      }
      offA();
      h.setStatus?.('reconnecting');
      expect(a.includes('reconnecting')).toBe(false);
    });

    it('accepts the volatile signals while connected and while not', async () => {
      const t = h.transport.realtime;
      expect(() => {
        t.join('c-sig');
        t.typing('c-sig', true);
        t.typing('c-sig', false);
        t.markRead('c-sig');
      }).not.toThrow();
      await t.connect();
      expect(() => {
        t.join('c-sig');
        t.typing('c-sig', true);
        t.markRead('c-sig');
      }).not.toThrow();
    });
  });
}
