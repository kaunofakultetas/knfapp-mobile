// -----------------------------------------------------------
//  [*] Socket — the app's realtime client
//
//  One Socket.IO connection for the whole app, built by
//  @knf/chatengine's KNF adapter (createKnfSocket — the
//  lifecycle, auth and registry live there). This module owns
//  the singleton and keeps the function-style surface every
//  screen and context already uses: connectSocket /
//  disconnectSocket / suspendSocket, the status accessors, the
//  emitters and the on* helpers.
//
//  The chat engine drives the room-level traffic (typing,
//  reactions, edits) through socketClient itself, so the
//  subscriptions kept here are the three the app-level badge
//  and the messages list really use — the reaction / typing /
//  edit twins that nothing ever called were retired (KNF-192).
//  Four emitters still have no app-side caller; they stay as
//  the module's stable surface and their banners say so.
//
//  Split into:
//
//    socketClient  — the singleton
//    payload types — re-exported wire shapes
//    lifecycle     — connect / disconnect / suspend
//    status        — getSocketStatus / onSocketStatusChange
//    emitters      — join / leave / typing / mark_read
//    on* helpers   — new message / read / deleted subscriptions
// -----------------------------------------------------------

// Socket.IO is served on the API host, above the /api prefix
import { API_BASE_URL } from '@/services/api/client';

// The one place the stored session token can be read from
import { getStoredToken } from '@/services/session';

// A refused or failed handshake leaves a diagnosable trace
import { logError } from '@/services/log';

import { createKnfSocket } from '@knf/chatengine/adapters/knf';
import type {
  ApiMessage,
  ApiMessageDeletedEvent,
  ApiMessagesReadEvent,
} from '@knf/chatengine/adapters/knf';
import type { RealtimeStatus } from '@knf/chatengine';


// Strip the /api suffix — socket.io lives at the host root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');







// -----------------------------------------------------------
// socketClient
// -----------------------------------------------------------
//
// The one adapter-owned connection: lifecycle, token auth and
// the listener registry all live in createKnfSocket.
//
// Used by:
//   - services/chatTransport.ts — handed to the chat engine
//   - every helper below
// -----------------------------------------------------------

export const socketClient = createKnfSocket({
  url: SOCKET_URL,
  getToken: getStoredToken,
  log: (scope, err) => logError(scope, err),
});







// -----------------------------------------------------------
// SocketMessage
// -----------------------------------------------------------
//
// The wire message payload, under the name the app has always
// used.
//
// Used by:
//   - onNewMessage (below) — the listener payload
//   - app/(main)/tabs/messages.tsx, hooks/useUnreadCount.ts
// -----------------------------------------------------------

export type SocketMessage = ApiMessage;







// -----------------------------------------------------------
// MessageDeletedEvent
// -----------------------------------------------------------
//
// { conversationId, messageId } — broadcast to the whole room
// (the deleter's own sockets included) after an unsend; the
// row is gone entirely, not blanked to a tombstone.
//
// Used by:
//   - onMessageDeleted (below) — the listener payload
// -----------------------------------------------------------

export type MessageDeletedEvent = ApiMessageDeletedEvent;







// -----------------------------------------------------------
// MessagesReadEvent
// -----------------------------------------------------------
//
// One reader's receipts over a batch of rows: readerId read
// every id in messageIds. Targeted at the read rows' senders
// and the reader's other devices — the whole room only when
// the server's sid targeting fails and it falls back.
//
// Used by:
//   - onMessagesRead (below) — the listener payload
// -----------------------------------------------------------

export type MessagesReadEvent = ApiMessagesReadEvent;







// -----------------------------------------------------------
// SocketStatus
// -----------------------------------------------------------
//
// The adapter's connection state, under the app's own name.
//
// Used by:
//   - getSocketStatus / onSocketStatusChange (below)
//   - app/(main)/tabs/messages.tsx, hooks/useSocketStatus.ts
// -----------------------------------------------------------

export type SocketStatus = RealtimeStatus;







// -----------------------------------------------------------
// connectSocket
// -----------------------------------------------------------
//
// Lifts the adapter's signed-out latch and establishes with a
// freshly read token. Resolves null — never throws — when no
// token is stored; concurrent calls share one in-flight
// attempt, and a token change swaps the instance underneath.
//
// Used by:
//   - context/AuthContext.tsx — on login/restore
//   - context/NetworkContext.tsx — on reconnect/foreground
//   - app/(main)/tabs/messages.tsx, hooks/useUnreadCount.ts
// -----------------------------------------------------------

export const connectSocket = () => socketClient.connect();







// -----------------------------------------------------------
// disconnectSocket
// -----------------------------------------------------------
//
// Sets the signed-out latch and bumps the generation counter,
// so an establish() still awaiting its token read cannot
// resurrect a socket for the departing account; only
// connectSocket lifts the latch again.
//
// Used by:
//   - context/AuthContext.tsx — on logout
//   - context/NetworkContext.tsx — on going offline
// -----------------------------------------------------------

export const disconnectSocket = () => socketClient.disconnect();







// -----------------------------------------------------------
// suspendSocket
// -----------------------------------------------------------
//
// Drops the transport but keeps the instance, its token and
// the latch untouched — unlike disconnectSocket, the next
// connectSocket resumes the same instance instead of building
// a new one from scratch.
//
// Used by:
//   - context/NetworkContext.tsx — on backgrounding
// -----------------------------------------------------------

export const suspendSocket = () => socketClient.suspend();







// -----------------------------------------------------------
// getSocketStatus
// -----------------------------------------------------------
//
// Synchronous snapshot of the adapter's state: disconnected /
// connecting / connected / reconnecting, or 'unauthorized'
// when the server itself refused the handshake token.
//
// Used by:
//   - hooks/useSocketStatus.ts — the initial snapshot
//   - hooks/useUnreadCount.ts
// -----------------------------------------------------------

export const getSocketStatus = (): SocketStatus => socketClient.status();







// -----------------------------------------------------------
// onSocketStatusChange
// -----------------------------------------------------------
//
// Fires on every transition — including 'reconnecting' during
// each retry of the backoff loop, so subscribers may see it
// repeatedly. Returns the unsubscribe function.
//
// Used by:
//   - hooks/useSocketStatus.ts — the live subscription
//   - hooks/useUnreadCount.ts
// -----------------------------------------------------------

export const onSocketStatusChange = (listener: (status: SocketStatus) => void) => socketClient.onStatus(listener);







// -----------------------------------------------------------
// joinConversation
// -----------------------------------------------------------
//
// Asks the server to add this socket to room conv:<id> — the
// server verifies membership before admitting. A silent no-op
// while no socket instance exists.
//
// Used by:
//   - nothing calls this at the moment — the chat engine joins
//     rooms through socketClient itself; leaveConversation is
//     the half the messages tab still uses
// -----------------------------------------------------------

export const joinConversation = (conversationId: string) => socketClient.emit('join_conversation', { conversationId });







// -----------------------------------------------------------
// leaveConversation
// -----------------------------------------------------------
//
// Removes this socket from room conv:<id>, ending the room's
// broadcasts to this device; membership itself is untouched.
// A silent no-op while no socket instance exists.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — leaving the open room
// -----------------------------------------------------------

export const leaveConversation = (conversationId: string) => socketClient.emit('leave_conversation', { conversationId });







// -----------------------------------------------------------
// emitTyping
// -----------------------------------------------------------
//
// VOLATILE emit — dropped, never queued, when the connection
// is down; the server fans it out to the room minus the
// sender, so this device never hears its own typing.
//
// Used by:
//   - nothing calls this at the moment — the chat engine emits
//     typing through the transport's socket
// -----------------------------------------------------------

export const emitTyping = (conversationId: string) => socketClient.emitVolatile('typing', { conversationId });







// -----------------------------------------------------------
// emitStopTyping
// -----------------------------------------------------------
//
// emitTyping's closing half, with the same volatile-drop
// semantics — receivers also clear on their own timeout, so a
// lost stop event only delays the indicator, never wedges it.
//
// Used by:
//   - nothing calls this at the moment — see emitTyping
// -----------------------------------------------------------

export const emitStopTyping = (conversationId: string) => socketClient.emitVolatile('stop_typing', { conversationId });







// -----------------------------------------------------------
// emitMarkRead
// -----------------------------------------------------------
//
// The socket twin of PUT /api/chat/conversations/<id>/read —
// both share one server-side 10-per-10 s budget. Volatile:
// dropped when the connection is down, so offline reads must
// go through the REST path instead.
//
// Used by:
//   - nothing calls this at the moment — read receipts ride the
//     chat engine's own mark-read path
// -----------------------------------------------------------

export const emitMarkRead = (conversationId: string) => socketClient.emitVolatile('mark_read', { conversationId });







// -----------------------------------------------------------
// onNewMessage
// -----------------------------------------------------------
//
// Registry-backed: may be registered before any connect and
// keeps firing across reconnects and token swaps. The payload
// includes the sender's own room echo — consumers dedupe it
// against their optimistic state. Returns the unsubscribe.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — live preview refresh
//   - hooks/useUnreadCount.ts — the badge bump
// -----------------------------------------------------------

export const onNewMessage = (listener: (data: SocketMessage) => void) => socketClient.on('new_message', listener);







// -----------------------------------------------------------
// onMessagesRead
// -----------------------------------------------------------
//
// Fires when a reader's receipts land — including this user's
// own reads on ANOTHER device, which is what lets the badge
// drop everywhere at once. Registry-backed; returns the
// unsubscribe.
//
// Used by:
//   - hooks/useUnreadCount.ts — the badge drop
// -----------------------------------------------------------

export const onMessagesRead = (listener: (data: MessagesReadEvent) => void) => socketClient.on('messages_read', listener);







// -----------------------------------------------------------
// onMessageDeleted
// -----------------------------------------------------------
//
// Registry-backed subscription; the payload names a row that
// no longer exists, so listeners drop it rather than mark it.
// Returns the unsubscribe.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — preview correction
//   - hooks/useUnreadCount.ts
// -----------------------------------------------------------

export const onMessageDeleted = (listener: (data: MessageDeletedEvent) => void) => socketClient.on('message_deleted', listener);
