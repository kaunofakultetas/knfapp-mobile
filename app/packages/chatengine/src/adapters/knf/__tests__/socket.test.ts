// -----------------------------------------------------------
//  [*] Tests — the KNF Socket.IO client's lifecycle
//
//  A refused handshake ends in 'unauthorized' and a full
//  teardown; a logout that lands mid-establish wins (the
//  half-built socket is torn down); backgrounding disconnects
//  and foregrounding reconnects; listeners registered while the
//  socket is null fire once an instance exists; a cut the
//  SERVER made is retried a beat later (socket.io-client never
//  does that itself) while a client-made one is left alone and
//  a logout inside the beat cancels the retry; a 'busy' or
//  'error' refusal — the server's "try again" — is retried on
//  a 1 s → 30 s backoff that a successful handshake resets and
//  an explicit connect() or disconnect() supersedes, while
//  'unauthorized' stays terminal.
// -----------------------------------------------------------

const mockInstances: MockSocket[] = [];
class MockSocket {
  handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  io = { handlers: new Map<string, (...a: unknown[]) => void>(), on: (e: string, fn: (...a: unknown[]) => void) => { this.io.handlers.set(e, fn); }, off: jest.fn() };
  disconnected = false;
  emitted: [string, unknown][] = [];
  volatile = { emit: (e: string, p: unknown) => this.emitted.push([`volatile:${e}`, p]) };
  constructor(public url: string, public opts: { auth: { token: string } }) {
    mockInstances.push(this);
  }
  on(event: string, fn: (...a: unknown[]) => void) {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
  }
  fire(event: string, ...args: unknown[]) {
    (this.handlers.get(event) ?? []).forEach((fn) => fn(...args));
  }
  emit(e: string, p: unknown) {
    this.emitted.push([e, p]);
  }
  connect() {
    this.disconnected = false;
  }
  disconnect() {
    this.disconnected = true;
  }
  removeAllListeners() {
    this.handlers.clear();
  }
}
jest.mock('socket.io-client', () => ({ io: (url: string, opts: { auth: { token: string } }) => new MockSocket(url, opts) }));

import { AppState } from 'react-native';

import { createKnfSocket } from '../socket';

const later = () => new Promise<void>((r) => setTimeout(r, 0));

describe('createKnfSocket', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  it('connects with the stored token in the handshake auth and answers the same instance for the same token', async () => {
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    const a = await client.connect();
    const b = await client.connect();
    expect(a).toBe(b);
    expect(mockInstances).toHaveLength(1);
    expect(mockInstances[0].opts.auth).toEqual({ token: 'tok' });
    mockInstances[0].fire('connect');
    expect(client.status()).toBe('connected');
  });

  it('a server rejection ends in unauthorized and a teardown; a transport error stays disconnected', async () => {
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    const statuses: string[] = [];
    client.onStatus((s) => statuses.push(s));
    await client.connect();
    // The session verdict is the explicit reason the backend
    // sends. This case once used a free-form 'bad token' and
    // pinned that ANY refusal meant an expired session — the
    // rule that turned the server library's "Unable to connect"
    // (an empty message here) into dead realtime; unknown
    // reasons now retry (see the refusal cases below)
    mockInstances[0].fire('connect_error', Object.assign(new Error('unauthorized'), { data: {} }));
    expect(client.status()).toBe('unauthorized');
    expect(mockInstances[0].disconnected).toBe(true);
    await client.connect();
    mockInstances[1].fire('connect_error', new Error('timeout'));
    expect(client.status()).toBe('disconnected');
    expect(statuses).toContain('connecting');
  });

  it("a 'busy' or 'error' refusal is a capacity verdict, never a session one — disconnected, not unauthorized", async () => {
    // The server evicts past the per-user cap now, but the
    // process cap ('busy') and a transient handshake failure
    // ('error') still refuse — telling a freshly logged-in user
    // their session expired over those was the conversations-list
    // banner bug
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    await client.connect();
    mockInstances[0].fire('connect_error', Object.assign(new Error('busy'), { data: undefined }));
    expect(client.status()).toBe('disconnected');
    expect(mockInstances[0].disconnected).toBe(true);

    await client.connect();
    mockInstances[1].fire('connect_error', Object.assign(new Error('error'), { data: undefined }));
    expect(client.status()).toBe('disconnected');

    // An explicit 'unauthorized' reason still lands on the
    // session-expired face
    await client.connect();
    mockInstances[2].fire('connect_error', Object.assign(new Error('unauthorized'), { data: undefined }));
    expect(client.status()).toBe('unauthorized');
  });

  it('a logout landing mid-establish wins over the half-built socket', async () => {
    let release: (t: string | null) => void = () => {};
    const client = createKnfSocket({ url: 'http://host', getToken: () => new Promise((r) => (release = r)), followAppState: false });
    const pending = client.connect();
    client.disconnect();
    release('tok');
    expect(await pending).toBeNull();
    expect(client.status()).toBe('disconnected');
  });

  it('a guest gets no socket; listeners registered before connect fire once it exists', async () => {
    const guest = createKnfSocket({ url: 'http://host', getToken: async () => null, followAppState: false });
    expect(await guest.connect()).toBeNull();
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    const seen: unknown[] = [];
    const off = client.on('message_deleted', (p) => seen.push(p));
    await client.connect();
    mockInstances[mockInstances.length - 1].fire('message_deleted', { conversationId: 'c', messageId: 'm' });
    expect(seen).toEqual([{ conversationId: 'c', messageId: 'm' }]);
    off();
    mockInstances[mockInstances.length - 1].fire('message_deleted', { conversationId: 'c', messageId: 'm2' });
    expect(seen).toHaveLength(1);
    client.emit('join_conversation', { conversationId: 'c' });
    client.emitVolatile('typing', { conversationId: 'c' });
    expect(mockInstances[mockInstances.length - 1].emitted).toEqual([['join_conversation', { conversationId: 'c' }], ['volatile:typing', { conversationId: 'c' }]]);
  });

  it('follows the app state: background tears down, active reconnects', async () => {
    const handlers: ((s: string) => void)[] = [];
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation(((event: string, cb: (s: string) => void) => {
      handlers.push(cb);
      return { remove: jest.fn() } as never;
    }) as never);
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok' });
    await client.connect();
    handlers.forEach((h) => h('background'));
    expect(client.status()).toBe('disconnected');
    handlers.forEach((h) => h('active'));
    await later();
    expect(mockInstances.length).toBeGreaterThanOrEqual(2);
    add.mockRestore();
  });

  it('a server-initiated cut reconnects on its own after a beat; a client-initiated one does not', async () => {
    // socket.io-client destroys the socket on 'io server
    // disconnect' and never retries — the device the user never
    // signed out of used to lose realtime until backgrounded,
    // a network blink or a banner tap
    jest.useFakeTimers();
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      const instance = mockInstances[0];
      const reopen = jest.spyOn(instance, 'connect');

      instance.disconnected = true;
      instance.fire('disconnect', 'io server disconnect');
      expect(client.status()).toBe('disconnected');
      expect(reopen).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
      // Same token → the same instance is reopened, no rebuild
      expect(reopen).toHaveBeenCalledTimes(1);
      expect(mockInstances).toHaveLength(1);
      expect(client.status()).toBe('connecting');

      // A cut the client asked for stays down
      reopen.mockClear();
      instance.disconnected = true;
      instance.fire('disconnect', 'io client disconnect');
      await jest.advanceTimersByTimeAsync(5_000);
      expect(reopen).not.toHaveBeenCalled();
      expect(client.status()).toBe('disconnected');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a logout landing inside the reconnect beat cancels it', async () => {
    jest.useFakeTimers();
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      const instance = mockInstances[0];
      instance.disconnected = true;
      instance.fire('disconnect', 'io server disconnect');
      client.disconnect();

      await jest.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
      // Nothing rebuilt, nothing reopened: the departing account
      // gets no socket back
      expect(mockInstances).toHaveLength(1);
      expect(instance.disconnected).toBe(true);
      expect(client.status()).toBe('disconnected');
    } finally {
      jest.useRealTimers();
    }
  });

  // The backoff's own microtasks: the retry's connect() awaits
  // the token read before it builds the next instance
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  const refusal = (reason: string) => Object.assign(new Error(reason), { data: undefined });

  it("a 'busy' or 'error' refusal is retried on a backoff — 1 s doubling to a 30 s cap — that a successful handshake resets", async () => {
    // The backend raises these two to mean "try again" (its
    // process cap, a transient failure in the handshake's room
    // work); nothing in the host retries them, so the adapter
    // must — and never with the signed-out latch, which would
    // kill its own retry
    jest.useFakeTimers();
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      expect(mockInstances).toHaveLength(1);

      const pauses = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000];
      for (const [i, pause] of pauses.entries()) {
        mockInstances[i].fire('connect_error', refusal(i % 2 === 0 ? 'busy' : 'error'));
        // The retryable face, the refused instance torn down
        expect(client.status()).toBe('disconnected');
        expect(mockInstances[i].disconnected).toBe(true);

        await jest.advanceTimersByTimeAsync(pause - 1);
        await settle();
        expect(mockInstances).toHaveLength(i + 1);
        await jest.advanceTimersByTimeAsync(1);
        await settle();
        // A fresh instance for the same token, knocking again
        expect(mockInstances).toHaveLength(i + 2);
        expect(mockInstances[i + 1].opts.auth).toEqual({ token: 'tok' });
        expect(client.status()).toBe('connecting');
      }

      // The handshake that goes through ends the backoff: the
      // next refusal waits the base pause again, not the cap
      const live = mockInstances[mockInstances.length - 1];
      live.fire('connect');
      expect(client.status()).toBe('connected');
      live.fire('connect_error', refusal('busy'));
      const built = mockInstances.length;
      await jest.advanceTimersByTimeAsync(1_000);
      await settle();
      expect(mockInstances).toHaveLength(built + 1);
    } finally {
      random.mockRestore();
      jest.useRealTimers();
    }
  });

  it('the jitter only shortens the pause — never past the base, never over the cap', async () => {
    jest.useFakeTimers();
    // Full jitter: a quarter off every pause
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      mockInstances[0].fire('connect_error', refusal('busy'));
      await jest.advanceTimersByTimeAsync(749);
      await settle();
      expect(mockInstances).toHaveLength(1);
      await jest.advanceTimersByTimeAsync(251);
      await settle();
      expect(mockInstances).toHaveLength(2);
    } finally {
      random.mockRestore();
      jest.useRealTimers();
    }
  });

  it('a logout or background inside the retry window cancels it', async () => {
    jest.useFakeTimers();
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      mockInstances[0].fire('connect_error', refusal('busy'));
      client.disconnect();

      await jest.advanceTimersByTimeAsync(60_000);
      await settle();
      expect(mockInstances).toHaveLength(1);
      expect(client.status()).toBe('disconnected');
    } finally {
      jest.useRealTimers();
    }
  });

  it('an explicit connect() inside the retry window supersedes it — one knock, not two', async () => {
    jest.useFakeTimers();
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      mockInstances[0].fire('connect_error', refusal('busy'));

      // A host trigger (focus, foreground, network restore)
      await client.connect();
      expect(mockInstances).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(60_000);
      await settle();
      expect(mockInstances).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("an 'unauthorized' refusal stays terminal — no retry is ever scheduled", async () => {
    jest.useFakeTimers();
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      mockInstances[0].fire('connect_error', refusal('unauthorized'));
      expect(client.status()).toBe('unauthorized');

      await jest.advanceTimersByTimeAsync(60_000);
      await settle();
      expect(mockInstances).toHaveLength(1);
      expect(client.status()).toBe('unauthorized');
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['an empty reason — python-socketio\'s "Unable to connect" arrives as one', ''],
    ['the server library\'s own wording', 'Unable to connect'],
    ['any reason the backend never publishes', 'bad token'],
  ])('%s is retried like "try again", never painted as an expired session', async (_label, reason) => {
    jest.useFakeTimers();
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
      await client.connect();
      mockInstances[0].fire('connect_error', Object.assign(new Error(reason), { data: {} }));
      expect(client.status()).toBe('disconnected');
      expect(mockInstances[0].disconnected).toBe(true);

      await jest.advanceTimersByTimeAsync(1_000);
      await settle();
      expect(mockInstances).toHaveLength(2);
      expect(client.status()).toBe('connecting');
    } finally {
      random.mockRestore();
      jest.useRealTimers();
    }
  });
});


describe('one handshake at a time', () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  // socket.io-client's own flag: true from connect() until a
  // suspend, a server cut or a client disconnect retires the
  // socket — the fixture models it on the instance under test
  const activate = (instance: MockSocket) => {
    (instance as MockSocket & { active: boolean }).active = true;
    return jest.spyOn(instance, 'connect');
  };

  it('a second connect() while the first handshake is still in flight sends no second CONNECT', async () => {
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    await client.connect();
    const reopen = activate(mockInstances[0]);
    // `disconnected` reads true for the whole handshake — the
    // old guard re-opened on it and the server refused the
    // duplicate, destroying the live socket
    mockInstances[0].disconnected = true;

    await client.connect();
    await client.connect();
    expect(reopen).not.toHaveBeenCalled();
    expect(mockInstances).toHaveLength(1);
    expect(client.status()).toBe('connecting');

    // ...nor while the manager is reconnecting on its own
    mockInstances[0].io.handlers.get('reconnect_attempt')?.();
    await client.connect();
    expect(reopen).not.toHaveBeenCalled();
  });

  it('an instance a suspend retired IS re-opened — the same one, no rebuild', async () => {
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    await client.connect();
    const reopen = activate(mockInstances[0]);
    mockInstances[0].fire('connect');

    client.suspend();
    (mockInstances[0] as MockSocket & { active: boolean }).active = false;
    await client.connect();
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(mockInstances).toHaveLength(1);
  });

  it('a manager that gave up (reconnect_failed) is re-opened by the next connect()', async () => {
    const client = createKnfSocket({ url: 'http://host', getToken: async () => 'tok', followAppState: false });
    await client.connect();
    const reopen = activate(mockInstances[0]);
    mockInstances[0].disconnected = true;

    // Still subscribed (active), but nothing is under way any more
    mockInstances[0].io.handlers.get('reconnect_failed')?.();
    expect(client.status()).toBe('disconnected');
    await client.connect();
    expect(reopen).toHaveBeenCalledTimes(1);
    expect(client.status()).toBe('connecting');
  });
});
