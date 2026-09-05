// -----------------------------------------------------------
//  [*] Tests — AuthContext session rules
//
//  The load-bearing rule: only a 401/403 means the stored
//  token is dead. Anything else — offline, timeout, 5xx —
//  says nothing about the session and must NOT log the user
//  out. Plus the reducer's LOGOUT reset, which is what every
//  session drop ultimately runs through.
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
  getStoredUser: jest.fn(async () => null),
  setStoredSession: jest.fn(),
  clearStoredSession: jest.fn(),
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
