// -----------------------------------------------------------
//  [*] Tests — AuthContext session rules
//
//  The load-bearing rule: only a 401/403 means the stored
//  token is dead. Anything else — offline, timeout, 5xx —
//  says nothing about the session and must NOT log the user
//  out. Plus the reducer's LOGOUT reset, which is what every
//  session drop ultimately runs through, and the storage
//  module's own two rules against the real services/session:
//  a keychain read that throws is reported apart from "nothing
//  stored" and leaves the token in place for the next read,
//  and a keychain write that throws never leaves the token
//  cached as if it had landed.
// -----------------------------------------------------------

import { authReducer, isAuthRejection } from '@/context/AuthContext';
import { ApiError } from '@/services/api/client';
import type { AuthState, User } from '@/types';


// jest.mock is hoisted above the imports at transform time, so
// the factories below still intercept AuthContext's module graph
// — they follow the imports here only so the imports read first
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the shipped mock
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'en', t: (key: string) => key },
}));
jest.mock('@/services/session', () => ({
  getStoredToken: jest.fn(async () => null),
  readStoredToken: jest.fn(async () => ({ ok: true, token: null })),
  getStoredUser: jest.fn(async () => null),
  setStoredSession: jest.fn(),
  clearStoredSession: jest.fn(),
}));
// A keychain stand-in for the storage-level rules: a map the
// tests can make throw on the next read or write, the way a
// locked or hiccuping keychain does
const mockKeychain = {
  items: new Map<string, string>(),
  failNextRead: false,
  failNextWrite: false,
};
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => {
    if (mockKeychain.failNextRead) {
      mockKeychain.failNextRead = false;
      throw new Error('keychain unavailable');
    }
    return mockKeychain.items.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (mockKeychain.failNextWrite) {
      mockKeychain.failNextWrite = false;
      throw new Error('keychain write failed');
    }
    mockKeychain.items.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.items.delete(key);
  }),
}));
jest.mock('@/services/socket', () => ({ connectSocket: jest.fn(), disconnectSocket: jest.fn() }));
jest.mock('@/services/notifyEngine', () => ({
  notifyEngine: { register: jest.fn(), detach: jest.fn() },
  readyNotifyEngine: jest.fn(),
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({ dismissAllNotificationsAsync: jest.fn() }));


const http = (status: number) => new ApiError('failed', status, 'http');


describe('isAuthRejection', () => {
  it('treats 401 and 403 as a dead session', () => {
    expect(isAuthRejection(http(401))).toBe(true);
    expect(isAuthRejection(http(403))).toBe(true);
  });

  it('keeps the session on server errors, timeouts and offline', () => {
    expect(isAuthRejection(http(500))).toBe(false);
    expect(isAuthRejection(new ApiError('timeout', 0, 'timeout'))).toBe(false);
    expect(isAuthRejection(new ApiError('offline', 0, 'network'))).toBe(false);
  });

  it('ignores non-ApiError failures', () => {
    expect(isAuthRejection(new Error('boom'))).toBe(false);
    expect(isAuthRejection(undefined)).toBe(false);
  });
});


describe('authReducer', () => {
  const user: User = {
    id: 'u1',
    username: 'jonas',
    email: 'jonas@knf.vu.lt',
    displayName: 'Jonas',
    role: 'student',
  };
  const guest: AuthState = { isAuthenticated: false, user: null, token: null, loading: false };

  it('resets to the guest state on LOGOUT', () => {
    const loggedIn = authReducer(guest, { type: 'LOGIN_SUCCESS', payload: { user, token: 'tok' } });
    expect(loggedIn.isAuthenticated).toBe(true);
    expect(authReducer(loggedIn, { type: 'LOGOUT' })).toEqual(guest);
  });

  it('keeps a live session through a failed re-login attempt', () => {
    const loggedIn = authReducer(guest, { type: 'LOGIN_SUCCESS', payload: { user, token: 'tok' } });
    const afterFailure = authReducer(authReducer(loggedIn, { type: 'LOGIN_START' }), { type: 'LOGIN_FAILURE' });
    expect(afterFailure.isAuthenticated).toBe(true);
    expect(afterFailure.token).toBe('tok');
    expect(afterFailure.loading).toBe(false);
  });
});


// The REAL storage module, fresh per test (its token cache is
// module state) — the module-level mock above serves the
// AuthContext import only
type SessionModule = typeof import('@/services/session');
const loadRealSession = (): SessionModule => {
  let session: SessionModule | undefined;
  jest.isolateModules(() => {
    session = jest.requireActual<SessionModule>('@/services/session');
  });
  return session as SessionModule;
};

const storedUser: User = {
  id: 'u1',
  username: 'jonas',
  email: 'jonas@knf.vu.lt',
  displayName: 'Jonas',
  role: 'student',
};


describe('readStoredToken', () => {
  beforeEach(() => {
    mockKeychain.items.clear();
    mockKeychain.failNextRead = false;
    mockKeychain.failNextWrite = false;
  });

  it('reports a failed keychain read apart from an empty one and leaves the token in place', async () => {
    mockKeychain.items.set('auth.token', 'tok');
    const session = loadRealSession();

    mockKeychain.failNextRead = true;
    await expect(session.readStoredToken()).resolves.toEqual({ ok: false, token: null });
    expect(mockKeychain.items.get('auth.token')).toBe('tok');

    // Nothing was cached from the failure — the next read hits
    // the store again and recovers the session
    await expect(session.readStoredToken()).resolves.toEqual({ ok: true, token: 'tok' });
    await expect(session.getStoredToken()).resolves.toBe('tok');
  });

  it('answers ok with null for a guest device', async () => {
    const session = loadRealSession();
    await expect(session.readStoredToken()).resolves.toEqual({ ok: true, token: null });
  });

  it('getStoredToken keeps its contract: null on a failed read, without caching the miss', async () => {
    mockKeychain.items.set('auth.token', 'tok');
    const session = loadRealSession();

    mockKeychain.failNextRead = true;
    await expect(session.getStoredToken()).resolves.toBeNull();
    await expect(session.getStoredToken()).resolves.toBe('tok');
  });
});


describe('setStoredSession', () => {
  beforeEach(() => {
    mockKeychain.items.clear();
    mockKeychain.failNextRead = false;
    mockKeychain.failNextWrite = false;
  });

  it('rolls the token cache back when the keychain write fails', async () => {
    const session = loadRealSession();
    // A guest device: the cache already holds null from a read
    await expect(session.getStoredToken()).resolves.toBeNull();

    mockKeychain.failNextWrite = true;
    await expect(session.setStoredSession('tok', storedUser)).rejects.toThrow('keychain write failed');

    // The api/socket layers must not keep answering a token the
    // store never took
    await expect(session.getStoredToken()).resolves.toBeNull();
    expect(mockKeychain.items.has('auth.token')).toBe(false);
  });

  it('keeps the previous session\'s token cached when a refresh write fails', async () => {
    mockKeychain.items.set('auth.token', 'tok-old');
    const session = loadRealSession();
    await expect(session.getStoredToken()).resolves.toBe('tok-old');

    mockKeychain.failNextWrite = true;
    await expect(session.setStoredSession('tok-new', storedUser)).rejects.toThrow();
    await expect(session.getStoredToken()).resolves.toBe('tok-old');
    expect(mockKeychain.items.get('auth.token')).toBe('tok-old');
  });
});
