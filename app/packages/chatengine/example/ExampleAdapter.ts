// -----------------------------------------------------------
//  [*] chatengine — example: an adapter for a generic backend
//
//  How to make ANY backend a ChatTransport. This one speaks a
//  plain REST + WebSocket API that many chat servers roughly
//  have — the routes are listed below — with only `fetch` and
//  `WebSocket`, both injectable so the conformance test can
//  run it over a stub. Copy it, rename the routes, map your
//  wire shape in the four `to*` functions, and run
//  describeTransportContract against it (see __tests__/).
//
//  Assumed API:
//    GET    /rooms/:id/messages?before=<iso>&beforeId=<id>&limit=<n>
//           → { items: WireMessage[] (oldest first), hasMore, members: [{id,name,avatar}], room: {id,kind,title} }
//    POST   /rooms/:id/messages         { text, imageUrl, replyTo, clientId, kind, attachment, media } → WireMessage
//    PATCH  /rooms/:id/messages/:mid    { text } → { id, text, editedAt }
//    DELETE /rooms/:id/messages/:mid
//    PUT    /rooms/:id/messages/:mid/reaction { emoji } → { reactions: [{emoji, users:[ids]}] }
//    DELETE /rooms/:id/messages/:mid/reaction             → { reactions }
//    POST   /rooms/:id/read
//    POST   /uploads (multipart: file, kind)              → { url, name, size, mime, width?, height? }
//    WS     /ws?token=…  frames: { type: 'message'|'deleted'|'edited'|'reactions'|'read'|'typing', ... }
//           client → server: { type: 'join'|'typing'|'stop_typing'|'read', room }
//
//  Split into:
//
//    WireMessage / to* mappers   — wire → domain
//    createExampleTransport      — the transport
// -----------------------------------------------------------

import { TransportError, type ChatEvent, type ChatMessage, type ChatRealtime, type ChatTransport, type MessagesPage, type ReactionGroup, type RealtimeStatus } from '../src';


export interface WireMessage {
  id: string;
  clientId?: string | null;
  room: string;
  from: { id: string; name: string; avatar?: string | null };
  text?: string | null;
  imageUrl?: string | null;
  at: string;
  readBy?: string[];
  reactions?: { emoji: string; users: string[] }[];
  replyTo?: { id: string; from: { id: string; name: string }; text?: string | null; deleted?: boolean } | null;
  deleted?: boolean;
  editedAt?: string | null;
  kind?: 'text' | 'image' | 'video' | 'file' | 'audio' | 'system' | 'custom';
  attachment?: { url: string; name: string; size: number; mime: string } | null;
  media?: { width?: number; height?: number; duration?: number; thumbnailUrl?: string } | null;
}

export const toReactionGroups = (groups: { emoji: string; users: string[] }[] | null | undefined): ReactionGroup[] =>
  (groups ?? []).map((g) => ({ emoji: g.emoji, count: g.users.length, byUserIds: g.users }));

// isOwn / bySelf are left false — the engine derives them from
// the signed-in user
export function toChatMessage(m: WireMessage): ChatMessage {
  return {
    id: m.id,
    clientId: m.clientId || undefined,
    conversationId: m.room,
    senderId: m.from.id,
    senderName: m.from.name,
    senderAvatar: m.from.avatar || undefined,
    text: m.text ?? '',
    imageUrl: m.imageUrl || undefined,
    createdAt: m.at,
    isOwn: false,
    status: 'read',
    readBy: m.readBy,
    reactions: toReactionGroups(m.reactions).map((r) => ({ ...r, bySelf: false })),
    replyTo: m.replyTo ? { id: m.replyTo.id, senderId: m.replyTo.from.id, senderName: m.replyTo.from.name, text: m.replyTo.text ?? '', deleted: !!m.replyTo.deleted } : undefined,
    deleted: !!m.deleted,
    editedAt: m.editedAt ?? undefined,
    kind: m.kind,
    file: m.kind === 'file' && m.attachment ? { name: m.attachment.name, uri: m.attachment.url, size: m.attachment.size, mimeType: m.attachment.mime } : undefined,
    video: m.kind === 'video' && m.attachment ? { uri: m.attachment.url, thumbnailUri: m.media?.thumbnailUrl, duration: m.media?.duration, size: m.attachment.size, mimeType: m.attachment.mime, name: m.attachment.name } : undefined,
    mediaSize: m.media?.width && m.media?.height ? { width: m.media.width, height: m.media.height } : undefined,
  };
}


// The two things the adapter needs from its environment — both
// injectable so the conformance test can stub them
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface ExampleTransportOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  connectSocket?: (url: string) => SocketLike;
}







// -----------------------------------------------------------
// createExampleTransport
// -----------------------------------------------------------

export function createExampleTransport(options: ExampleTransportOptions): ChatTransport {
  const doFetch = options.fetch ?? fetch;
  const connectSocket = options.connectSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);

  // ---- REST ----
  const call = async <T>(method: string, path: string, body?: unknown, multipart = false): Promise<T> => {
    const token = await options.getToken();
    let response: Response;
    try {
      response = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : multipart ? (body as FormData) : JSON.stringify(body),
      });
    } catch (err) {
      // fetch rejects only on network failure / abort
      throw new TransportError((err as Error).message || 'Network failure', 'network');
    }
    if (!response.ok) {
      let payload: { error?: string; code?: string } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        // No JSON body
      }
      throw new TransportError(payload.error || response.statusText || `HTTP ${response.status}`, 'http', response.status, payload.code, payload);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  };
  const enc = encodeURIComponent;

  // ---- realtime ----
  let socket: SocketLike | null = null;
  let status: RealtimeStatus = 'disconnected';
  const listeners = new Set<(event: ChatEvent) => void>();
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  const setStatus = (next: RealtimeStatus) => {
    status = next;
    statusListeners.forEach((fn) => fn(next));
  };
  const emit = (event: ChatEvent) => listeners.forEach((fn) => fn(event));
  const send = (frame: Record<string, unknown>) => {
    if (status === 'connected') socket?.send(JSON.stringify(frame));
  };

  // A server frame → a ChatEvent; unknown frames are ignored
  const onFrame = (raw: string) => {
    let frame: { type?: string } & Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as typeof frame;
    } catch {
      return;
    }
    switch (frame.type) {
      case 'message':
        emit({ type: 'message', message: toChatMessage(frame.message as WireMessage) });
        break;
      case 'deleted':
        emit({ type: 'deleted', conversationId: frame.room as string, messageId: frame.id as string });
        break;
      case 'edited':
        emit({ type: 'edited', conversationId: frame.room as string, messageId: frame.id as string, text: frame.text as string, editedAt: frame.editedAt as string });
        break;
      case 'reactions':
        emit({ type: 'reactions', conversationId: frame.room as string, messageId: frame.id as string, reactions: toReactionGroups(frame.reactions as { emoji: string; users: string[] }[]) });
        break;
      case 'read':
        emit({ type: 'read', conversationId: frame.room as string, readerId: frame.user as string, messageIds: (frame.ids as string[]) ?? [] });
        break;
      case 'typing':
        emit({ type: 'typing', conversationId: frame.room as string, userId: frame.user as string, displayName: (frame.name as string) ?? '', active: frame.active !== false });
        break;
      default:
        break;
    }
  };

  const realtime: ChatRealtime = {
    async connect() {
      const token = await options.getToken();
      if (!token) return false;
      if (socket && (status === 'connected' || status === 'connecting')) return true;
      setStatus('connecting');
      const ws = connectSocket(`${options.baseUrl.replace(/^http/, 'ws')}/ws?token=${enc(token)}`);
      socket = ws;
      ws.onopen = () => setStatus('connected');
      ws.onclose = () => setStatus('disconnected');
      ws.onerror = () => setStatus('disconnected');
      ws.onmessage = (event) => onFrame(event.data);
      return true;
    },
    status: () => status,
    onStatus: (fn) => {
      statusListeners.add(fn);
      return () => {
        statusListeners.delete(fn);
      };
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    join: (room) => send({ type: 'join', room }),
    typing: (room, active) => send({ type: active ? 'typing' : 'stop_typing', room }),
    markRead: (room) => send({ type: 'read', room }),
  };

  return {
    async fetchMessages(room, opts): Promise<MessagesPage> {
      const params = new URLSearchParams({ limit: String(opts?.limit ?? 50) });
      if (opts?.before) {
        params.set('before', opts.before.createdAt);
        params.set('beforeId', opts.before.id);
      }
      if (opts?.after) {
        params.set('after', opts.after.createdAt);
        params.set('afterId', opts.after.id);
      }
      if (opts?.around) params.set('around', opts.around);
      const resp = await call<{ items: WireMessage[]; hasMore: boolean; hasNewer?: boolean; members?: { id: string; name: string; avatar?: string | null }[]; room?: { id: string; kind: 'direct' | 'group'; title?: string | null } | null }>(
        'GET',
        `/rooms/${enc(room)}/messages?${params.toString()}`,
      );
      return {
        messages: resp.items.map(toChatMessage),
        hasMore: !!resp.hasMore,
        hasNewer: !!resp.hasNewer,
        participants: (resp.members ?? []).map((m) => ({ id: m.id, displayName: m.name, avatarUrl: m.avatar || undefined })),
        conversation: resp.room ? { id: resp.room.id, type: resp.room.kind, title: resp.room.title ?? null } : null,
      };
    },
    async sendMessage(room, message) {
      const row = await call<WireMessage>('POST', `/rooms/${enc(room)}/messages`, {
        text: message.text,
        imageUrl: message.imageUrl,
        replyTo: message.replyToId,
        clientId: message.clientId,
        kind: message.kind,
        attachment: message.attachment,
        media: message.media,
      });
      return { ...toChatMessage(row), isOwn: true, status: 'sent' };
    },
    editMessage: (room, id, text) => call('PATCH', `/rooms/${enc(room)}/messages/${enc(id)}`, { text }),
    async deleteMessage(room, id) {
      await call('DELETE', `/rooms/${enc(room)}/messages/${enc(id)}`);
    },
    async setReaction(room, id, emoji) {
      const resp = await call<{ reactions: { emoji: string; users: string[] }[] }>('PUT', `/rooms/${enc(room)}/messages/${enc(id)}/reaction`, { emoji });
      return toReactionGroups(resp.reactions);
    },
    async removeReaction(room, id) {
      const resp = await call<{ reactions: { emoji: string; users: string[] }[] }>('DELETE', `/rooms/${enc(room)}/messages/${enc(id)}/reaction`);
      return toReactionGroups(resp.reactions);
    },
    async markRead(room) {
      await call('POST', `/rooms/${enc(room)}/read`);
    },
    async upload(asset) {
      const form = new FormData();
      form.append('kind', asset.kind);
      form.append('file', { uri: asset.uri, name: asset.name ?? 'file', type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
      const resp = await call<{ url: string; name?: string; size?: number; mime?: string; width?: number | null; height?: number | null }>('POST', '/uploads', form, true);
      return { url: resp.url, name: resp.name ?? asset.name ?? 'file', size: resp.size ?? asset.size ?? 0, mime: resp.mime ?? asset.mimeType ?? 'application/octet-stream', width: resp.width ?? null, height: resp.height ?? null };
    },
    realtime,
  };
}
