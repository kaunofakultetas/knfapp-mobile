// -----------------------------------------------------------
//  [*] Socket — real-time chat client
//
//  One Socket.IO connection for the whole app, authenticated
//  with the stored session token (the backend reads it from
//  request.args at connect and rejects invalid tokens by
//  returning False from its connect handler).
//
//  Listeners live in a module-level registry, not on the
//  socket instance: a single dispatcher per event is bound to
//  each new io() instance, so subscriptions made while the
//  socket is null — or before a token change swapped the
//  instance — keep firing across every reconnect. The
//  historical design bound listeners to the instance, and a
//  network blip silently orphaned every mounted screen.
//
//  Transports are polling-first: the backend runs
//  flask-socketio in threading mode without simple-websocket,
//  so a websocket attempt can never succeed and only delays
//  each connect. NOTE the deployed Caddyfile routes /api/* but
//  not /socket.io/* to the backend — realtime works in local
//  dev only until that route is added.
//
//  Split into:
//
//    event payloads      — the wire contract with the backend
//    SocketStatus        — status type + accessors
//    listener registry   — addListener + bindInstance
//    connectSocket       — single-flight connect / reuse
//    disconnectSocket    — teardown (logout, token change)
//    emitters            — join/leave/typing/mark_read
//    on* helpers         — registry-backed subscriptions
// -----------------------------------------------------------

// Socket.IO is served on the API host, above the /api prefix
import { API_BASE_URL } from '@/services/api/client';

// Token storage and the socket.io client
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';


// Strip the /api suffix — socket.io lives at the host root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// The single module-wide connection and the token it carries
let socket: Socket | null = null;
let currentToken: string | null = null;

// Single-flight guard: concurrent connectSocket() callers
// (network restore + a screen mount) share one attempt
let inFlight: Promise<Socket | null> | null = null;

// Engine-level connect_error messages; anything else means the
// server refused the handshake (invalid/expired token)
const TRANSPORT_ERROR_MARKERS = [
  'timeout',
  'xhr poll error',
  'xhr post error',
  'websocket error',
  'server error',
];

// Transport failures retry; handshake rejections must not
const isTransportError = (err: Error) =>
  TRANSPORT_ERROR_MARKERS.some((marker) => err.message.includes(marker));







// -----------------------------------------------------------
// Event payloads
// -----------------------------------------------------------
//
// Mirrors the emit shapes of backend/app/chat/events.py and
// chat/routes.py in both directions. `time` is pre-formatted
// UTC server-side — screens must ignore it and format
// createdAt via services/format.ts instead. senderAvatar is
// present on fetched messages but currently omitted from the
// backend's live new_message payload, hence optional.
//
// Used by:
//   - hooks/useUnreadCount.ts — new_message subscription
//   - hooks/chat/* — chat room subscriptions
// -----------------------------------------------------------

export interface SocketMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  imageUrl?: string;
  time: string;
  createdAt: string;
  reactions: {
    emoji: string;
    count: number;
    byUserIds: string[];
  }[];
}

export interface ReactionUpdate {
  conversationId: string;
  messageId: string;
  reactions: {
    emoji: string;
    count: number;
    byUserIds: string[];
  }[];
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  displayName: string;
}

export interface StopTypingEvent {
  conversationId: string;
  userId: string;
}

export interface MessagesReadEvent {
  conversationId: string;
  readerId: string;
  messageIds: string[];
}







// -----------------------------------------------------------
// SocketStatus
// -----------------------------------------------------------
//
// 'reconnecting' comes from Manager-level events — in
// socket.io v4 the reconnect lifecycle fires on socket.io
// (the Manager), never on the Socket, so bindInstance
// registers there.
//
// Used by:
//   - hooks/useSocketStatus.ts — status subscription hook
// -----------------------------------------------------------

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type StatusListener = (status: SocketStatus) => void;

let status: SocketStatus = 'disconnected';
const statusListeners = new Set<StatusListener>();

// Fan a status change out to every subscriber
function setStatus(next: SocketStatus) {
  status = next;
  statusListeners.forEach((fn) => fn(next));
}







// -----------------------------------------------------------
// getSocketStatus
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useSocketStatus.ts — initial state before the
//     first status event
// -----------------------------------------------------------

export function getSocketStatus(): SocketStatus {
  return status;
}







// -----------------------------------------------------------
// onSocketStatusChange
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useSocketStatus.ts — subscribe on mount
// -----------------------------------------------------------

export function onSocketStatusChange(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}







// -----------------------------------------------------------
// Listener registry
// -----------------------------------------------------------
//
// Registration is instance-independent: on* helpers add to
// these Sets (working even while socket is null) and their
// unsubscribe closures remove from the same Sets — never from
// a socket that may have been swapped since.
//
// Used by:
//   - addListener, bindInstance, on* helpers (below)
// -----------------------------------------------------------

type EventName =
  | 'new_message'
  | 'reaction_update'
  | 'user_typing'
  | 'user_stop_typing'
  | 'messages_read';

type Listener<T> = (data: T) => void;

// Every server event a dispatcher is bound for
const FORWARDED_EVENTS: EventName[] = [
  'new_message',
  'reaction_update',
  'user_typing',
  'user_stop_typing',
  'messages_read',
];

// Stored as Listener<never> (contravariant) so one Set type
// holds every payload shape; dispatch casts back at call time
const registry = new Map<EventName, Set<Listener<never>>>();

// Register into the registry; returns the unsubscribe closure
function addListener<T>(event: EventName, listener: Listener<T>): () => void {
  let listeners = registry.get(event);
  if (!listeners) {
    listeners = new Set();
    registry.set(event, listeners);
  }
  const entry = listener as Listener<never>;
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}







// -----------------------------------------------------------
// bindInstance
// -----------------------------------------------------------
//
// Attaches everything a fresh io() instance needs: one
// registry dispatcher per forwarded event, status tracking,
// and the connect_error policy — transport failures are left
// to the Manager's built-in reconnection, while an auth-style
// rejection stops retrying entirely (the token is stale; a
// later connectSocket() re-reads it from storage).
//
// Used by:
//   - establish (below)
// -----------------------------------------------------------

function bindInstance(instance: Socket): void {
  // Registry dispatchers — the only per-event socket listeners
  for (const event of FORWARDED_EVENTS) {
    instance.on(event, (payload: unknown) => {
      registry.get(event)?.forEach((fn) => fn(payload as never));
    });
  }


  instance.on('connect', () => setStatus('connected'));
  instance.on('disconnect', () => setStatus('disconnected'));


  // Backend handle_connect returns False on a bad token — keep
  // retrying that token forever and we hammer the server with
  // a dead session
  instance.on('connect_error', (err: Error) => {
    setStatus('disconnected');
    if (!isTransportError(err)) {
      instance.disconnect();
    }
  });


  // Reconnect lifecycle is Manager-level in socket.io v4
  instance.io.on('reconnect_attempt', () => setStatus('reconnecting'));
  instance.io.on('reconnect_error', () => setStatus('reconnecting'));
  instance.io.on('reconnect', () => setStatus('connected'));
  instance.io.on('reconnect_failed', () => setStatus('disconnected'));
}







// -----------------------------------------------------------
// establish
// -----------------------------------------------------------
//
// The actual connect logic behind connectSocket(). Reads the
// token from stored auth; with the SAME token any existing
// instance is reused — connected, connecting or mid-reconnect
// — because tearing it down would detach the registry
// dispatchers mid-flight. Only a token change (a different
// account logged in) rebuilds the instance.
//
// Used by:
//   - connectSocket (below)
// -----------------------------------------------------------

async function establish(): Promise<Socket | null> {
  let token: string | null = null;
  try {
    const raw = await AsyncStorage.getItem('auth');
    if (raw) token = (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    // Unreadable auth blob — treat as logged out
  }
  if (!token) return null;


  // Same token: reuse, nudging a manually-disconnected socket
  // back to life (connect() no-ops while auto-reconnecting)
  if (socket && currentToken === token) {
    if (socket.disconnected) socket.connect();
    return socket;
  }


  // Token changed — rebuild from scratch
  disconnectSocket();

  currentToken = token;
  setStatus('connecting');
  const instance = io(SOCKET_URL, {
    // io() caches Managers per URL — a reused Manager would
    // keep the OLD token in its query, so force a fresh one
    forceNew: true,
    // Backend reads the token from request.args at connect
    query: { token },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    timeout: 15000,
  });
  bindInstance(instance);
  socket = instance;
  return instance;
}







// -----------------------------------------------------------
// connectSocket
// -----------------------------------------------------------
//
// Resolves null when no auth token is stored (guests have no
// realtime). Safe to call repeatedly — concurrent callers
// share one in-flight attempt, and repeated calls with the
// same token return the same instance.
//
// Used by:
//   - context/AuthContext.tsx — after login / session restore
//   - context/NetworkContext.tsx — on connectivity regain
// -----------------------------------------------------------

export function connectSocket(): Promise<Socket | null> {
  if (inFlight) return inFlight;

  inFlight = establish().finally(() => {
    inFlight = null;
  });
  return inFlight;
}







// -----------------------------------------------------------
// disconnectSocket
// -----------------------------------------------------------
//
// Full teardown: registry Sets stay intact (screens keep their
// subscriptions), but the instance, its Manager listeners and
// the remembered token are dropped, so the next connectSocket()
// builds fresh.
//
// Used by:
//   - context/AuthContext.tsx — logout
//   - establish (above) — token change
// -----------------------------------------------------------

export function disconnectSocket(): void {
  if (socket) {
    // Remove only our Manager events — a blanket off() would
    // strip the Socket's own internal Manager subscriptions
    socket.io.off('reconnect_attempt');
    socket.io.off('reconnect_error');
    socket.io.off('reconnect');
    socket.io.off('reconnect_failed');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
  setStatus('disconnected');
}







// -----------------------------------------------------------
// joinConversation
// -----------------------------------------------------------
//
// The backend auto-joins existing conversation rooms at
// connect — this is for conversations created after that.
//
// Used by:
//   - hooks/chat/useChatMessages — chat room mount
// -----------------------------------------------------------

export function joinConversation(conversationId: string): void {
  socket?.emit('join_conversation', { conversationId });
}







// -----------------------------------------------------------
// leaveConversation
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useChatMessages — chat room unmount
// -----------------------------------------------------------

export function leaveConversation(conversationId: string): void {
  socket?.emit('leave_conversation', { conversationId });
}







// -----------------------------------------------------------
// emitTyping
// -----------------------------------------------------------
//
// Rate-limited server-side (20 per 10 s) — callers throttle.
//
// Used by:
//   - hooks/chat/useChatComposer — on input change
// -----------------------------------------------------------

export function emitTyping(conversationId: string): void {
  socket?.emit('typing', { conversationId });
}







// -----------------------------------------------------------
// emitStopTyping
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useChatComposer — idle timeout / send
// -----------------------------------------------------------

export function emitStopTyping(conversationId: string): void {
  socket?.emit('stop_typing', { conversationId });
}







// -----------------------------------------------------------
// emitMarkRead
// -----------------------------------------------------------
//
// Socket alternative to the REST mark-read endpoint; the
// backend answers with a messages_read broadcast.
//
// Used by:
//   - hooks/chat/useChatMessages — on viewing new messages
// -----------------------------------------------------------

export function emitMarkRead(conversationId: string): void {
  socket?.emit('mark_read', { conversationId });
}







// -----------------------------------------------------------
// onNewMessage
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useUnreadCount.ts — badge increments
//   - hooks/chat/useChatMessages — live message append
//   - app/(main)/tabs/messages.tsx — conversation list refresh
// -----------------------------------------------------------

export function onNewMessage(listener: Listener<SocketMessage>): () => void {
  return addListener('new_message', listener);
}







// -----------------------------------------------------------
// onReactionUpdate
// -----------------------------------------------------------
//
// Carries the authoritative reactions array — the REST react
// call itself returns only {ok, emoji}.
//
// Used by:
//   - hooks/chat/useChatReactions — reconcile optimistic state
// -----------------------------------------------------------

export function onReactionUpdate(listener: Listener<ReactionUpdate>): () => void {
  return addListener('reaction_update', listener);
}







// -----------------------------------------------------------
// onTyping
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useTypingIndicator — show "X is typing"
// -----------------------------------------------------------

export function onTyping(listener: Listener<TypingEvent>): () => void {
  return addListener('user_typing', listener);
}







// -----------------------------------------------------------
// onStopTyping
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useTypingIndicator — clear the indicator
// -----------------------------------------------------------

export function onStopTyping(listener: Listener<StopTypingEvent>): () => void {
  return addListener('user_stop_typing', listener);
}







// -----------------------------------------------------------
// onMessagesRead
// -----------------------------------------------------------
//
// Used by:
//   - hooks/chat/useChatMessages — flip own bubbles to read
// -----------------------------------------------------------

export function onMessagesRead(listener: Listener<MessagesReadEvent>): () => void {
  return addListener('messages_read', listener);
}
