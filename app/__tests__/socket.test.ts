// -----------------------------------------------------------
//  [*] Tests — services/socket
//
//  The registry guarantee: a subscription made before connect,
//  or before a token change swapped the instance, keeps
//  firing. This is the bug that used to silently kill live
//  chat after any reconnect.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type Handler = (payload: unknown) => void;

// A socket.io-client stand-in that records handlers and can
// fire server events on demand
function mockFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
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
    io: { on: jest.fn(), off: jest.fn() },
    fire: (event: string, payload: unknown) => handlers[event]?.forEach((fn) => fn(payload)),
  };
}

jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockFakeSocket()) }));


describe('socket registry', () => {
  beforeEach(() => jest.resetModules());

  it('resolves null for guests', async () => {
    const socket = require('@/services/socket');
    await expect(socket.connectSocket()).resolves.toBeNull();
  });

  it('keeps subscriptions across connect and token change', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    const { io } = require('socket.io-client');
    const socket = require('@/services/socket');
    const listener = jest.fn();

    // Subscribed before any socket exists
    const unsubscribe = socket.onNewMessage(listener);

    await AsyncStorage.setItem('auth', JSON.stringify({ token: 'tok-1' }));
    const first = await socket.connectSocket();
    first.fire('new_message', { id: 'm1' });
    expect(listener).toHaveBeenCalledWith({ id: 'm1' });

    // Same token → same instance, no rebuild
    expect(await socket.connectSocket()).toBe(first);
    expect(io).toHaveBeenCalledTimes(1);

    // New token → fresh instance, registry still wired
    await AsyncStorage.setItem('auth', JSON.stringify({ token: 'tok-2' }));
    const second = await socket.connectSocket();
    expect(second).not.toBe(first);
    expect(first.removeAllListeners).toHaveBeenCalled();
    second.fire('new_message', { id: 'm2' });
    expect(listener).toHaveBeenCalledWith({ id: 'm2' });

    unsubscribe();
    second.fire('new_message', { id: 'm3' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
