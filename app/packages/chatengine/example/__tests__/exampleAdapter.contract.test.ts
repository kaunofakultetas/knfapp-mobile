// -----------------------------------------------------------
//  [*] chatengine — example: proving an adapter
//
//  The whole recipe for a new adapter's test: an in-memory stub
//  of the backend (here: the REST routes as a fetch function
//  and the WebSocket as a tiny object), a harness that seeds
//  rows and emits frames into it, and one call to
//  describeTransportContract. Green here means the engine's
//  hooks will behave on that backend exactly as they do on the
//  fake — which is what every hook test already proves.
// -----------------------------------------------------------

import { describeTransportContract, type ChatEvent, type TransportHarness } from '../../src';
import { createExampleTransport, type SocketLike, type WireMessage } from '../ExampleAdapter';


function stubBackend(selfId: string) {
  const rows: WireMessage[] = [];
  let seq = 0;
  const json = (body: unknown, status = 200): Response =>
    ({ ok: status < 400, status, statusText: '', json: async () => body } as unknown as Response);

  const fetchStub: typeof fetch = async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const method = init?.method ?? 'GET';
    const body = init?.body && typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'uploads') return json({ url: `/uploads/${++seq}.jpg`, name: 'a.jpg', size: 10, mime: 'image/jpeg', width: 10, height: 10 });
    if (parts[0] !== 'rooms') return json({ error: 'not found' }, 404);
    const room = decodeURIComponent(parts[1]);

    if (parts[2] === 'read') return json({}, 200);
    if (parts[2] === 'messages' && parts.length === 3) {
      if (method === 'GET') {
        const mine = rows.filter((r) => r.room === room);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const page = (items: WireMessage[], hasMore: boolean, hasNewer: boolean) =>
          json({ items, hasMore, hasNewer, members: [{ id: selfId, name: 'Me' }], room: { id: room, kind: 'direct' } });
        const around = url.searchParams.get('around');
        if (around) {
          const anchor = mine.find((r) => r.id === around);
          if (!anchor) return json({ error: 'not found', code: 'not_found' }, 404);
          const half = Math.max(1, Math.floor(limit / 2));
          const older = mine.filter((r) => r.at < anchor.at || (r.at === anchor.at && r.id < anchor.id));
          const newer = mine.filter((r) => r.at > anchor.at || (r.at === anchor.at && r.id > anchor.id));
          return page([...older.slice(Math.max(0, older.length - (half - 1))), anchor, ...newer.slice(0, half)], older.length > half - 1, newer.length > half);
        }
        const after = url.searchParams.get('after');
        if (after) {
          const afterId = url.searchParams.get('afterId') ?? '';
          const newer = mine.filter((r) => r.at > after || (r.at === after && r.id > afterId));
          return page(newer.slice(0, limit), mine.length > newer.length, newer.length > limit);
        }
        const before = url.searchParams.get('before');
        const beforeId = url.searchParams.get('beforeId') ?? '';
        const eligible = before ? mine.filter((r) => r.at < before || (r.at === before && r.id < beforeId)) : mine;
        return page(eligible.slice(Math.max(0, eligible.length - limit)), eligible.length > limit, false);
      }
      const existing = rows.find((r) => r.room === room && r.clientId === body.clientId);
      if (existing) return json(existing);
      const row: WireMessage = { id: `srv-${++seq}`, clientId: body.clientId as string, room, from: { id: selfId, name: 'Me' }, text: (body.text as string) ?? '', imageUrl: (body.imageUrl as string) ?? null, at: new Date().toISOString(), readBy: [selfId], reactions: [], replyTo: null, deleted: false, editedAt: null, kind: (body.kind as WireMessage['kind']) ?? 'text', attachment: (body.attachment as WireMessage['attachment']) ?? null, media: (body.media as WireMessage['media']) ?? null };
      rows.push(row);
      return json(row);
    }
    const target = rows.find((r) => r.id === decodeURIComponent(parts[3] ?? ''));
    if (!target) return json({ error: 'not found', code: 'not_found' }, 404);
    if (parts[4] === 'reaction') {
      const stripped = (target.reactions ?? []).map((g) => ({ ...g, users: g.users.filter((u) => u !== selfId) })).filter((g) => g.users.length > 0);
      if (method === 'PUT') {
        const emoji = body.emoji as string;
        const idx = stripped.findIndex((g) => g.emoji === emoji);
        if (idx >= 0) stripped[idx] = { ...stripped[idx], users: [...stripped[idx].users, selfId] };
        else stripped.push({ emoji, users: [selfId] });
      }
      target.reactions = stripped;
      return json({ reactions: stripped });
    }
    if (method === 'PATCH') {
      target.text = body.text as string;
      target.editedAt = new Date().toISOString();
      return json({ id: target.id, text: target.text, editedAt: target.editedAt });
    }
    if (method === 'DELETE') {
      target.deleted = true;
      target.text = '';
      target.reactions = [];
      return json({}, 200);
    }
    return json({ error: 'not found' }, 404);
  };

  // The socket: opens at once; frames pushed by the harness
  let socket: SocketLike | null = null;
  const connectSocket = (): SocketLike => {
    const s: SocketLike = { send: () => {}, close: () => {}, onopen: null, onclose: null, onerror: null, onmessage: null };
    socket = s;
    setTimeout(() => s.onopen?.(), 0);
    return s;
  };
  const frame = (data: Record<string, unknown>) => socket?.onmessage?.({ data: JSON.stringify(data) });

  return { rows, fetchStub, connectSocket, frame, socket: () => socket, nextId: () => `seed-${++seq}` };
}


describeTransportContract('example REST + WebSocket adapter', async (): Promise<TransportHarness> => {
  const selfId = 'self';
  const backend = stubBackend(selfId);
  const transport = createExampleTransport({ baseUrl: 'http://x', getToken: async () => 'token', fetch: backend.fetchStub, connectSocket: backend.connectSocket });
  // The suite's status test needs the socket open before it flips state
  await transport.realtime.connect();
  await new Promise((r) => setTimeout(r, 1));

  return {
    transport,
    selfId,
    async seed(row) {
      const id = row.id ?? backend.nextId();
      backend.rows.push({ id, clientId: row.clientId ?? null, room: row.conversationId, from: { id: row.senderId, name: row.senderName }, text: row.text, imageUrl: row.imageUrl ?? null, at: row.createdAt, readBy: [], reactions: [], replyTo: null, deleted: !!row.deleted, editedAt: null, kind: row.kind ?? 'text' });
      backend.rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      return id;
    },
    emit(event: ChatEvent) {
      if (event.type === 'message') {
        const m = event.message;
        backend.frame({ type: 'message', message: { id: m.id, clientId: m.clientId ?? null, room: m.conversationId, from: { id: m.senderId, name: m.senderName }, text: m.text, at: m.createdAt, reactions: [], deleted: !!m.deleted, kind: m.kind ?? 'text' } });
      } else if (event.type === 'deleted') backend.frame({ type: 'deleted', room: event.conversationId, id: event.messageId });
      else if (event.type === 'edited') backend.frame({ type: 'edited', room: event.conversationId, id: event.messageId, text: event.text, editedAt: event.editedAt });
      else if (event.type === 'reactions') backend.frame({ type: 'reactions', room: event.conversationId, id: event.messageId, reactions: event.reactions.map((g) => ({ emoji: g.emoji, users: g.byUserIds })) });
      else if (event.type === 'read') backend.frame({ type: 'read', room: event.conversationId, user: event.readerId, ids: event.messageIds });
      else if (event.type === 'typing') backend.frame({ type: 'typing', room: event.conversationId, user: event.userId, name: event.displayName, active: event.active });
    },
    setStatus(status) {
      const s = backend.socket();
      if (!s) return;
      if (status === 'connected') s.onopen?.();
      else s.onclose?.();
    },
  };
});
