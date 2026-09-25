// -----------------------------------------------------------
//  [*] chatengine — knf adapter: Socket.IO client
//
//  One Socket.IO connection, authenticated with the session
//  token in the handshake's auth payload — never the query
//  string, which every proxy and access log would see (the
//  backend rejects invalid tokens by returning False from its
//  connect handler; that rejection surfaces here as the
//  'unauthorized' status).
//
//  The connection follows the app lifecycle: backgrounding
//  tears it down (so backend presence means foreground and
//  chat pushes are not suppressed while backgrounded) and
//  foregrounding reconnects. A generation counter plus a
//  signed-out latch let disconnect() invalidate an establish()
//  still awaiting the token read, so a logout can never be
//  overtaken by a socket built for the departing account.
//
//  A cut the SERVER initiated ('io server disconnect') is the
//  one drop socket.io-client never recovers from by itself —
//  it destroys the socket's subscriptions and stops the
//  manager's reconnection loop — so the adapter schedules its
//  own connect() a beat later, unless a disconnect() (logout,
//  background) landed in between. The server cuts a socket
//  when its session is revoked (logout, a password change or
//  logout-all from another device, an admin), but also when
//  another device of the same account evicts it past the
//  per-user cap; a revoked session's reconnect is refused and
//  lands on 'unauthorized' like any dead token, a live one is
//  simply back.
//
//  A handshake the server REFUSED carries its reason: 'busy'
//  (the process-wide socket cap) and 'error' (the post-auth
//  room work threw) mean "try again" and are retried here on
//  a jittered exponential backoff, without the signed-out
//  latch — the instance is retired and rebuilt on the next
//  attempt. 'unauthorized' is the one verdict on the session
//  itself (and any unknown reason reads the same, since legacy
//  servers refuse bad tokens with the stock message): that one
//  tears down for good and lands on 'unauthorized'.
//
//  Listeners live in a registry, not on the socket instance:
//  a single dispatcher per event is bound to each new io()
//  instance, so subscriptions made while the socket is null —
//  or before a token change swapped the instance — keep firing
//  across every reconnect.
//
//  Transport is long-polling only, with upgrades disabled: the
//  backend runs flask-socketio in threading mode without
//  simple-websocket, so a websocket attempt can never succeed.
//
//  Split into:
//
//    KnfSocketOptions / KnfSocketClient — the contract
//    createKnfSocket — the factory (one per app)
// -----------------------------------------------------------

import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import type { RealtimeStatus } from '../../core/transport';
import type {
  ApiConversationUpdatedEvent,
  ApiMessage,
  ApiMessageDeletedEvent,
  ApiMessageEditedEvent,
  ApiMessageUpdatedEvent,
  ApiMessagesReadEvent,
  ApiReactionUpdate,
  ApiStopTypingEvent,
  ApiTypingEvent,
} from './wire';







// -----------------------------------------------------------
// SocketEventName
// -----------------------------------------------------------
//
// Every server event the client can hear, by wire name.
//
// Used by:
//   - SocketEventPayloads / KnfSocketClient (below) — the
//     typed on() surface
//   - FORWARDED_EVENTS (below) — the re-emit list
// -----------------------------------------------------------

export type SocketEventName = 'new_message' | 'reaction_update' | 'user_typing' | 'user_stop_typing' | 'messages_read' | 'message_deleted' | 'message_edited' | 'message_updated' | 'conversation_updated';







// -----------------------------------------------------------
// SocketEventPayloads
// -----------------------------------------------------------
//
// Event name → wire payload, so on() types its listener.
//
// Used by:
//   - KnfSocketClient (below) — on()'s payload type
//   - adapters/knf/index.ts — the event → ChatEvent mapping
// -----------------------------------------------------------

export interface SocketEventPayloads {
  new_message: ApiMessage;
  reaction_update: ApiReactionUpdate;
  user_typing: ApiTypingEvent;
  user_stop_typing: ApiStopTypingEvent;
  messages_read: ApiMessagesReadEvent;
  message_deleted: ApiMessageDeletedEvent;
  message_edited: ApiMessageEditedEvent;
  message_updated: ApiMessageUpdatedEvent;
  conversation_updated: ApiConversationUpdatedEvent;
}

// Every server event the adapter re-emits to its subscribers —
// a socket.io event missing here is silently dropped
const FORWARDED_EVENTS: SocketEventName[] = ['new_message', 'reaction_update', 'user_typing', 'user_stop_typing', 'messages_read', 'message_deleted', 'message_edited', 'message_updated', 'conversation_updated'];

// A server-initiated cut is retried after this pause — long
// enough for a logout-all that is about to wipe the token to
// land its disconnect() first, short enough that a device the
// user never signed out of barely notices
const SERVER_CUT_RECONNECT_MS = 1_000;

// The disconnect reason socket.io-client hands the handler
// when the SERVER closed the socket — the only reason after
// which it will not reconnect on its own
const SERVER_CUT_REASON = 'io server disconnect';

// The handshake refusals the server means as "try again" —
// 'busy' past its process-wide socket cap, 'error' when the
// post-auth room work threw — as opposed to 'unauthorized',
// the one verdict on the session itself
const TRANSIENT_REFUSALS: ReadonlySet<string> = new Set(['busy', 'error']);

// A transient refusal is retried on a jittered exponential
// backoff: the first pause doubles per consecutive refusal up
// to the cap, each shortened by up to a quarter so the clients
// a saturated process refused together do not all knock again
// in the same instant
const REFUSAL_RETRY_BASE_MS = 1_000;
const REFUSAL_RETRY_MAX_MS = 30_000;
const REFUSAL_RETRY_JITTER = 0.25;







// -----------------------------------------------------------
// KnfSocketOptions
// -----------------------------------------------------------
//
// What the factory needs from the host — the URL, the fresh
// token read, and the lifecycle switches.
//
// Used by:
//   - createKnfSocket (below) — the one argument
//   - adapters/knf/index.ts — passed through from the adapter
// -----------------------------------------------------------

export interface KnfSocketOptions {
  // The host root — socket.io lives above the /api prefix
  url: string;
  // The stored session token, read fresh on every establish
  getToken: () => Promise<string | null>;
  // A refused or failed handshake leaves a diagnosable trace
  log?: (scope: string, err: unknown) => void;
  // Tear down on background / reconnect on foreground (default on)
  followAppState?: boolean;
}







// -----------------------------------------------------------
// KnfSocketClient
// -----------------------------------------------------------
//
// The client's surface — lifecycle, status, the typed event
// registry, and the room / volatile emits.
//
// Used by:
//   - createKnfSocket (below) — the return shape
//   - adapters/knf/index.ts — the realtime half drives it
// -----------------------------------------------------------

export interface KnfSocketClient {
  connect(): Promise<Socket | null>;
  disconnect(): void;
  suspend(): void;
  status(): RealtimeStatus;
  onStatus(listener: (status: RealtimeStatus) => void): () => void;
  on<E extends SocketEventName>(event: E, listener: (payload: SocketEventPayloads[E]) => void): () => void;
  emit(event: 'join_conversation' | 'leave_conversation', payload: { conversationId: string }): void;
  emitVolatile(event: 'typing' | 'stop_typing' | 'mark_read', payload: { conversationId: string }): void;
}







// -----------------------------------------------------------
// isServerRejection
// -----------------------------------------------------------
//
// A handshake the SERVER refused arrives as a CONNECT_ERROR
// packet, and socket.io-client copies the packet's payload
// onto the Error's `data` own property — even when empty.
// Engine-level failures never carry one.
//
// Used by:
//   - createKnfSocket (below) — the connect_error triage
// -----------------------------------------------------------

const isServerRejection = (err: Error) => 'data' in err;







// -----------------------------------------------------------
// createKnfSocket
// -----------------------------------------------------------
//
// One live instance per token: connect() coalesces concurrent
// callers, rebuilds when the token changed, and re-checks the
// token after the async build. A server-refused handshake
// stops the reconnection loop and lands on 'unauthorized' —
// unless the refusal reason says 'busy' or 'error' (capacity /
// transient), which read as plain 'disconnected' so the UI
// never claims a live session expired, and are retried by the
// adapter itself on a backoff (see REFUSAL_RETRY_BASE_MS).
//
// Used by:
//   - adapters/knf/index.ts — the realtime half
//   - the host's session / network code (connect on login and
//     restore, disconnect on logout, suspend offline)
// -----------------------------------------------------------

export function createKnfSocket(options: KnfSocketOptions): KnfSocketClient {
  const { url, getToken } = options;
  const log = options.log ?? (() => {});

  let socket: Socket | null = null;
  let currentToken: string | null = null;
  let inFlight: Promise<Socket | null> | null = null;
  let generation = 0;
  let signedOut = false;

  let status: RealtimeStatus = 'disconnected';
  const statusListeners = new Set<(status: RealtimeStatus) => void>();
  const setStatus = (next: RealtimeStatus) => {
    status = next;
    statusListeners.forEach((fn) => {
      try {
        fn(next);
      } catch {
        // A broken subscriber is its own problem
      }
    });
  };

  const registry = new Map<SocketEventName, Set<(payload: never) => void>>();
  const addListener = <E extends SocketEventName>(event: E, listener: (payload: SocketEventPayloads[E]) => void) => {
    let listeners = registry.get(event);
    if (!listeners) {
      listeners = new Set();
      registry.set(event, listeners);
    }
    const entry = listener as (payload: never) => void;
    listeners.add(entry);
    return () => {
      listeners?.delete(entry);
    };
  };

  const teardownInstance = () => {
    if (socket) {
      socket.io.off('reconnect_attempt');
      socket.io.off('reconnect_error');
      socket.io.off('reconnect');
      socket.io.off('reconnect_failed');
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
      currentToken = null;
    }
  };

  // The pending retry, if any — after a server cut, or after a
  // transient refusal
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Consecutive transient refusals — the backoff's exponent;
  // a handshake that succeeds and a disconnect() both zero it
  let refusals = 0;

  const cancelReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  // Retire the live instance: the generation bump makes an
  // establish() still awaiting its token read answer null
  // rather than hand out the torn-down socket, the shared
  // flight is dropped, the io instance goes. NOT a session
  // verdict — the signed-out latch is the caller's to set
  const retireInstance = () => {
    generation += 1;
    inFlight = null;
    teardownInstance();
  };

  // The logout primitive: latch signed-out so nothing rebuilds
  // until an explicit connect() lifts it, and drop any retry
  const disconnect = () => {
    signedOut = true;
    refusals = 0;
    cancelReconnect();
    retireInstance();
    setStatus('disconnected');
  };

  // Try again after a pause, through the same connect() every
  // other trigger uses, unless a disconnect() landed meanwhile
  // — the generation and the signed-out latch say so, and a
  // token wiped by then makes establish() answer null anyway.
  // Two callers: a server cut (socket.io-client will not come
  // back from one on its own) and a transient refusal
  const scheduleReconnect = (delayMs: number) => {
    if (reconnectTimer || signedOut) return;
    const gen = generation;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (signedOut || generation !== gen) return;
      void connect();
    }, delayMs);
  };

  // The n-th consecutive refusal waits base · 2^n, capped, less
  // up to a quarter of jitter
  const refusalDelay = (attempt: number) => {
    const full = Math.min(REFUSAL_RETRY_MAX_MS, REFUSAL_RETRY_BASE_MS * 2 ** attempt);
    return Math.round(full * (1 - REFUSAL_RETRY_JITTER * Math.random()));
  };

  const bindInstance = (instance: Socket) => {
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
    instance.on('connect', () => {
      // A handshake that went through ends the backoff
      refusals = 0;
      setStatus('connected');
    });
    instance.on('disconnect', (reason: string) => {
      setStatus('disconnected');
      // A client-initiated cut, a transport close or a ping
      // timeout either meant to stay down or reconnects on the
      // manager's own loop — only the server's cut needs a hand
      if (reason === SERVER_CUT_REASON) scheduleReconnect(SERVER_CUT_RECONNECT_MS);
    });
    instance.on('connect_error', (err: Error) => {
      log('socket', err);
      if (isServerRejection(err)) {
        // The refusal reason rides err.message. 'busy' (process
        // capacity) and 'error' (a transient handshake failure
        // server-side) are not session verdicts: the instance is
        // retired WITHOUT the signed-out latch, the retryable
        // 'disconnected' face shows meanwhile, and the adapter
        // knocks again on a backoff — a host trigger (focus,
        // foreground, network restore) or a logout landing first
        // supersedes the pending knock. Anything else is the
        // session verdict, 'unauthorized': legacy servers refuse
        // bad tokens with the stock message.
        if (TRANSIENT_REFUSALS.has(err.message)) {
          const attempt = refusals;
          refusals += 1;
          retireInstance();
          setStatus('disconnected');
          scheduleReconnect(refusalDelay(attempt));
          return;
        }
        disconnect();
        setStatus('unauthorized');
        return;
      }
      setStatus('disconnected');
    });
    instance.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    instance.io.on('reconnect_error', () => setStatus('reconnecting'));
    instance.io.on('reconnect', () => setStatus('connected'));
    instance.io.on('reconnect_failed', () => setStatus('disconnected'));
  };

  const establish = async (): Promise<Socket | null> => {
    const gen = generation;
    const token = await getToken();
    if (!token) return null;
    if (signedOut || generation !== gen) return null;

    if (socket && currentToken === token) {
      if (socket.disconnected) {
        setStatus('connecting');
        socket.connect();
      }
      return socket;
    }

    teardownInstance();
    currentToken = token;
    setStatus('connecting');
    const instance = io(url, {
      forceNew: true,
      auth: { token },
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      timeout: 15000,
    });
    bindInstance(instance);
    socket = instance;

    // Hand-off validation: the stored token is still the one the
    // socket was built for and no teardown landed meanwhile
    const latest = await getToken();
    if (latest !== token || signedOut || generation !== gen) {
      teardownInstance();
      setStatus('disconnected');
      return null;
    }
    return instance;
  };

  const connect = (): Promise<Socket | null> => {
    signedOut = false;
    // An explicit attempt supersedes a pending retry — one
    // knock, not two
    cancelReconnect();
    if (inFlight) return inFlight;
    const attempt: Promise<Socket | null> = establish().finally(() => {
      if (inFlight === attempt) inFlight = null;
    });
    inFlight = attempt;
    return attempt;
  };

  if (options.followAppState !== false) {
    AppState.addEventListener('change', (state) => {
      if (state === 'background') disconnect();
      else if (state === 'active') void connect();
    });
  }

  return {
    connect,
    disconnect,
    suspend: () => {
      socket?.disconnect();
    },
    status: () => status,
    onStatus: (listener) => {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
    on: addListener,
    emit: (event, payload) => {
      socket?.emit(event, payload);
    },
    emitVolatile: (event, payload) => {
      socket?.volatile.emit(event, payload);
    },
  };
}
