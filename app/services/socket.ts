// -----------------------------------------------------------
//  [*] Socket — real-time chat client
//
//  One Socket.IO connection for the whole app, authenticated
//  with the stored session token sent in the handshake's auth
//  payload — never the query string, which every proxy and
//  access log would see (the backend reads the auth payload
//  first, falling back to request.args for old clients, and
//  rejects invalid tokens by returning False from its connect
//  handler; that rejection surfaces here as the 'unauthorized'
//  status).
//
//  The connection follows the app lifecycle: backgrounding
//  tears it down (so backend presence means foreground and
//  chat pushes are not suppressed while backgrounded) and
//  foregrounding reconnects. A generation counter plus a
//  signed-out latch let disconnectSocket() invalidate an
//  establish() that is still awaiting the token read, so a
//  logout can never be overtaken by a socket built for the
//  departing account.
//
//  Listeners live in a module-level registry, not on the
//  socket instance: a single dispatcher per event is bound to
//  each new io() instance, so subscriptions made while the
//  socket is null — or before a token change swapped the
//  instance — keep firing across every reconnect. The
//  historical design bound listeners to the instance, and a
//  network blip silently orphaned every mounted screen.
//
//  Transport is long-polling only, with upgrades disabled: the
//  backend runs flask-socketio in threading mode without
//  simple-websocket, so a websocket attempt can never succeed
//  and would only fail noisily after every connect. The
//  ingress Caddyfile proxies /socket.io/* to the backend, and
//  the backend's ALLOWED_ORIGINS must list the web origin —
//  flask-socketio checks Origin on the polling handshake even
//  for same-origin pages (native apps send no Origin).
//
//  Split into:
//
//    event payloads      — the wire contract with the backend
//    SocketStatus        — status type + accessors
//    listener registry   — addListener + bindInstance
//    connectSocket       — single-flight connect / reuse
//    disconnectSocket    — teardown (logout, token change)
//    suspendSocket       — offline pause for the retry loop
//    app lifecycle       — background/foreground follow
//    emitters            — join/leave/typing/mark_read
//    on* helpers         — registry-backed subscriptions
//                          (new_message, reaction_update, typing,
//                          messages_read, message_deleted)
// -----------------------------------------------------------

// Socket.IO is served on the API host, above the /api prefix
import { API_BASE_URL } from '@/services/api/client';

// The one place the stored session token can be read from
import { getStoredToken } from '@/services/session';

// A refused or failed handshake leaves a diagnosable trace
import { logError } from '@/services/log';

// App lifecycle and the socket.io client
import { AppState } from 'react-native';
import { io, Socket } from 'socket.io-client';


// Strip the /api suffix — socket.io lives at the host root
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// The single module-wide connection and the token it carries
let socket: Socket | null = null;
let currentToken: string | null = null;

// Single-flight guard: concurrent connectSocket() callers
// (network restore + a screen mount) share one attempt
let inFlight: Promise<Socket | null> | null = null;

// Bumped by every disconnectSocket() so an establish() that
// was already past its token read notices the teardown and
// bails instead of resurrecting a connection
let generation = 0;

// Set by disconnectSocket(), cleared by the next explicit
// connectSocket() — while set, establish() resolves null, so a
// reconnect racing a logout cannot revive the departing
// account's socket
let signedOut = false;

// A handshake the SERVER refused (flask-socketio returning
// False, or any namespace-level rejection) arrives as a
// CONNECT_ERROR packet, and socket.io-client always copies the
// packet's payload onto the Error's `data` own property — even
// when the payload is empty. Engine-level failures
// (TransportError, the Manager's connect timeout) never carry
// one. Classifying on that property is structural; the old
// substring match against engine.io's internal message strings
// misfiled an HTTP-level refusal (Origin check, dead proxy) as
// a transport blip and would break silently if the wording
// ever changed.
const isServerRejection = (err: Error) => 'data' in err;







// -----------------------------------------------------------
// Event payloads
// -----------------------------------------------------------
//
// Mirrors the emit shapes of backend/app/chat/events.py and
// chat/routes.py in both directions. `time` is pre-formatted
// UTC server-side — screens must ignore it and format
// createdAt via services/format.ts instead. senderAvatar is
// present on fetched messages but currently omitted from the
// backend's live new_message payload, hence optional. The
// backend row columns behind text/imageUrl/senderAvatar are
// nullable, and the wire types say so — handlers default them,
// never trust them. clientMsgId is the sender's optimistic
// nonce echoed back, so the sender's own screen can replace
// its temp bubble by id instead of by content.
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
  senderAvatar?: string | null;
  text: string | null;
  imageUrl?: string | null;
  clientMsgId?: string | null;
  time: string;
  createdAt: string;
  reactions: {
    emoji: string;
    count: number;
    byUserIds: string[];
  }[];
  replyTo?: {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    imageUrl?: string | null;
    deleted: boolean;
    kind?: 'text' | 'image' | 'video' | 'file' | 'system';
    fileName?: string | null;
  } | null;
  deleted?: boolean;
  // v57/v58: the kind, the edit stamp, the attachment and the
  // media frame — same shape as the REST ApiMessage
  kind?: 'text' | 'image' | 'video' | 'file' | 'system';
  editedAt?: string | null;
  attachment?: { url: string; name: string; size: number; mime: string } | null;
  media?: { width?: number | null; height?: number | null; duration?: number | null; thumbnailUrl?: string | null } | null;
}

export interface MessageDeletedEvent {
  conversationId: string;
  messageId: string;
}

// The sender rewrote a message: the new text and the edit stamp
export interface MessageEditedEvent {
  conversationId: string;
  messageId: string;
  text: string;
  editedAt: string;
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
// registers there. 'unauthorized' means the server refused the
// handshake (dead/expired token): retrying is pointless, and
// the UI should offer signing in again instead of a reconnect
// spinner.
//
// Used by:
//   - hooks/useSocketStatus.ts — status subscription hook
// -----------------------------------------------------------

export type SocketStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unauthorized';

type StatusListener = (status: SocketStatus) => void;

let status: SocketStatus = 'disconnected';
const statusListeners = new Set<StatusListener>();

// Fan a status change out to every subscriber — one throwing
// listener must not silence the rest (NetworkContext pattern)
function setStatus(next: SocketStatus) {
  status = next;
  statusListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      // A broken subscriber is its own problem
    }
  });
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
  | 'messages_read'
  | 'message_deleted'
  | 'message_edited';

type Listener<T> = (data: T) => void;

// Every server event a dispatcher is bound for
const FORWARDED_EVENTS: EventName[] = [
  'new_message',
  'reaction_update',
  'user_typing',
  'user_stop_typing',
  'messages_read',
  'message_deleted',
  'message_edited',
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
  // Registry dispatchers — the only per-event socket listeners.
  // Each subscriber is isolated: one throwing listener must not
  // starve every later one of the same event.
  for (const event of FORWARDED_EVENTS) {
    instance.on(event, (payload: unknown) => {
      registry.get(event)?.forEach((fn) => {
        try {
          fn(payload as never);
        } catch {
          // A broken subscriber is its own problem
        }
      });
    });
  }


  instance.on('connect', () => setStatus('connected'));
  instance.on('disconnect', () => setStatus('disconnected'));


  // Backend handle_connect returns False on a bad token — keep
  // retrying that token forever and we hammer the server with
  // a dead session. Full teardown (not a bare instance
  // disconnect) nulls socket/currentToken, so the next
  // connectSocket() after signing in again starts clean; the
  // 'unauthorized' status tells the UI to offer exactly that.
  instance.on('connect_error', (err: Error) => {
    logError('socket', err);
    if (isServerRejection(err)) {
      disconnectSocket();
      setStatus('unauthorized');
      return;
    }
    setStatus('disconnected');
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
// token through services/session; with the SAME token any
// existing instance is reused — connected, connecting or
// mid-reconnect — because tearing it down would detach the
// registry dispatchers mid-flight. Only a token change (a
// different account logged in) rebuilds the instance.
//
// The generation captured up front and the signed-out latch
// are re-checked after every await: a disconnectSocket() that
// lands mid-establish (logout, backgrounding) wins, and the
// half-built socket is torn down instead of handed out. The
// final re-read of the stored token guards the single flight
// itself — a caller is never handed a socket built for a
// different account than the one now signed in.
//
// Used by:
//   - connectSocket (below)
// -----------------------------------------------------------

async function establish(): Promise<Socket | null> {
  const gen = generation;

  const token = await getStoredToken();
  if (!token) return null;


  // Torn down while the token read was in flight — stay down
  if (signedOut || generation !== gen) return null;


  // Same token: reuse, nudging a manually-disconnected socket
  // back to life (connect() no-ops while auto-reconnecting);
  // only a socket actually down flaps the status
  if (socket && currentToken === token) {
    if (socket.disconnected) {
      setStatus('connecting');
      socket.connect();
    }
    return socket;
  }


  // Token changed — rebuild from scratch
  teardownInstance();

  currentToken = token;
  setStatus('connecting');
  const instance = io(SOCKET_URL, {
    // io() caches Managers per URL — a reused Manager would
    // keep the OLD token in its handshake, so force a fresh one
    forceNew: true,
    // The token rides in the handshake's auth payload — never
    // the query string, which proxies and access logs record;
    // the backend falls back to request.args only for clients
    // predating this change
    auth: { token },
    // Polling only: the backend (flask-socketio, threading mode,
    // no simple-websocket) cannot accept WebSocket, so every
    // upgrade attempt would fail noisily and delay nothing but us
    transports: ['polling'],
    upgrade: false,
    reconnection: true,
    // Bounded: a misconfigured server (Origin refusal, dead
    // proxy) presents as a transport error, and an unlimited
    // loop would poll it every 15 s forever. After the ceiling
    // the Manager stops; network restore, foregrounding and the
    // messages screen's retry line all call connectSocket(),
    // which starts a fresh cycle
    reconnectionAttempts: 30,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    timeout: 15000,
  });
  bindInstance(instance);
  socket = instance;


  // Hand-off validation: everyone sharing this flight gets the
  // socket only if the stored token is still the one it was
  // built for and no teardown landed meanwhile
  const latest = await getStoredToken();
  if (latest !== token || signedOut || generation !== gen) {
    teardownInstance();
    setStatus('disconnected');
    return null;
  }
  return instance;
}







// -----------------------------------------------------------
// connectSocket
// -----------------------------------------------------------
//
// Resolves null when no auth token is stored (guests have no
// realtime). Safe to call repeatedly — concurrent callers
// share one in-flight attempt, and repeated calls with the
// same token return the same instance. An explicit connect is
// also the one thing that lifts the signed-out latch: it means
// a session is (re)established or connectivity returned, so
// establishing is wanted again.
//
// Used by:
//   - context/AuthContext.tsx — after login / session restore
//   - context/NetworkContext.tsx — on connectivity regain
//   - app lifecycle listener (below) — on foreground
// -----------------------------------------------------------

export function connectSocket(): Promise<Socket | null> {
  signedOut = false;

  if (inFlight) return inFlight;

  // Clear the guard only if it is still OURS — disconnectSocket
  // nulls it mid-flight, and a stale finally must not wipe out
  // the next caller's fresh attempt
  const attempt: Promise<Socket | null> = establish().finally(() => {
    if (inFlight === attempt) inFlight = null;
  });
  inFlight = attempt;
  return attempt;
}







// -----------------------------------------------------------
// teardownInstance
// -----------------------------------------------------------
//
// Drops the instance only: registry Sets stay intact (screens
// keep their subscriptions), but the socket, its Manager
// listeners and the remembered token go, so the next build
// starts fresh. No latch, no generation bump — establish()
// uses this mid-flight for a token change without invalidating
// itself.
//
// Used by:
//   - disconnectSocket (below)
//   - establish (above) — token change, hand-off bail
// -----------------------------------------------------------

function teardownInstance(): void {
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
}







// -----------------------------------------------------------
// disconnectSocket
// -----------------------------------------------------------
//
// Full teardown plus invalidation: the generation bump and the
// signed-out latch cancel any establish() still in flight, and
// the single-flight guard is cleared so the next connect
// starts a genuinely new attempt with the CURRENT stored
// token. Also the auth-rejection path — see bindInstance.
//
// Used by:
//   - context/AuthContext.tsx — logout
//   - bindInstance (above) — refused handshake
//   - app lifecycle listener (below) — on background
// -----------------------------------------------------------

export function disconnectSocket(): void {
  generation += 1;
  signedOut = true;
  inFlight = null;
  teardownInstance();
  setStatus('disconnected');
}







// -----------------------------------------------------------
// suspendSocket
// -----------------------------------------------------------
//
// Offline gate for the retry loop: once NetInfo says the
// network is gone, every reconnect attempt is a doomed HTTP
// poll that only keeps the radio awake, so the instance is
// disconnected outright — socket.disconnect() tells the
// Manager to skip reconnecting until connectSocket() nudges it
// back on restore or foreground. Unlike disconnectSocket()
// this sets no latch and keeps the instance: the session is
// still valid, only the transport rests.
//
// Used by:
//   - context/NetworkContext.tsx — on connectivity loss
// -----------------------------------------------------------

export function suspendSocket(): void {
  socket?.disconnect();
}







// -----------------------------------------------------------
// App lifecycle
// -----------------------------------------------------------
//
// The socket follows the foreground: backgrounding tears it
// down so the backend sees this user as away and chat pushes
// are not suppressed by a lingering "online" presence;
// foregrounding reconnects (a no-op for guests — establish
// resolves null without a token). 'inactive' (iOS app switcher
// flicker) deliberately does neither.
//
// Used by:
//   - registered once at module load; no exports
// -----------------------------------------------------------

AppState.addEventListener('change', (state) => {
  if (state === 'background') {
    disconnectSocket();
  } else if (state === 'active') {
    void connectSocket();
  }
});







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
// ONLY for real membership removal (deleting/leaving a group
// from the list screen, after the server confirmed it) — the
// chat room screen deliberately never emits this: closing a
// room keeps its live delivery for the conversation list.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — after deleteConversation
// -----------------------------------------------------------

export function leaveConversation(conversationId: string): void {
  socket?.emit('leave_conversation', { conversationId });
}







// -----------------------------------------------------------
// emitTyping
// -----------------------------------------------------------
//
// Rate-limited server-side (20 per 10 s) — callers throttle.
// Volatile: a typing ping is only true the moment it is sent —
// buffering it offline and replaying a burst on reconnect
// would show phantom typing, so it is dropped when down.
//
// Used by:
//   - hooks/chat/useChatComposer — on input change
// -----------------------------------------------------------

export function emitTyping(conversationId: string): void {
  socket?.volatile.emit('typing', { conversationId });
}







// -----------------------------------------------------------
// emitStopTyping
// -----------------------------------------------------------
//
// Volatile like emitTyping — a stale stop is as wrong as a
// stale start, and the server clears typing state on
// disconnect anyway.
//
// Used by:
//   - hooks/chat/useChatComposer — idle timeout / send
// -----------------------------------------------------------

export function emitStopTyping(conversationId: string): void {
  socket?.volatile.emit('stop_typing', { conversationId });
}







// -----------------------------------------------------------
// emitMarkRead
// -----------------------------------------------------------
//
// Socket alternative to the REST mark-read endpoint; the
// backend answers with a messages_read broadcast. Volatile is
// safe here: every call site pairs this with the durable REST
// markConversationRead fallback, and useChatMessages' resync
// re-emits it on each reconnect — so an offline emit can be
// dropped instead of replayed in a burst.
//
// Used by:
//   - hooks/chat/useChatMessages — on viewing new messages
// -----------------------------------------------------------

export function emitMarkRead(conversationId: string): void {
  socket?.volatile.emit('mark_read', { conversationId });
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
// Carries the authoritative reactions array — the same list
// the REST react/unreact responses return; this event is the
// cross-client path.
//
// Used by:
//   - hooks/chat/useChatMessages — apply reaction state
//   - hooks/chat/useChatReactions — epoch guard against a
//     stale REST reconcile
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







// -----------------------------------------------------------
// onMessageDeleted
// -----------------------------------------------------------
//
// Fired when a sender unsends a message — the room swaps the
// body for the "message deleted" placeholder.
//
// Used by:
//   - hooks/chat/useChatMessages — live unsend
// -----------------------------------------------------------

export function onMessageDeleted(listener: Listener<MessageDeletedEvent>): () => void {
  return addListener('message_deleted', listener);
}

// 'message_edited' — the room hears a rewrite; the hook swaps the
// text and stamps editedAt on the row (and on quotes of it)
export function onMessageEdited(listener: Listener<MessageEditedEvent>): () => void {
  return addListener('message_edited', listener);
}
