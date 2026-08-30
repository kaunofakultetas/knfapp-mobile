// -----------------------------------------------------------
//  [*] chatengine — knf adapter
//
//  ChatTransport for the KNF Flask + Socket.IO backend: the
//  REST half through the host's HTTP client, the realtime half
//  through createKnfSocket, with every wire payload mapped into
//  the engine's domain types and events. The conformance suite
//  in testing/transportContract.ts runs against it.
//
//  Split into:
//
//    createKnfRealtime   — socket events → ChatEvent
//    createKnfTransport  — the whole transport
// -----------------------------------------------------------

import type { ChatEvent, ChatRealtime, ChatTransport } from '../../core/transport';
import { createKnfRest, type HttpClient, type KnfRestOptions } from './rest';
import type { KnfSocketClient } from './socket';
import { toChatMessage, toReactionGroups } from './wire';

export { createKnfRest, type HttpClient, type HttpRequestOptions, type KnfRestOptions } from './rest';
export { createKnfSocket, type KnfSocketClient, type KnfSocketOptions, type SocketEventName, type SocketEventPayloads } from './socket';
export * from './wire';







// -----------------------------------------------------------
// createKnfRealtime
// -----------------------------------------------------------
//
// Used by:
//   - createKnfTransport (below)
// -----------------------------------------------------------

export function createKnfRealtime(socket: KnfSocketClient): ChatRealtime {
  return {
    connect: () => socket.connect().then((instance) => instance !== null),
    status: () => socket.status(),
    onStatus: (listener) => socket.onStatus(listener),
    subscribe: (listener: (event: ChatEvent) => void) => {
      const offs = [
        socket.on('new_message', (m) => listener({ type: 'message', message: toChatMessage(m) })),
        socket.on('reaction_update', (e) => listener({ type: 'reactions', conversationId: e.conversationId, messageId: e.messageId, reactions: toReactionGroups(e.reactions) })),
        socket.on('message_deleted', (e) => listener({ type: 'deleted', conversationId: e.conversationId, messageId: e.messageId })),
        socket.on('message_edited', (e) => listener({ type: 'edited', conversationId: e.conversationId, messageId: e.messageId, text: e.text, editedAt: e.editedAt })),
        socket.on('message_updated', (e) =>
          listener({
            type: 'updated',
            conversationId: e.conversationId,
            messageId: e.messageId,
            patch: {
              ...('linkPreview' in (e.patch ?? {}) ? { linkPreview: e.patch?.linkPreview ?? null } : {}),
              ...('pinnedAt' in (e.patch ?? {}) ? { pinnedAt: e.patch?.pinnedAt ?? null, pinnedBy: e.patch?.pinnedBy ?? null } : {}),
            },
          }),
        ),
        socket.on('conversation_updated', (e) => listener({ type: 'conversation', conversationId: e.conversationId, patch: { messageTtlSeconds: e.patch?.messageTtlSeconds ?? null } })),
        socket.on('messages_read', (e) => listener({ type: 'read', conversationId: e.conversationId, readerId: e.readerId, messageIds: e.messageIds ?? [] })),
        socket.on('user_typing', (e) => listener({ type: 'typing', conversationId: e.conversationId, userId: e.userId, displayName: e.displayName, active: true })),
        socket.on('user_stop_typing', (e) => listener({ type: 'typing', conversationId: e.conversationId, userId: e.userId, displayName: '', active: false })),
      ];
      return () => offs.forEach((off) => off());
    },
    join: (conversationId) => socket.emit('join_conversation', { conversationId }),
    typing: (conversationId, active) => socket.emitVolatile(active ? 'typing' : 'stop_typing', { conversationId }),
    markRead: (conversationId) => socket.emitVolatile('mark_read', { conversationId }),
  };
}







// -----------------------------------------------------------
// createKnfTransport
// -----------------------------------------------------------
//
//   const transport = createKnfTransport({ http, socket })
//
// Used by:
//   - the host's ChatEngineHost
// -----------------------------------------------------------

export function createKnfTransport(options: { socket: KnfSocketClient } & Omit<KnfRestOptions, 'http'> & { http: HttpClient }): ChatTransport {
  const { socket, ...rest } = options;
  return { ...createKnfRest(rest), realtime: createKnfRealtime(socket) };
}
