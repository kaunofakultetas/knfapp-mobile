// -----------------------------------------------------------
//  [*] Tests — services/socket lifecycle
//
//  The connect state machine: guests get null, the token rides
//  in the handshake auth payload (NEVER the query string), one
//  flight is shared, a token change rebuilds, a teardown that
//  lands mid-establish wins, a refused handshake goes terminal
//  'unauthorized' while transport errors stay retryable and a
//  'busy' refusal is retried by the adapter itself a beat
//  later, a transport drop rides the manager's own reconnect
//  loop while
//  a cut the SERVER made (the one drop that loop never
//  survives) is reopened by the adapter a beat later, and the
//  registry isolates throwing subscribers.
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
  // A cut the SERVER made ('io server disconnect') is the one
  // drop socket.io-client never recovers from: it stops the
  // manager's reconnection loop, so no manager event fires
  // again until connect() reopens it. The latch keeps the
  // fixture honest about that — a transport drop leaves it
  // clear and the manager's events keep flowing
  let managerDead = false;
  return {
    connected: false,
    disconnected: true,
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    emit: jest.fn(),
    connect: jest.fn(() => {
      managerDead = false;
    }),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    io: {
      on: jest.fn((event: string, fn: () => void) => {
        (managerHandlers[event] ||= []).push(fn);
      }),
      off: jest.fn(),
    },
    fire: (event, payload) => {
      if (event === 'disconnect' && payload === 'io server disconnect') managerDead = true;
      handlers[event]?.forEach((fn) => fn(payload));
    },
    fireManager: (event) => {
      if (managerDead) return;
      managerHandlers[event]?.forEach((fn) => fn());
    },
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
  it('walks connect / transport drop / reconnect transitions', async () => {
    mockTokens.standing = 'tok';
    const seen: string[] = [];
    const off = socketService.onSocketStatusChange((status) => seen.push(status));

    await socketService.connectSocket();
    const { socket } = mockIoCalls[0];
    socket.fire('connect', undefined);
    // A transport drop: the manager's own loop brings it back,
    // the adapter has nothing to do
    socket.fire('disconnect', 'transport close');
    socket.fireManager('reconnect_attempt');
    socket.fireManager('reconnect');

    expect(seen).toEqual(['connecting', 'connected', 'disconnected', 'reconnecting', 'connected']);
    expect(socket.connect).not.toHaveBeenCalled();
    off();
    socket.fire('disconnect', 'transport close');
    expect(seen).toHaveLength(5);
  });

  it('a server cut kills the manager loop — the adapter reopens the socket itself a beat later', async () => {
    jest.useFakeTimers();
    try {
      mockTokens.standing = 'tok';
      const seen: string[] = [];
      socketService.onSocketStatusChange((status) => seen.push(status));

      await socketService.connectSocket();
      const { socket } = mockIoCalls[0];
      socket.fire('connect', undefined);
      socket.fire('disconnect', 'io server disconnect');
      // The manager is dead: its reconnect events never come
      socket.fireManager('reconnect_attempt');
      socket.fireManager('reconnect');
      expect(seen).toEqual(['connecting', 'connected', 'disconnected']);
      expect(socket.connect).not.toHaveBeenCalled();

      // ...until the adapter's own beat (1 s) reopens the SAME
      // instance — same token, so no rebuild
      await jest.advanceTimersByTimeAsync(999);
      expect(socket.connect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(socket.connect).toHaveBeenCalledTimes(1);
      expect(mockIoCalls).toHaveLength(1);
      expect(seen).toEqual(['connecting', 'connected', 'disconnected', 'connecting']);

      // ...and the manager's events are heard again
      socket.fireManager('reconnect');
      expect(seen).toEqual(['connecting', 'connected', 'disconnected', 'connecting', 'connected']);
    } finally {
      jest.useRealTimers();
    }
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

  it("a 'busy' refusal is retried by the adapter a beat later — the retryable face meanwhile, never 'unauthorized'", async () => {
    jest.useFakeTimers();
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      mockTokens.standing = 'tok';
      await socketService.connectSocket();
      const { socket } = mockIoCalls[0];

      socket.fire('connect_error', Object.assign(new Error('busy'), { data: undefined }));
      expect(socketService.getSocketStatus()).toBe('disconnected');
      expect(socket.disconnect).toHaveBeenCalled();

      // The first pause is 1 s; a NEW instance for the same
      // token knocks again after it, with no help from the host
      await jest.advanceTimersByTimeAsync(999);
      await Promise.resolve();
      expect(mockIoCalls).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(1);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(mockIoCalls).toHaveLength(2);
      expect(mockIoCalls[1].opts.auth).toEqual({ token: 'tok' });
      expect(socketService.getSocketStatus()).toBe('connecting');
    } finally {
      random.mockRestore();
      jest.useRealTimers();
    }
  });
});


describe('startup with several connect triggers (the seeded-sandbox race)', () => {
  it('a second connectSocket() during the first handshake sends no duplicate CONNECT', async () => {
    mockTokens.standing = 'tok';
    await socketService.connectSocket();
    const { socket } = mockIoCalls[0];
    // socket.io-client's view mid-handshake: subscribed, not yet
    // connected — `disconnected` alone once read as "idle"
    (socket as FakeSocket & { active?: boolean }).active = true;

    // Auth restore, the unread badge, a network restore — all
    // at startup, before the server has answered
    await socketService.connectSocket();
    await socketService.connectSocket();
    expect(socket.connect).not.toHaveBeenCalled();
    expect(mockIoCalls).toHaveLength(1);
  });

  it('an empty-message refusal (the duplicate CONNECT answer) is retried — never the session-expired face', async () => {
    jest.useFakeTimers();
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      mockTokens.standing = 'tok';
      await socketService.connectSocket();
      mockIoCalls[0].socket.fire('connect_error', Object.assign(new Error(''), { data: 'Unable to connect' }));
      expect(socketService.getSocketStatus()).toBe('disconnected');

      await jest.advanceTimersByTimeAsync(1_000);
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      expect(mockIoCalls).toHaveLength(2);
    } finally {
      random.mockRestore();
      jest.useRealTimers();
    }
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
