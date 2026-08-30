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


export type SocketEventName = 'new_message' | 'reaction_update' | 'user_typing' | 'user_stop_typing' | 'messages_read' | 'message_deleted' | 'message_edited' | 'message_updated' | 'conversation_updated';

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

const FORWARDED_EVENTS: SocketEventName[] = ['new_message', 'reaction_update', 'user_typing', 'user_stop_typing', 'messages_read', 'message_deleted', 'message_edited', 'message_updated', 'conversation_updated'];


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


// A handshake the SERVER refused arrives as a CONNECT_ERROR
// packet, and socket.io-client copies the packet's payload onto
// the Error's `data` own property — even when empty. Engine-
// level failures never carry one
const isServerRejection = (err: Error) => 'data' in err;







// -----------------------------------------------------------
// createKnfSocket
// -----------------------------------------------------------
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

  const disconnect = () => {
    generation += 1;
    signedOut = true;
    inFlight = null;
    teardownInstance();
    setStatus('disconnected');
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
    instance.on('connect', () => setStatus('connected'));
    instance.on('disconnect', () => setStatus('disconnected'));
    instance.on('connect_error', (err: Error) => {
      log('socket', err);
      if (isServerRejection(err)) {
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
