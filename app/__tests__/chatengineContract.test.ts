// -----------------------------------------------------------
//  [*] Tests — the ChatTransport conformance suite
//
//  describeTransportContract run twice: against the reference
//  fake, and against the KNF adapter with its HTTP client and
//  socket replaced by in-memory stubs that behave like the
//  Flask backend (idempotent client_msg_id, {message} envelope,
//  reactions envelope, before/before_id paging). Passing both
//  is what lets the engine's hook tests trust the fake.
// -----------------------------------------------------------

import { describeTransportContract, fakeTransport, type ChatMessage, type TransportHarness } from '@knf/chatengine';
import { createKnfTransport, type ApiMessage, type HttpClient, type KnfSocketClient, type SocketEventName } from '@knf/chatengine/adapters/knf';


// ---- 1. the reference fake ----
describeTransportContract('fakeTransport', () => {
  const t = fakeTransport({ self: { id: 'self', displayName: 'Me' } });
  let seq = 0;
  const harness: TransportHarness = {
    transport: t,
    selfId: 'self',
    async seed(row) {
      const id = row.id ?? `seed-${++seq}`;
      t.rows.push({ ...row, id } as ChatMessage);
      t.rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      return id;
    },
    emit: (event) => t.push(event),
    setStatus: (status) => t.setStatus(status),
  };
  return harness;
});


// ---- 2. the KNF adapter over a stubbed backend ----
function knfHarness(): TransportHarness {
  const selfId = 'self';
  const rows: ApiMessage[] = [];
  let seq = 0;
  const now = () => new Date().toISOString();

  const http: HttpClient = {
    async get(path, options) {
      const m = path.match(/^\/chat\/conversations\/([^/]+)\/messages$/);
      if (!m) throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
      const conv = decodeURIComponent(m[1]);
      const params = options?.params ?? {};
      let mine = rows.filter((r) => r.conversationId === conv);
      if (typeof params.before === 'string') {
        const before = params.before;
        const beforeId = typeof params.before_id === 'string' ? params.before_id : '';
        mine = mine.filter((r) => r.createdAt < before || (r.createdAt === before && r.id < beforeId));
      }
      const limit = Number(params.limit ?? 50);
      const page = mine.slice(Math.max(0, mine.length - limit));
      return { messages: page, hasMore: mine.length > limit, participants: [{ id: selfId, displayName: 'Me' }], conversation: { id: conv, type: 'direct', title: null, avatarEmoji: null } } as never;
    },
    async post(path, body) {
      if (path === '/uploads') return { url: `/api/uploads/${++seq}.jpg`, filename: `${seq}.jpg`, name: 'a.jpg', size: 10, mime: 'image/jpeg', width: 10, height: 10 } as never;
      const send = path.match(/^\/chat\/conversations\/([^/]+)\/messages$/);
      if (send) {
        const conv = decodeURIComponent(send[1]);
        const b = body as { text?: string; imageUrl?: string; replyToId?: string; client_msg_id?: string; kind?: string; attachment?: ApiMessage['attachment']; media?: ApiMessage['media'] };
        const existing = rows.find((r) => r.conversationId === conv && r.clientMsgId === b.client_msg_id);
        if (existing) return { message: existing } as never;
        const row: ApiMessage = {
          id: `srv-${++seq}`, clientMsgId: b.client_msg_id ?? null, conversationId: conv, senderId: selfId, senderName: 'Me', text: b.text ?? '',
          imageUrl: b.imageUrl ?? null, time: '00:00', createdAt: now(), isOwn: true, status: 'sent', readBy: [selfId], reactions: [], replyTo: null, deleted: false,
          kind: (b.kind as ApiMessage['kind']) ?? (b.attachment ? 'file' : b.imageUrl ? 'image' : 'text'), editedAt: null, attachment: b.attachment ?? null, media: b.media ?? null,
        };
        rows.push(row);
        return { message: row } as never;
      }
      const react = path.match(/^\/chat\/conversations\/([^/]+)\/messages\/([^/]+)\/react$/);
      if (react) {
        const row = rows.find((r) => r.id === decodeURIComponent(react[2]));
        if (!row) throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
        const emoji = (body as { emoji: string }).emoji;
        const stripped = (row.reactions ?? []).map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== selfId) })).filter((r) => r.byUserIds.length > 0);
        const idx = stripped.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) stripped[idx] = { ...stripped[idx], byUserIds: [...stripped[idx].byUserIds, selfId] };
        else stripped.push({ emoji, count: 1, byUserIds: [selfId] });
        row.reactions = stripped.map((r) => ({ ...r, count: r.byUserIds.length }));
        return { reactions: row.reactions } as never;
      }
      throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
    },
    async put(path, body) {
      const edit = path.match(/^\/chat\/conversations\/([^/]+)\/messages\/([^/]+)$/);
      if (edit) {
        const row = rows.find((r) => r.id === decodeURIComponent(edit[2]));
        if (!row) throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
        row.text = (body as { text: string }).text;
        row.editedAt = now();
        return { id: row.id, text: row.text, editedAt: row.editedAt } as never;
      }
      if (/\/read$/.test(path)) return { ok: true } as never;
      throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
    },
    async delete(path) {
      const react = path.match(/^\/chat\/conversations\/([^/]+)\/messages\/([^/]+)\/react$/);
      if (react) {
        const row = rows.find((r) => r.id === decodeURIComponent(react[2]));
        if (!row) throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
        row.reactions = (row.reactions ?? []).map((r) => ({ ...r, byUserIds: r.byUserIds.filter((id) => id !== selfId) })).filter((r) => r.byUserIds.length > 0).map((r) => ({ ...r, count: r.byUserIds.length }));
        return { reactions: row.reactions } as never;
      }
      const del = path.match(/^\/chat\/conversations\/([^/]+)\/messages\/([^/]+)$/);
      if (del) {
        const row = rows.find((r) => r.id === decodeURIComponent(del[2]));
        if (!row) throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
        row.deleted = true;
        row.text = '';
        row.imageUrl = null;
        row.reactions = [];
        return { ok: true } as never;
      }
      throw Object.assign(new Error('not found'), { status: 404, code: 'http' });
    },
  };

  // A socket client stub with the adapter's registry semantics
  const listeners = new Map<SocketEventName, Set<(p: never) => void>>();
  const statusListeners = new Set<(s: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'unauthorized') => void>();
  let status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'unauthorized' = 'disconnected';
  const setStatus = (s: typeof status) => {
    status = s;
    statusListeners.forEach((fn) => fn(s));
  };
  const socket: KnfSocketClient = {
    connect: async () => {
      setStatus('connected');
      return {} as never;
    },
    disconnect: () => setStatus('disconnected'),
    suspend: () => {},
    status: () => status,
    onStatus: (fn) => {
      statusListeners.add(fn);
      return () => {
        statusListeners.delete(fn);
      };
    },
    on: (event, fn) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn as (p: never) => void);
      return () => {
        set?.delete(fn as (p: never) => void);
      };
    },
    emit: () => {},
    emitVolatile: () => {},
  };
  const fire = (event: SocketEventName, payload: unknown) => listeners.get(event)?.forEach((fn) => fn(payload as never));

  const transport = createKnfTransport({ http, socket });
  return {
    transport,
    selfId,
    async seed(row) {
      const id = row.id ?? `seed-${++seq}`;
      rows.push({
        id, clientMsgId: row.clientId ?? null, conversationId: row.conversationId, senderId: row.senderId, senderName: row.senderName, text: row.text,
        imageUrl: row.imageUrl ?? null, time: '00:00', createdAt: row.createdAt, isOwn: row.senderId === selfId, status: 'read', readBy: [], reactions: [], replyTo: null,
        deleted: !!row.deleted, kind: row.kind ?? 'text', editedAt: null, attachment: null, media: null,
      });
      rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      return id;
    },
    emit(event) {
      if (event.type === 'message') {
        const m = event.message;
        fire('new_message', { id: m.id, clientMsgId: m.clientId ?? null, conversationId: m.conversationId, senderId: m.senderId, senderName: m.senderName, text: m.text, imageUrl: m.imageUrl ?? null, time: '00:00', createdAt: m.createdAt, reactions: [], replyTo: null, deleted: !!m.deleted, kind: m.kind ?? 'text' });
      } else if (event.type === 'deleted') fire('message_deleted', { conversationId: event.conversationId, messageId: event.messageId });
      else if (event.type === 'edited') fire('message_edited', { conversationId: event.conversationId, messageId: event.messageId, text: event.text, editedAt: event.editedAt });
      else if (event.type === 'reactions') fire('reaction_update', { conversationId: event.conversationId, messageId: event.messageId, reactions: event.reactions });
      else if (event.type === 'read') fire('messages_read', { conversationId: event.conversationId, readerId: event.readerId, messageIds: event.messageIds });
      else if (event.type === 'typing') fire(event.active ? 'user_typing' : 'user_stop_typing', { conversationId: event.conversationId, userId: event.userId, displayName: event.displayName });
    },
    setStatus,
  };
}

describeTransportContract('KNF adapter (stubbed backend)', knfHarness);
