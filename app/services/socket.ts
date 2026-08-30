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
//  Split into:
//
//    socketClient  — the singleton
//    lifecycle     — connect / disconnect / suspend
//    status        — getSocketStatus / onSocketStatusChange
//    emitters      — join / leave / typing / mark_read
//    on* helpers   — registry-backed subscriptions
//    payload types — re-exported wire shapes
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
  ApiMessageEditedEvent,
  ApiMessagesReadEvent,
  ApiReactionUpdate,
  ApiStopTypingEvent,
  ApiTypingEvent,
} from '@knf/chatengine/adapters/knf';
import type { RealtimeStatus } from '@knf/chatengine';


// Strip the /api suffix — socket.io lives at the host root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const socketClient = createKnfSocket({
  url: SOCKET_URL,
  getToken: getStoredToken,
  log: (scope, err) => logError(scope, err),
});


// Wire payloads, under the names the app has always used
export type SocketMessage = ApiMessage;
export type MessageDeletedEvent = ApiMessageDeletedEvent;
export type MessageEditedEvent = ApiMessageEditedEvent;
export type ReactionUpdate = ApiReactionUpdate;
export type TypingEvent = ApiTypingEvent;
export type StopTypingEvent = ApiStopTypingEvent;
export type MessagesReadEvent = ApiMessagesReadEvent;
export type SocketStatus = RealtimeStatus;


// Lifecycle
export const connectSocket = () => socketClient.connect();
export const disconnectSocket = () => socketClient.disconnect();
export const suspendSocket = () => socketClient.suspend();

// Status
export const getSocketStatus = (): SocketStatus => socketClient.status();
export const onSocketStatusChange = (listener: (status: SocketStatus) => void) => socketClient.onStatus(listener);

// Emitters
export const joinConversation = (conversationId: string) => socketClient.emit('join_conversation', { conversationId });
export const leaveConversation = (conversationId: string) => socketClient.emit('leave_conversation', { conversationId });
export const emitTyping = (conversationId: string) => socketClient.emitVolatile('typing', { conversationId });
export const emitStopTyping = (conversationId: string) => socketClient.emitVolatile('stop_typing', { conversationId });
export const emitMarkRead = (conversationId: string) => socketClient.emitVolatile('mark_read', { conversationId });

// Subscriptions
export const onNewMessage = (listener: (data: SocketMessage) => void) => socketClient.on('new_message', listener);
export const onReactionUpdate = (listener: (data: ReactionUpdate) => void) => socketClient.on('reaction_update', listener);
export const onTyping = (listener: (data: TypingEvent) => void) => socketClient.on('user_typing', listener);
export const onStopTyping = (listener: (data: StopTypingEvent) => void) => socketClient.on('user_stop_typing', listener);
export const onMessagesRead = (listener: (data: MessagesReadEvent) => void) => socketClient.on('messages_read', listener);
export const onMessageDeleted = (listener: (data: MessageDeletedEvent) => void) => socketClient.on('message_deleted', listener);
export const onMessageEdited = (listener: (data: MessageEditedEvent) => void) => socketClient.on('message_edited', listener);
