// -----------------------------------------------------------
//  [*] Tests — services/socket lifecycle
//
//  The connect state machine: guests get null, the token rides
//  in the handshake auth payload (NEVER the query string), one
//  flight is shared, a token change rebuilds, a teardown that
//  lands mid-establish wins, a refused handshake goes terminal
//  'unauthorized' while transport errors stay retryable, and
//  the registry isolates throwing subscribers.
// -----------------------------------------------------------

type Handler = (payload: unknown) => void;

interface FakeSocket {
  connected: boolean;
  disconnected: boolean;
  on: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  disconnect: jest.Mock;
  removeAllListeners: jest.Mock;
  io: { on: jest.Mock; off: jest.Mock };
  fire: (event: string, payload: unknown) => void;
  fireManager: (event: string) => void;
}

function mockMakeFakeSocket(): FakeSocket {
  const handlers: Record<string, Handler[]> = {};
  const managerHandlers: Record<string, (() => void)[]> = {};
  return {
    connected: false,
    disconnected: true,
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    io: {
      on: jest.fn((event: string, fn: () => void) => {
        (managerHandlers[event] ||= []).push(fn);
      }),
      off: jest.fn(),
    },
    fire: (event, payload) => handlers[event]?.forEach((fn) => fn(payload)),
    fireManager: (event) => managerHandlers[event]?.forEach((fn) => fn()),
  };
}

const mockIoCalls: { url: string; opts: Record<string, unknown>; socket: FakeSocket }[] = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn((url: string, opts: Record<string, unknown>) => {
    const socket = mockMakeFakeSocket();
    mockIoCalls.push({ url, opts, socket });
    return socket;
  }),
}));

// Controllable token source — each getStoredToken() call takes
// the next queued value (or the standing one)
const mockTokens: { queue: (string | null)[]; standing: string | null } = {
  queue: [],
  standing: null,
};
jest.mock('@/services/session', () => ({
  getStoredToken: async () => {
    if (mockTokens.queue.length > 0) return mockTokens.queue.shift()!;
    return mockTokens.standing;
  },
  getStoredUser: async () => null,
  setStoredSession: async () => {},
  clearStoredSession: async () => {},
}));

jest.mock('@/services/log', () => ({ logError: jest.fn() }));

import { AppState } from 'react-native';


type SocketModule = typeof import('@/services/socket');
let socketService: SocketModule;
let appStateCb: ((state: string) => void) | null = null;

beforeEach(() => {
  jest.resetModules();
  mockIoCalls.length = 0;
  mockTokens.queue = [];
  mockTokens.standing = null;
  appStateCb = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    cb: (state: string) => void,
  ) => {
    appStateCb = cb;
    return { remove: jest.fn() } as never;
  }) as never);
  socketService = require('@/services/socket');
});

afterEach(() => {
  jest.restoreAllMocks();
});


describe('connectSocket', () => {
  it('resolves null for guests and stays disconnected', async () => {
    await expect(socketService.connectSocket()).resolves.toBeNull();
    expect(mockIoCalls).toHaveLength(0);
    expect(socketService.getSocketStatus()).toBe('disconnected');
  });

  it('sends the token in the auth payload, never the query string', async () => {
    mockTokens.standing = 'secret-token';
    await socketService.connectSocket();

    expect(mockIoCalls).toHaveLength(1);
    const { opts } = mockIoCalls[0];
    expect(opts.auth).toEqual({ token: 'secret-token' });
    expect(opts.query).toBeUndefined();
    expect(opts.transports).toEqual(['polling']);
    expect(opts.forceNew).toBe(true);
  });

  it('shares one in-flight attempt between concurrent callers', async () => {
    mockTokens.standing = 'tok';
    const [a, b] = await Promise.all([
      socketService.connectSocket(),
      socketService.connectSocket(),
    ]);
    expect(a).toBe(b);
    expect(mockIoCalls).toHaveLength(1);
  });

  it('reuses the instance for the same token, rebuilds for a new one', async () => {
    mockTokens.standing = 'tok-A';
    const first = await socketService.connectSocket();
    expect(await socketService.connectSocket()).toBe(first);
    expect(mockIoCalls).toHaveLength(1);

    mockTokens.standing = 'tok-B';
    const second = await socketService.connectSocket();
    expect(second).not.toBe(first);
    expect(mockIoCalls).toHaveLength(2);
    expect(mockIoCalls[0].socket.removeAllListeners).toHaveBeenCalled();
    expect(mockIoCalls[1].opts.auth).toEqual({ token: 'tok-B' });
  });

  it('refuses the hand-off when the token changed mid-establish', async () => {
    // First read builds for tok-A; the validation re-read sees
    // tok-B — the half-built socket must be torn down
    mockTokens.queue = ['tok-A', 'tok-B'];
    const result = await socketService.connectSocket();
    expect(result).toBeNull();
    expect(mockIoCalls[0].socket.disconnect).toHaveBeenCalled();
    expect(socketService.getSocketStatus()).toBe('disconnected');
  });

  it('lets a disconnect that lands mid-establish win', async () => {
    mockTokens.standing = 'tok';
    const pending = socketService.connectSocket();
    socketService.disconnectSocket();
    await expect(pending).resolves.toBeNull();
    expect(socketService.getSocketStatus()).toBe('disconnected');
  });

  it('an explicit connect lifts the signed-out latch', async () => {
    mockTokens.standing = 'tok';
    socketService.disconnectSocket();
    const again = await socketService.connectSocket();
    expect(again).not.toBeNull();
  });
});


describe('status machine', () => {
  it('walks connect / disconnect / reconnect transitions', async () => {
    mockTokens.standing = 'tok';
    const seen: string[] = [];
    const off = socketService.onSocketStatusChange((status) => seen.push(status));

    await socketService.connectSocket();
    const { socket } = mockIoCalls[0];
    socket.fire('connect', undefined);
    socket.fire('disconnect', undefined);
    socket.fireManager('reconnect_attempt');
    socket.fireManager('reconnect');

    expect(seen).toEqual(['connecting', 'connected', 'disconnected', 'reconnecting', 'connected']);
    off();
    socket.fire('disconnect', undefined);
    expect(seen).toHaveLength(5);
  });

  it('classifies a server rejection as terminal unauthorized with a full teardown', async () => {
    mockTokens.standing = 'dead-tok';
    await socketService.connectSocket();
    const { socket } = mockIoCalls[0];

    const rejection = Object.assign(new Error('unauthorized'), { data: 'Invalid session' });
    socket.fire('connect_error', rejection);

    expect(socketService.getSocketStatus()).toBe('unauthorized');
    expect(socket.disconnect).toHaveBeenCalled();

    // The next explicit connect starts clean with the current token
    mockTokens.standing = 'fresh-tok';
    await socketService.connectSocket();
    expect(mockIoCalls).toHaveLength(2);
    expect(mockIoCalls[1].opts.auth).toEqual({ token: 'fresh-tok' });
  });

  it('keeps a transport error retryable — no teardown, status disconnected', async () => {
    mockTokens.standing = 'tok';
    const instance = await socketService.connectSocket();
    const { socket } = mockIoCalls[0];

    socket.fire('connect_error', new Error('xhr poll error'));
    expect(socketService.getSocketStatus()).toBe('disconnected');
    expect(socket.disconnect).not.toHaveBeenCalled();

    // Same token afterwards still reuses the same instance
    expect(await socketService.connectSocket()).toBe(instance);
    expect(mockIoCalls).toHaveLength(1);
  });
});


describe('registry and emits', () => {
  it('isolates a throwing subscriber from later ones', async () => {
    mockTokens.standing = 'tok';
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    socketService.onNewMessage(bad);
    socketService.onNewMessage(good);

    await socketService.connectSocket();
    mockIoCalls[0].socket.fire('new_message', { id: 'm1' });

    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('emit helpers are safe with no socket', () => {
    expect(() => {
      socketService.joinConversation('c1');
      socketService.emitTyping('c1');
      socketService.emitStopTyping('c1');
      socketService.emitMarkRead('c1');
    }).not.toThrow();
  });

  it('suspendSocket rests the transport without dropping the instance', async () => {
    mockTokens.standing = 'tok';
    const instance = await socketService.connectSocket();
    const { socket } = mockIoCalls[0];

    socketService.suspendSocket();
    expect(socket.disconnect).toHaveBeenCalled();

    // The instance survives — the next connect nudges it, no rebuild
    expect(await socketService.connectSocket()).toBe(instance);
    expect(mockIoCalls).toHaveLength(1);
    expect(socket.connect).toHaveBeenCalled();
  });
});


describe('app lifecycle', () => {
  it('tears down on background and reconnects on foreground', async () => {
    mockTokens.standing = 'tok';
    await socketService.connectSocket();
    const first = mockIoCalls[0].socket;

    appStateCb?.('background');
    expect(first.disconnect).toHaveBeenCalled();
    expect(socketService.getSocketStatus()).toBe('disconnected');

    appStateCb?.('active');
    // The foreground connect is fire-and-forget — settle it
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockIoCalls).toHaveLength(2);
  });

  it('ignores the iOS app-switcher inactive flicker', async () => {
    mockTokens.standing = 'tok';
    await socketService.connectSocket();
    const first = mockIoCalls[0].socket;

    appStateCb?.('inactive');
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(mockIoCalls).toHaveLength(1);
  });
});
