// -----------------------------------------------------------
//  [*] Tests — the KNF Socket.IO client's lifecycle
//
//  A refused handshake ends in 'unauthorized' and a full
//  teardown; a logout that lands mid-establish wins (the
//  half-built socket is torn down); backgrounding disconnects
//  and foregrounding reconnects; listeners registered while the
//  socket is null fire once an instance exists.
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
    mockInstances[0].fire('connect_error', Object.assign(new Error('bad token'), { data: {} }));
    expect(client.status()).toBe('unauthorized');
    expect(mockInstances[0].disconnected).toBe(true);
    await client.connect();
    mockInstances[1].fire('connect_error', new Error('timeout'));
    expect(client.status()).toBe('disconnected');
    expect(statuses).toContain('connecting');
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
});
