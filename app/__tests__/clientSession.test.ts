// -----------------------------------------------------------
//  [*] Tests — client.ts session-death detection
//
//  The 401 interceptor contract AuthContext's teardown hangs
//  off: emits once per burst, only for the CURRENT token, only
//  outside the auth endpoints, for any 401 plus the
//  account-deactivated 403 — and never for guests or stale
//  tokens.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockEmit = jest.fn();
jest.mock('@/services/api/session-events', () => ({
  emitSessionInvalid: () => mockEmit(),
  onSessionInvalid: () => () => {},
}));

const mockStoredToken = { value: 'live-token' as string | null };
jest.mock('@/services/session', () => ({
  getStoredToken: async () => mockStoredToken.value,
  getStoredUser: async () => null,
  setStoredSession: async () => {},
  clearStoredSession: async () => {},
}));

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { api } from '@/services/api/client';


// Drives a real axios dispatch so the response interceptors
// run: the adapter rejects with the given HTTP failure
const failWith = (status: number, body: unknown) => {
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const response = {
      data: body,
      status,
      statusText: 'Error',
      headers: {},
      config,
    };
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response as never);
  };
};

const fire = async (url: string, token: string | null) => {
  try {
    await api.get(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  } catch {
    // Every call here is meant to fail — the emission is the assertion
  }
};

// The burst window is 2 s of real Date.now — march the clock
// forward so each test starts outside the previous burst
let clock = Date.parse('2026-08-29T12:00:00Z');
beforeEach(() => {
  jest.useFakeTimers();
  clock += 60_000;
  jest.setSystemTime(clock);
  mockEmit.mockClear();
  mockStoredToken.value = 'live-token';
});
afterEach(() => {
  jest.useRealTimers();
});


describe('session-death interceptor', () => {
  it('emits for a 401 carrying the current token', async () => {
    failWith(401, { error: 'Invalid session' });
    await fire('/news', 'live-token');
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('emits once per burst, then again after the window', async () => {
    failWith(401, { error: 'Invalid session' });
    await fire('/news', 'live-token');
    await fire('/chat/conversations', 'live-token');
    await fire('/social/friends', 'live-token');
    expect(mockEmit).toHaveBeenCalledTimes(1);

    jest.setSystemTime((clock += 3_000));
    await fire('/news', 'live-token');
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });

  it('never emits for the auth endpoints', async () => {
    failWith(401, { error: 'Invalid credentials' });
    await fire('/auth/login', 'live-token');
    await fire('/auth/register', 'live-token');
    await fire('/auth/validate-code', 'live-token');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('ignores a stale token rejected after a fresh login', async () => {
    failWith(401, { error: 'Invalid session' });
    await fire('/news', 'old-dead-token');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('ignores guest requests entirely', async () => {
    // A guest has no STORED token either — the request
    // interceptor would otherwise attach the stored one
    mockStoredToken.value = null;
    failWith(401, { error: 'Auth required' });
    await fire('/news', null);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('ignores 401s once the stored session is already gone', async () => {
    mockStoredToken.value = null;
    failWith(401, { error: 'Invalid session' });
    await fire('/news', 'live-token');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('treats the account-deactivated 403 as session death, generic 403s not', async () => {
    failWith(403, { error: 'Account deactivated' });
    await fire('/news', 'live-token');
    expect(mockEmit).toHaveBeenCalledTimes(1);

    jest.setSystemTime((clock += 3_000));
    failWith(403, { error: 'Admin access required' });
    await fire('/admin/users', 'live-token');
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });
});
